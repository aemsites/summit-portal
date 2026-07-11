/**
 * POC engagement tracker — Google Sheet backend ('sheet' mode).
 *
 * Works on ANY shared page. A visit counts as "shared" when the URL carries a
 * ?v= attribution marker staff add when sharing (e.g. ?v=nike). With no Worker
 * there is no auth session, so ?v is our only notion of "who".
 *
 * Events are sent with navigator.sendBeacon (fire-and-forget, no CORS preflight)
 * to the Apps Script /exec URL. POC only; production is the Worker tracker.
 */

import { POC_INGEST_URL } from './analytics-config.js';
import { startCapture, getAttribution } from './engagement-capture.js';

function send(payload) {
  try {
    // text/plain avoids a CORS preflight; Apps Script reads the raw body.
    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(POC_INGEST_URL, blob);
      return;
    }
    fetch(POC_INGEST_URL, {
      method: 'POST',
      body: blob,
      keepalive: true,
      mode: 'no-cors',
    }).catch(() => {});
  } catch { /* never let tracking throw */ }
}

export default function mount() {
  const viewer = getAttribution();
  // Gate: only shared opens (links staff tagged with ?v=) are tracked, so
  // ordinary internal browsing generates nothing.
  if (!viewer) return;
  startCapture({ sink: send, viewer });
}
