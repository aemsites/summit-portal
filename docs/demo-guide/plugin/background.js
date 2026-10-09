/* global chrome */
import { matchUrl, screens } from './routes.js';

const subscribers = new Map();
const expectedDisconnect = (error) => /Receiving end does not exist|No tab with id|Could not establish connection/.test(error.message);

function publish(windowId, state) {
  subscribers.forEach((id, port) => {
    if (id === windowId) port.postMessage({ type: 'SCREEN', state });
  });
}

async function refresh(windowId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    const screen = matchUrl(tab?.url);
    if (!screen) {
      publish(windowId, null);
      return;
    }
    let state = { screen, example: tab.url.startsWith('https://act.aem.now/example-report/'), connected: false };
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'READ_SCREEN' });
      if (screens[response?.screen]) {
        state = { screen: response.screen, example: response.example === true, connected: true };
      }
    } catch (error) {
      if (!expectedDisconnect(error)) throw error;
    }
    publish(windowId, state);
  } catch (error) {
    console.error('[Booth guide] Screen sync failed', error);
    publish(windowId, { error: 'Screen sync failed. Reload the booth tab and reopen the guide.' });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'booth-guide') return;
  port.onMessage.addListener((message) => {
    if (message.type !== 'SUBSCRIBE' || !Number.isInteger(message.windowId)) return;
    subscribers.set(port, message.windowId);
    refresh(message.windowId);
  });
  port.onDisconnect.addListener(() => subscribers.delete(port));
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'BOOTH_SCREEN' || !sender.tab?.active
    || !matchUrl(sender.tab.url) || !screens[message.screen]) return;
  const state = { screen: message.screen, example: message.example === true, connected: true };
  publish(sender.tab.windowId, state);
});

chrome.tabs.onActivated.addListener(({ windowId }) => refresh(windowId));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) refresh(tab.windowId);
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Booth guide] Cannot enable toolbar action', error));
});
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Booth guide] Cannot enable toolbar action', error));
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Booth guide] Cannot enable toolbar action', error));
