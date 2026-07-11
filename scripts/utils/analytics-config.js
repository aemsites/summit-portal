/**
 * Engagement-analytics configuration.
 *
 * ANALYTICS_MODE selects the capture + storage backend:
 *   'worker' — (default, production) events POST to /auth/analytics on the
 *              Cloudflare auth Worker, which attributes them from the
 *              authenticated session and stores them in KV.
 *   'sheet'  — (POC) events sent via a Google Apps Script web app that appends
 *              rows to a Google Sheet; dashboard reads the published CSV. No
 *              Worker, no auth session; attribution comes from a ?v= URL marker.
 *   'local'  — (POC) events kept in this browser's localStorage only; dashboard
 *              reads the same store. Zero setup, no accounts — but data never
 *              leaves the device, so it's for a self-contained local demo.
 *
 * Default is 'worker' so the committed default is always production. Change it
 * LOCALLY (do not commit a non-worker value) to exercise a POC backend.
 * See tools/analytics-poc/README.md.
 */

export const ANALYTICS_MODE = 'worker';

// --- 'sheet' mode (fill in from your own Apps Script deployment) ---
// Apps Script web-app /exec URL (POST target for capturing events).
export const POC_INGEST_URL = 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec';
// Google Sheet "Publish to web" CSV URL (read source for the dashboard).
export const POC_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/REPLACE_WITH_PUBLISHED_ID/pub?output=csv';

// --- 'local' mode ---
// localStorage key holding the captured event array on this device.
export const LOCAL_STORAGE_KEY = 'engagement-analytics-poc';
