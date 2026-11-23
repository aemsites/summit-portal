import { authenticateDihJson } from './dih-sharelink.js';

export const REPORT_REQUEST_CAMPAIGNS_PATH = '/api/report-request-campaigns/dih';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export function normalizePublicCampaignId(value) {
  return typeof value === 'string' && value.length === 36 && UUID_V4.test(value) ? value : null;
}

function failure(error, status) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

export async function handleReportRequestCampaigns(request, env) {
  const { payload, response: authError } = await authenticateDihJson(request, {
    endpoint: REPORT_REQUEST_CAMPAIGNS_PATH,
    secret: env.DIH_SHARE_LINK_SECRET,
    configurationError: 'DIH report request campaign sync is not configured',
    maxBodyBytes: 256 * 1024, // Above the Hub's 128 KiB campaign document budget.
  });
  if (authError) return authError;

  const { publicCampaignId, hubCampaignId, campaignName } = payload || {};
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length !== 3
    || !normalizePublicCampaignId(publicCampaignId)
    || typeof hubCampaignId !== 'string' || !hubCampaignId.trim()
    || hubCampaignId === '.' || hubCampaignId === '..' || !hubCampaignId.isWellFormed()
    || typeof campaignName !== 'string' || !campaignName.trim()) {
    return failure('Expected a valid publicCampaignId, hubCampaignId and campaignName.', 400);
  }

  const db = env.REPORT_REQUESTS;
  if (!db?.batch) return failure('Report request campaigns are unavailable.', 503);

  try {
    const [, { results: [stored] }] = await db.batch([
      db.prepare(`INSERT INTO report_request_campaigns (public_campaign_id, hub_campaign_id, campaign_name)
        VALUES (?, ?, ?) ON CONFLICT (public_campaign_id) DO NOTHING`)
        .bind(publicCampaignId, hubCampaignId, campaignName),
      db.prepare(`SELECT hub_campaign_id, campaign_name
        FROM report_request_campaigns WHERE public_campaign_id = ?`).bind(publicCampaignId),
    ]);
    if (!stored) return failure('Report request campaigns are unavailable.', 503);
    if (stored.hub_campaign_id !== hubCampaignId || stored.campaign_name !== campaignName) {
      return failure('Campaign mapping already exists with different data.', 409);
    }
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch {
    return failure('Report request campaigns are unavailable.', 503);
  }
}
