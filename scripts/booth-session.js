export const BOOTH_INACTIVITY_MS = 15 * 60 * 1000;
const RENEW_INTERVAL_MS = 30000;

export async function boothRequest(action, body) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(action === 'send'
        ? 'Sending timed out. Delivery could not be confirmed. Clear this screen and ask the booth team before sending again.'
        : 'The booth service timed out. Retry and clear this screen, or ask the booth team.');
      error.code = 'timeout';
      reject(error);
      controller.abort();
    }, 10000);
  });
  const operation = async () => {
    const response = await fetch(`/auth/booth/${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'Booth service unavailable. Ask the booth team.');
      error.status = response.status;
      error.code = result.code;
      error.expiresAt = result.expiresAt;
      throw error;
    }
    return result;
  };
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Renew only for visitor input, never for passive polling or report asset requests. */
export function createBoothInactivity({ reset, onError, track = () => {} }) {
  let idle;
  let deadline;
  let renewal;
  let expiresAt = 0;
  let renewable = false;
  let lastActivity = Date.now();
  let nextRenewal = 0;
  let revision = 0;
  let pending = false;
  let renew;

  function setExpiry(value, canRenew = true) {
    expiresAt = Number.isFinite(value) ? value : 0;
    renewable = canRenew && expiresAt > 0;
    clearTimeout(deadline);
    if (expiresAt) deadline = setTimeout(reset, Math.max(0, expiresAt - Date.now()));
  }

  function scheduleRenewal() {
    if (!renewable || pending) return;
    clearTimeout(renewal);
    const delay = Math.min(
      Math.max(0, nextRenewal - Date.now()),
      Math.max(0, expiresAt - Date.now() - 10000),
    );
    renewal = setTimeout(renew, delay);
  }

  renew = async () => {
    const current = revision;
    const activityAt = lastActivity;
    const idleMs = Math.max(0, Date.now() - activityAt);
    if (!renewable || idleMs >= BOOTH_INACTIVITY_MS) return;
    pending = true;
    nextRenewal = Date.now() + RENEW_INTERVAL_MS;
    const operation = boothRequest('activity', { idleMs });
    track(operation);
    try {
      const result = await operation;
      if (current !== revision) return;
      if (!Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) {
        throw new Error('This booth visit has expired. Retry and clear the screen.');
      }
      setExpiry(result.expiresAt);
    } catch (error) {
      if (current === revision) {
        renewable = false;
        onError(error);
      }
    } finally {
      if (current === revision) {
        pending = false;
        if (lastActivity !== activityAt) scheduleRenewal();
      }
    }
  };

  return {
    setExpiry,
    activity(renewVisit = true) {
      lastActivity = Date.now();
      clearTimeout(idle);
      idle = setTimeout(reset, BOOTH_INACTIVITY_MS);
      if (renewVisit) scheduleRenewal();
    },
    stop() {
      revision += 1;
      pending = false;
      renewable = false;
      expiresAt = 0;
      nextRenewal = 0;
      clearTimeout(idle);
      clearTimeout(deadline);
      clearTimeout(renewal);
    },
  };
}
