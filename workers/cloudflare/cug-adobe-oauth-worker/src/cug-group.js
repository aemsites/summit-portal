export function normalizeCugGroup(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * With no explicit grants, match an asserted email or its domain. With signed
 * session grants, never infer an additional domain from an exact-email grant.
 */
export function matchesCugGroup(group, email, grants) {
  const allowed = normalizeCugGroup(group);
  const identity = normalizeCugGroup(email);
  if (!allowed) return false;
  if (allowed.includes('@') && allowed === identity) return true;
  const groups = grants === undefined ? [identity.split('@')[1]] : grants;
  return Array.isArray(groups) && groups.some((value) => normalizeCugGroup(value) === allowed);
}
