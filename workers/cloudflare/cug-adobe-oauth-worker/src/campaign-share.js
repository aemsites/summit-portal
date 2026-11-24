/* global HTMLRewriter */
import normalizePublicCampaignId, { canonicalCampaignReportPath } from './campaign-id.js';
import { isCampaignShareAnalyticsConfigured, readBody } from './dih-sharelink.js';
import { getSession, signCampaignShareContext, verifyCampaignShareContext } from './session.js';

export const CAMPAIGN_SHARE_CONTEXT = 'share_context';
export const CAMPAIGN_SHARE_ACTIVITY_PATH = '/auth/campaign-share';
export const CAMPAIGN_SHARE_COOKIE_PREFIX = 'campaign_share_';
const NAVIGATION = 'campaign-share-navigation';
const ACTIVITY = 'campaign-share-activity';
const EVENTS = ['report_viewed', 'report_scroll', 'report_download'];
const encoder = new TextEncoder();
const nowSeconds = () => Math.floor(Date.now() / 1000);

function logFailure(message) {
  // eslint-disable-next-line no-console
  console.warn('[campaign-share]', message);
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reportId(env, campaign, path) {
  return hmac(env.DIH_SHARE_LINK_SECRET, `dih-campaign-share-report-v1\n${campaign}\n${path}`);
}

function sessionScope(env, { email, groups = [] }) {
  // The equivalent grant in another tab must not invalidate this tab's proof.
  return hmac(env.JWT_SECRET, `campaign-share-session-v1\n${JSON.stringify([email, [...groups].sort()])}`);
}

export async function campaignShareNavigation(url, claims, env) {
  const path = canonicalCampaignReportPath(url.pathname);
  if (!path || path !== claims.campaign?.path || !normalizePublicCampaignId(claims.campaign.id)
    || !Number.isSafeInteger(claims.exp)) return null;

  const target = new URL(`${path}/`, url.origin);
  let contextCookie;
  if (isCampaignShareAnalyticsConfigured(env)) {
    try {
      const selector = crypto.randomUUID();
      const expiresAt = Math.min(claims.exp, nowSeconds() + 3600);
      const proof = await signCampaignShareContext(env, NAVIGATION, {
        selector,
        campaign: claims.campaign.id,
        report: await reportId(env, claims.campaign.id, path),
        exp: expiresAt,
      });
      // The URL contains only a selector; the signed context never reaches page scripts or RUM.
      target.searchParams.set(CAMPAIGN_SHARE_CONTEXT, selector);
      contextCookie = `${CAMPAIGN_SHARE_COOKIE_PREFIX}${selector}=${proof}; Path=${target.pathname}; HttpOnly; Secure; SameSite=Lax; Max-Age=${expiresAt - nowSeconds() + 1}`;
    } catch {
      logFailure('Navigation attribution unavailable');
    }
  }
  return { href: target.href, contextCookie };
}

export async function injectCampaignShare(response, request, session, env) {
  if (!isCampaignShareAnalyticsConfigured(env) || !session
    || request.method !== 'GET' || response.status !== 200
    || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'text/html') {
    return response;
  }
  const url = new URL(request.url);
  const path = canonicalCampaignReportPath(url.pathname);
  const selectors = url.searchParams.getAll(CAMPAIGN_SHARE_CONTEXT);
  if (!path || selectors.length !== 1 || !normalizePublicCampaignId(selectors[0])) return response;
  const [selector] = selectors;
  const prefix = `${CAMPAIGN_SHARE_COOKIE_PREFIX}${selector}=`;
  const cookie = (request.headers.get('Cookie') || '').split(';')
    .map((pair) => pair.trim()).find((pair) => pair.startsWith(prefix));
  try {
    const context = await verifyCampaignShareContext(cookie?.slice(prefix.length), env, NAVIGATION);
    if (context?.selector !== selector
      || context.report !== await reportId(env, context.campaign, path)) return response;
    const proof = await signCampaignShareContext(env, ACTIVITY, {
      campaign: context.campaign,
      report: context.report,
      scope: await sessionScope(env, session),
      exp: Math.min(context.exp, session.exp),
    });
    response.headers.set('Referrer-Policy', 'no-referrer');
    return new HTMLRewriter().on('head', {
      element(head) {
        head.prepend(`<script type="module" src="/scripts/campaign-share.js" data-campaign-share="${proof}"></script>`, { html: true });
      },
    }).transform(response);
  } catch {
    logFailure('Report instrumentation unavailable');
    return response;
  }
}

async function countCampaignShare(env, event, context, depth) {
  try {
    const response = await fetch('https://queue.simpleanalyticscdn.com/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'event',
        hostname: env.BOOTH_ANALYTICS_HOSTNAME,
        event: `campaign_share_${event}`,
        path: '/campaign-share',
        ua: 'ServerSide/1.0 (+https://act.aem.now/)',
        metadata: {
          campaign_id: context.campaign,
          report_id: context.report,
          ...(event === 'report_scroll' ? { scroll_depth: depth } : {}),
        },
      }),
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    });
    if (!response.ok) logFailure('Anonymous analytics rejected event');
  } catch {
    logFailure('Anonymous analytics unavailable');
  }
}

export async function handleCampaignShareActivity(request, env, ctx) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reply = (status) => new Response(null, { status, headers });
  if (request.method !== 'POST') {
    headers.Allow = 'POST';
    return reply(405);
  }
  if (request.headers.get('Origin') !== new URL(request.url).origin) return reply(403);
  if (request.headers.get('Content-Type') !== 'application/json') return reply(415);
  let data;
  try {
    const body = await readBody(request, 2048);
    if (body.oversized) return reply(413);
    data = JSON.parse(body.text);
  } catch {
    return reply(400);
  }
  const { event, proof, scroll_depth: depth } = data || {};
  const scroll = event === 'report_scroll';
  if (!EVENTS.includes(event) || typeof proof !== 'string'
    || Object.keys(data).length !== (scroll ? 3 : 2)
    || (scroll && ![25, 50, 75, 100].includes(depth))) return reply(400);
  const session = await getSession(request, env);
  const context = session && await verifyCampaignShareContext(proof, env, ACTIVITY);
  if (!context || context.scope !== await sessionScope(env, session)) return reply(403);
  if (isCampaignShareAnalyticsConfigured(env) && ctx) {
    ctx.waitUntil(countCampaignShare(env, event, context, depth));
  }
  return reply(204);
}
