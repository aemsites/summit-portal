/**
 * Engagement analytics POC — Google Apps Script backend.
 *
 * Paste this into a Google Apps Script project bound to (or referencing) a
 * Google Sheet, then deploy as a Web App ("Execute as: Me", "Who has access:
 * Anyone"). The /exec URL becomes POC_INGEST_URL in scripts/utils/analytics-config.js.
 *
 * doPost  — appends one row per event (called by sharelink-tracking-poc.js).
 * doGet   — optional JSON read-back; the dashboard uses the published CSV instead,
 *           but this is handy for quick manual checks.
 *
 * This is POC-only. No auth: the endpoint is public and anyone with the URL can
 * append rows. Fine for a private proof of concept; never use in production.
 */

var SHEET_NAME = 'events';
var HEADERS = [
  'timestamp', 'path', 'event', 'v', 'view_id',
  'depth', 'duration_seconds', 'href', 'text', 'block', 'download', 'device', 'referrer',
];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var sheet = getSheet_();
    var row = HEADERS.map(function (key) {
      if (key === 'timestamp') return new Date().toISOString();
      var val = body[key];
      return (val === undefined || val === null) ? '' : val;
    });
    sheet.appendRow(row);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var headers = values.shift() || [];
  var data = values.map(function (r) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = r[i]; });
    return obj;
  });
  return ContentService
    .createTextOutput(JSON.stringify({ total: data.length, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}
