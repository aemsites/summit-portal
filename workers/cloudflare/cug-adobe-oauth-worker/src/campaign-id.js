const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export default function normalizePublicCampaignId(value) {
  return typeof value === 'string' && value.length === 36 && UUID_V4.test(value) ? value : null;
}

export function canonicalCampaignReportPath(path) {
  const canonical = path.replace(/\/$/, '');
  return /^\/accounts\/[a-z0-9-]+\/[a-z0-9-]+\/insights\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(canonical)
    ? canonical : null;
}
