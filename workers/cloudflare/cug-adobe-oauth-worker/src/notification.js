const IMS_HOSTS = {
  prod: 'https://ims-na1.adobelogin.com',
  stage: 'https://ims-na1-stg1.adobelogin.com',
};

const APO_HOSTS = {
  prod: 'https://postoffice.adobe.com',
  stage: 'https://stage.postoffice.adobe.com',
};

const ADMIN_EMAIL = 'aemsitestrial@adobe.com';

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function getImsToken(env) {
  const imsHost = IMS_HOSTS[env.ENVIRONMENT] ?? IMS_HOSTS.stage;
  const params = new URLSearchParams({
    client_id: env.APO_CLIENT_ID,
    client_secret: env.APO_CLIENT_SECRET,
    scope: env.APO_SCOPE,
  });
  if (env.APO_AUTHORIZATION_CODE) {
    params.set('grant_type', 'authorization_code');
    params.set('code', env.APO_AUTHORIZATION_CODE);
  } else {
    params.set('grant_type', 'client_credentials');
  }

  const resp = await fetch(`${imsHost}/ims/token/v3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) throw new Error(`IMS auth failed: ${resp.status}`);
  const { access_token } = await resp.json();
  if (!access_token) throw new Error('IMS response missing access_token');
  return access_token;
}

async function sendApoEmail({
  templateName, toEmails, ccEmails = [], data, env,
}) {
  const token = await getImsToken(env);
  const apoHost = APO_HOSTS[env.ENVIRONMENT] ?? APO_HOSTS.stage;

  const dataXml = Object.entries(data)
    .map(([k, v]) => `<data><key>${xmlEscape(k)}</key><value>${xmlEscape(v)}</value></data>`)
    .join('');
  const ccBlock = ccEmails.length
    ? `<ccList>${ccEmails.map(xmlEscape).join(',')}</ccList>`
    : '';
  const toList = toEmails.map(xmlEscape).join(',');
  const body = `<sendTemplateEmailReq><toList>${toList}</toList>${ccBlock}<templateData>${dataXml}</templateData></sendTemplateEmailReq>`;

  const resp = await fetch(
    `${apoHost}/po-server/message?templateName=${encodeURIComponent(templateName)}&locale=en-us`,
    {
      method: 'POST',
      headers: {
        Authorization: `IMS ${token}`,
        Accept: 'application/xml',
        'Content-Type': 'application/xml',
      },
      body,
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!resp.ok) throw new Error(`APO request failed: ${resp.status}`);
  const text = await resp.text();
  if (!text.includes('status="OK"')) throw new Error('APO returned non-OK status');
}

export async function sendMagicLinkConfirm(email, magicLinkUrl, env) {
  await sendApoEmail({
    templateName: 'expdev_actnow_magiclink',
    toEmails: [email],
    data: { magic_link: magicLinkUrl, email },
    env,
  });
}

export async function sendMagicLinkNotFound(email, env) {
  await sendApoEmail({
    templateName: 'expdev_portal_magic_link_notify',
    toEmails: [ADMIN_EMAIL],
    data: { email },
    env,
  });
}
