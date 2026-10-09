export const BOOTH_INACTIVITY_MS = 15 * 60 * 1000;
const RENEW_BEFORE_EXPIRY_MS = 3 * 60 * 1000;
const RETRY_INTERVAL_MS = 30000;

export async function boothRequest(action, body) {
  const controller = new AbortController();
  let timer;
  let responseStatus;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(action === 'send'
        ? 'Sending timed out. Delivery could not be confirmed. Clear this screen and ask the booth team before sending again.'
        : 'The booth service timed out. Retry and clear this screen, or ask the booth team.');
      error.code = 'timeout';
      error.status = responseStatus;
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
    responseStatus = response.status;
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
  } catch (error) {
    if (responseStatus >= 400) error.status = responseStatus;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Renew only for visitor input, never for passive polling or report asset requests. */
export function createBoothInactivity(options) {
  const { reset, onError, onConnectionChange = () => {}, track = () => {} } = options;
  let idle;
  let deadline;
  let renewal;
  let expiresAt = 0;
  let renewable = false;
  let lastActivity = Date.now();
  let retryAt = 0;
  let needsRenewal = false;
  let disconnected = false;
  let revision = 0;
  let pending = false;
  let renew;

  function scheduleRenewal() {
    if (!renewable || pending || !needsRenewal) return;
    clearTimeout(renewal);
    const due = Math.max(expiresAt - RENEW_BEFORE_EXPIRY_MS, retryAt, Date.now());
    if (due < expiresAt) renewal = setTimeout(renew, due - Date.now());
  }

  function setExpiry(value, canRenew = true) {
    expiresAt = Number.isFinite(value) ? value : 0;
    renewable = canRenew && expiresAt > 0;
    clearTimeout(deadline);
    clearTimeout(renewal);
    if (expiresAt) deadline = setTimeout(reset, Math.max(0, expiresAt - Date.now()));
    scheduleRenewal();
  }

  function temporary(error) {
    if (error.status >= 400) {
      return error.status === 408 || error.status === 429 || error.status >= 500;
    }
    return error.code === 'timeout' || error instanceof TypeError || error instanceof SyntaxError;
  }

  renew = async () => {
    const current = revision;
    const activityAt = lastActivity;
    const idleMs = Math.max(0, Date.now() - activityAt);
    if (!renewable || !needsRenewal || idleMs >= BOOTH_INACTIVITY_MS
      || expiresAt <= Date.now()) return;
    pending = true;
    const operation = boothRequest('activity', { idleMs });
    track(operation);
    try {
      const result = await operation;
      if (current !== revision) return;
      if (expiresAt <= Date.now()) {
        reset();
        return;
      }
      if (!Number.isFinite(result?.expiresAt) || result.expiresAt <= Date.now()) {
        throw new Error('This booth visit has expired or could not be verified. Retry and clear the screen.');
      }
      needsRenewal = lastActivity !== activityAt;
      retryAt = 0;
      setExpiry(result.expiresAt);
      if (disconnected) {
        disconnected = false;
        onConnectionChange(null);
      }
    } catch (error) {
      if (current === revision) {
        if (temporary(error) && expiresAt > Date.now()) {
          retryAt = Date.now() + RETRY_INTERVAL_MS;
          disconnected = true;
          console.warn('[booth] Renewal temporarily unavailable; retrying within confirmed access.', { status: error.status, code: error.code });
          onConnectionChange(error);
        } else {
          renewable = false;
          needsRenewal = false;
          onError(error);
        }
      }
    } finally {
      if (current === revision) {
        pending = false;
        scheduleRenewal();
      }
    }
  };

  return {
    setExpiry,
    activity(renewVisit = true) {
      lastActivity = Date.now();
      clearTimeout(idle);
      idle = setTimeout(reset, BOOTH_INACTIVITY_MS);
      if (renewVisit) {
        needsRenewal = true;
        scheduleRenewal();
      }
    },
    stop() {
      revision += 1;
      pending = false;
      renewable = false;
      expiresAt = 0;
      retryAt = 0;
      needsRenewal = false;
      clearTimeout(idle);
      clearTimeout(deadline);
      clearTimeout(renewal);
      if (disconnected) {
        disconnected = false;
        onConnectionChange(null);
      }
    },
  };
}
