/**
 * POC engagement tracker — localStorage backend ('local' mode).
 *
 * Zero setup, no accounts, no network: every event is appended to this
 * browser's localStorage, and the dashboard reads the same store. Data never
 * leaves the device — a self-contained local demo, not real cross-user capture.
 *
 * Unlike 'sheet' mode this does NOT require a ?v= marker (so you can just browse
 * pages and watch data accumulate); if ?v= is present it's used as the viewer,
 * otherwise events are attributed to 'local'.
 */

import { LOCAL_STORAGE_KEY } from './analytics-config.js';
import { startCapture, getAttribution } from './engagement-capture.js';

const MAX_EVENTS = 2000;

function append(event) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const events = raw ? JSON.parse(raw) : [];
    events.push({ ...event, timestamp: new Date().toISOString() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(events));
  } catch { /* localStorage disabled/full — degrade silently */ }
}

export default function mount() {
  const viewer = getAttribution() || 'local';
  startCapture({ sink: append, viewer });
}
