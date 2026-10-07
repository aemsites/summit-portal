import { describe, it, expect, vi, afterEach } from 'vitest';
import createBoothTiming from '../src/booth-timing.js';

describe('booth request timings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accumulates durations and preserves the original error on failure', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const timing = createBoothTiming({ BOOTH_TIMING_ENABLED: 'true' });
    expect(await timing.measure('booth_kv_read', async () => {
      now += 12;
      return 'record';
    })).toBe('record');
    const error = new Error('KV unavailable');
    await expect(timing.measure('booth_kv_read', async () => {
      now += 7;
      throw error;
    })).rejects.toBe(error);
    const response = timing.response(new Response('{}', { status: 502 }));
    expect(response.status).toBe(502);
    expect(response.headers.get('Server-Timing')).toBe('booth_kv_read;dur=19.0');
  });

  it('labels CPU-only timing as unavailable even when the clock appears to advance', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const timing = createBoothTiming({ BOOTH_TIMING_ENABLED: 'true' });
    expect(timing.sync('booth_match', () => {
      now += 2000;
      return ['candidate'];
    })).toEqual(['candidate']);
    timing.rows('index', 4000);
    expect(timing.response(new Response()).headers.get('Server-Timing')).toBe(
      'booth_match;desc="CPU timing unavailable", booth_index_rows;desc="4000 rows"',
    );
  });

  it('does not expose arbitrary names or non-numeric row counts', () => {
    const timing = createBoothTiming({ BOOTH_TIMING_ENABLED: 'true' });
    expect(() => timing.add('visitor@example.com', 2)).toThrow(TypeError);
    expect(() => timing.rows('/accounts/e/example', 3)).toThrow(TypeError);
    expect(() => timing.rows('index', 'visitor@example.com')).toThrow(TypeError);
    expect(timing.response(new Response()).headers.get('Server-Timing')).toBeNull();
  });

  it('keeps unauthorized responses uninstrumented and requires explicit enablement', async () => {
    const timing = createBoothTiming({ BOOTH_TIMING_ENABLED: 'true' });
    await timing.measure('booth_auth', async () => null);
    expect(timing.response(new Response('{}', { status: 401 })).headers.get('Server-Timing')).toBeNull();
    for (const setting of [undefined, 'false', true]) {
      const disabled = createBoothTiming({ BOOTH_TIMING_ENABLED: setting });
      expect(await disabled.measure('booth_auth', async () => 'ok')).toBe('ok');
      disabled.rows('index', 4000);
      expect(disabled.response(new Response()).headers.get('Server-Timing')).toBeNull();
    }
  });

  it('preserves native storage method binding, arguments and results', async () => {
    const storage = {
      value: { state: 'report' },
      async get(key) {
        expect(this).toBe(storage);
        expect(key).toBe('context');
        return this.value;
      },
    };
    const timing = createBoothTiming({ BOOTH_TIMING_ENABLED: 'true' });
    expect(await timing.storage(storage).get('context')).toBe(storage.value);
    expect(timing.response(new Response()).headers.get('Server-Timing')).toContain('booth_storage;dur=');
    expect(createBoothTiming().storage(storage)).toBe(storage);
  });
});
