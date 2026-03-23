import { loadFragment } from '../fragment/fragment.js';

const MAPPING_PATH = '/closed-user-groups-mapping.json';

async function getUserGroups() {
  const resp = await fetch('/auth/me');
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.authenticated ? data.groups : null;
}

async function getGroupUrl(userGroups) {
  const resp = await fetch(MAPPING_PATH);
  if (!resp.ok) return null;
  const { data } = await resp.json();
  const entries = Array.isArray(data) ? data : [];
  const match = entries.find((entry) => {
    const group = (entry.group || '').trim();
    return userGroups.includes(group);
  });
  return match ? match.url : null;
}

export default async function init(el) {
  try {
    const userGroups = await getUserGroups();
    if (!userGroups?.length) { el.remove(); return; }

    const url = await getGroupUrl(userGroups);
    if (!url) { el.remove(); return; }

    const fragment = await loadFragment(`${url}/teaser`);
    el.textContent = '';
    el.append(fragment);
  } catch {
    el.remove();
  }
}
