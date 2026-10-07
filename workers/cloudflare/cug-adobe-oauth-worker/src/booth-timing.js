const METRICS = new Set([
  'booth_total', 'booth_auth', 'booth_rpc', 'booth_queue', 'booth_actor',
  'booth_actor_auth', 'booth_storage', 'booth_kv_read', 'booth_kv_write',
  'booth_kv_delete', 'booth_d1', 'booth_match',
  'booth_index_fetch', 'booth_index_body',
  'booth_cugs_fetch', 'booth_cugs_body',
  'booth_mapping_fetch', 'booth_mapping_body',
]);

/** Request-local durations only; never accept identity/path-derived metric names. */
export default function createBoothTiming(env = {}) {
  const enabled = env.BOOTH_TIMING_ENABLED === 'true';
  const metrics = new Map();
  const rowCounts = new Map();
  const now = () => (enabled ? performance.now() : 0);
  const add = (name, duration) => {
    if (!enabled) return;
    if (!METRICS.has(name)) throw new TypeError('Unknown booth timing metric');
    metrics.set(name, (metrics.get(name) || 0) + Math.max(0, duration));
  };
  const measure = async (name, task) => {
    const start = now();
    try {
      return await task();
    } finally {
      add(name, now() - start);
    }
  };
  return {
    now,
    add,
    measure,
    sync(name, task) {
      const start = now();
      try {
        return task();
      } finally {
        add(name, now() - start);
      }
    },
    rows(dataset, count) {
      if (!enabled) return;
      if (!['index', 'cugs', 'mapping'].includes(dataset) || !Number.isInteger(count) || count < 0) {
        throw new TypeError('Invalid booth timing row count');
      }
      rowCounts.set(dataset, count);
    },
    storage(target) {
      if (!enabled) return target;
      return Object.fromEntries(['get', 'put', 'delete', 'setAlarm'].map((method) => [
        method, (...args) => measure('booth_storage', () => target[method](...args)),
      ]));
    },
    response(response) {
      if (enabled && response.status !== 401 && metrics.size) {
        // Cloudflare's clock is frozen during synchronous CPU work.
        const header = [
          ...[...metrics].map(([name, duration]) => (name === 'booth_match'
            ? 'booth_match;desc="CPU timing unavailable"'
            : `${name};dur=${duration.toFixed(1)}`)),
          ...[...rowCounts].map(([dataset, count]) => `booth_${dataset}_rows;desc="${count} rows"`),
        ].join(', ');
        response.headers.append('Server-Timing', header);
      }
      return response;
    },
  };
}
