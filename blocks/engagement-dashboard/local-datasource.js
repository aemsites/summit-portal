/**
 * 'local' mode data source: reads raw events from this browser's localStorage
 * and aggregates them (via aggregate.js) into the shapes the dashboard expects.
 * Data is device-local only. POC. See tools/analytics-poc/README.md.
 */

import { LOCAL_STORAGE_KEY } from '../../scripts/utils/analytics-config.js';
import { aggregateGlobal, aggregateDetail } from './aggregate.js';

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export async function loadGlobalLocal() {
  return aggregateGlobal(loadEvents());
}

export async function loadDetailLocal(path) {
  return aggregateDetail(loadEvents(), path);
}

/** Wipe the device-local event store (used by the dashboard's Clear button). */
export function clearLocal() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch { /* nothing to clear */ }
}
