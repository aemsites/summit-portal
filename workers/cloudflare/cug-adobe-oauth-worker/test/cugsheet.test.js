import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cugSheetGroups, parseCugSheetRows, matchSheetGroups, compileSheetGroups, resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv } from './helpers.js';

// A miniature of the real sheet: global guards, the catch-all `/accounts**`
// staff rule, one account with a customer domain, and one with blank groups.
const ROWS = [
  { url: '/accounts**', 'cug-required': 'true', 'cug-groups': 'adobe.com, semrush.com' },
  { url: '/data/**', 'cug-required': 'true', 'cug-groups': 'adobe.com, semrush.com' },
  { url: '/accounts/f/freshpet**', 'cug-required': '', 'cug-groups': 'adobe.com, semrush.com, freshpet.com' },
  { url: '/accounts/r/redcross**', 'cug-required': '', 'cug-groups': '' },
  { url: '/closed-user-groups.json', 'cug-required': 'true', 'cug-groups': 'adobe.com' },
];

function sheetResponse(rows = ROWS, extra = {}) {
  return new Response(JSON.stringify({ total: rows.length, data: rows, ...extra }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cugsheet', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv({ ORIGIN_AUTHENTICATION: 'origin-token' });
    resetCugSheetCache();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('matching', () => {
    const entries = parseCugSheetRows(ROWS);

    it('prefers the most specific row over the catch-all', () => {
      expect(matchSheetGroups(entries, '/accounts/f/freshpet/insights/freshpet-com/portal-landing/'))
        .toEqual(['adobe.com', 'semrush.com', 'freshpet.com']);
    });

    it('falls through to the catch-all for an account with no row of its own', () => {
      expect(matchSheetGroups(entries, '/accounts/z/zzz-new/'))
        .toEqual(['adobe.com', 'semrush.com']);
    });

    it('skips rows with blank groups so they cannot shadow a broader row', () => {
      // `/accounts/r/redcross**` names no groups, so the DA tool emits no header
      // for it and `/accounts**` governs — the sheet must agree.
      expect(matchSheetGroups(entries, '/accounts/r/redcross/'))
        .toEqual(['adobe.com', 'semrush.com']);
    });

    it('matches a non-glob row exactly, not as a prefix', () => {
      expect(matchSheetGroups(entries, '/closed-user-groups.json')).toEqual(['adobe.com']);
      expect(matchSheetGroups(entries, '/closed-user-groups.json.bak')).toBeNull();
    });

    it('ignores a query string on the path', () => {
      expect(matchSheetGroups(entries, '/accounts/f/freshpet/?token=abc'))
        .toEqual(['adobe.com', 'semrush.com', 'freshpet.com']);
    });

    it('returns null when nothing matches', () => {
      expect(matchSheetGroups(entries, '/public/page')).toBeNull();
    });

    it('lower-cases and trims group domains', () => {
      const parsed = parseCugSheetRows([{ url: '/x**', 'cug-groups': ' Foo.COM , bar.com ' }]);
      expect(matchSheetGroups(parsed, '/x/y')).toEqual(['foo.com', 'bar.com']);
    });

    it('drops rows whose url is missing or not a path', () => {
      expect(parseCugSheetRows([
        { url: '', 'cug-groups': 'a.com' },
        { 'cug-groups': 'a.com' },
        { url: 'accounts/x**', 'cug-groups': 'a.com' },
      ])).toEqual([]);
    });
  });

  describe('scope', () => {
    it('leaves internal surfaces to the manually-applied header', async () => {
      const fetchMock = vi.fn().mockResolvedValue(sheetResponse([
        { url: '/adobe**', 'cug-groups': 'adobe.com, attacker.com' },
        { url: '/data/**', 'cug-groups': 'adobe.com, attacker.com' },
      ]));
      vi.stubGlobal('fetch', fetchMock);

      // A row naming these paths must not be able to open the staff dashboard
      // or the data sheets without someone running the DA tool.
      expect(await cugSheetGroups('/adobe/dashboard', env)).toBeNull();
      expect(await cugSheetGroups('/data/insights-list.json', env)).toBeNull();
      expect(await cugSheetGroups('/customers/acme/', env)).toBeNull();
      expect(await cugSheetGroups('/', env)).toBeNull();
      // …and the sheet is not even fetched for them.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('compiled matching', () => {
    it.each([
      ['glob before exact at the same prefix', ['/a*', '/a'], '/a'],
      ['exact before glob at the same prefix', ['/a', '/a*'], '/a'],
      ['glob still covers descendants after an exact tie', ['/a', '/a*'], '/a/b'],
      ['duplicate globs retain first rule', ['/a**', '/a*'], '/a/b'],
      ['duplicate exact paths retain first rule', ['/a', '/a'], '/a'],
      ['narrow scope shadows broader scope', ['/a*', '/a/b*'], '/a/b/c'],
      ['exact rule does not shadow descendants', ['/a*', '/a/b'], '/a/b/c'],
      ['wildcards have no slash-boundary requirement', ['/a*'], '/abc'],
      ['interior stars remain literal', ['/a*b*'], '/a*b/c'],
      ['interior stars are not patterns', ['/a*b*'], '/axb/c'],
      ['case-sensitive paths', ['/Case*'], '/case/a'],
      ['encoded paths are not decoded', ['/a%2Fb*'], '/a/b'],
      ['trailing slash is significant', ['/a/'], '/a'],
      ['query string is ignored', ['/a/b', '/a*'], '/a/b?token=test'],
      ['root glob', ['/**'], '/public'],
      ['long unrelated rule', [`/${'a'.repeat(1000)}*`, '/b*'], '/b/c'],
      ['no matching rule', ['/a*'], '/public'],
      ['empty path', ['/a*'], ''],
      ['missing path', ['/a*'], null],
    ])('agrees with the linear matcher: %s', (name, urls, path) => {
      const entries = parseCugSheetRows(urls.map((url, i) => ({ url, 'cug-groups': `group-${i}.test` })));
      expect(compileSheetGroups(entries)(path)).toEqual(matchSheetGroups(entries, path));
    });

    it('retains blank-row filtering and normalized groups without mutating entries', () => {
      const entries = parseCugSheetRows([
        { url: '/a*', 'cug-groups': ' Foo.COM , Visitor@Example.COM ' },
        { url: '/a/b*', 'cug-groups': ' , ' },
        { url: 'not-a-path', 'cug-groups': 'other.test' },
      ]);
      entries.forEach((entry) => {
        Object.freeze(entry.groups);
        Object.freeze(entry);
      });
      Object.freeze(entries);
      expect(compileSheetGroups(entries)('/a/b/c')).toEqual(['foo.com', 'visitor@example.com']);
      expect(compileSheetGroups([])('/a')).toBeNull();
      expect(compileSheetGroups(null)('/a')).toBeNull();
    });

    it('matches the linear oracle across seeded overlapping rule sets', () => {
      let seed = 20261007;
      const pick = (size) => {
        seed = (seed * 16807) % 2147483647;
        return seed % size;
      };
      const prefixes = [
        '/', '/a', '/ab', '/a/', '/a/b', '/a/b/c', '/a%2Fb', '/Case',
        '/case', '/x*literal', '/__proto__', '/toString', '/\u00e9',
      ];
      for (let dataset = 0; dataset < 40; dataset += 1) {
        const rows = Array.from({ length: 80 }, (_, i) => ({
          url: `${prefixes[pick(prefixes.length)]}${['', '*', '**', '***'][pick(4)]}`,
          'cug-groups': pick(5) === 0 ? '' : `group-${i}.test, visitor-${pick(5)}@example.com`,
        }));
        const entries = parseCugSheetRows(rows);
        const match = compileSheetGroups(entries);
        for (const prefix of prefixes) {
          for (const suffix of ['', '/child', 'sibling', '?token=test', '/child?token=test']) {
            const path = `${prefix}${suffix}`;
            expect(match(path), `dataset ${dataset}, path ${path}`)
              .toEqual(matchSheetGroups(entries, path));
          }
        }
      }
    });
  });

  describe('fetching', () => {
    it('fetches the sheet from the origin with the origin token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(sheetResponse());
      vi.stubGlobal('fetch', fetchMock);

      const groups = await cugSheetGroups('/accounts/f/freshpet/', env);

      expect(groups).toEqual(['adobe.com', 'semrush.com', 'freshpet.com']);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://main--mysite--myorg.aem.live/closed-user-groups.json');
      expect(init.headers.authorization).toBe('token origin-token');
    });

    it('caches the sheet across calls', async () => {
      const fetchMock = vi.fn().mockResolvedValue(sheetResponse());
      vi.stubGlobal('fetch', fetchMock);

      await cugSheetGroups('/accounts/f/freshpet/', env);
      await cugSheetGroups('/accounts/z/other/', env);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follows pagination when the sheet is served in pages', async () => {
      const page1 = new Response(
        JSON.stringify({ total: 2, limit: 1, offset: 0, data: [ROWS[0]] }),
        { status: 200 },
      );
      const page2 = new Response(
        JSON.stringify({ total: 2, limit: 1, offset: 1, data: [ROWS[2]] }),
        { status: 200 },
      );
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);
      vi.stubGlobal('fetch', fetchMock);

      const groups = await cugSheetGroups('/accounts/f/freshpet/', env);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain('offset=1');
      expect(groups).toEqual(['adobe.com', 'semrush.com', 'freshpet.com']);
    });

    it('returns null when the sheet fetch fails, leaving the header in charge', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })));

      expect(await cugSheetGroups('/accounts/f/freshpet/', env)).toBeNull();
    });

    it('backs off after a failure instead of re-fetching on every request', async () => {
      // With nothing cached to fall back on, an origin outage must not make
      // every gated request pay the load timeout again.
      const fetchMock = vi.fn().mockRejectedValue(new Error('origin down'));
      vi.stubGlobal('fetch', fetchMock);

      await cugSheetGroups('/accounts/f/freshpet/', env);
      await cugSheetGroups('/accounts/f/freshpet/', env);
      await cugSheetGroups('/accounts/z/other/', env);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('re-fetches once the back-off window has passed', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error('origin down'))
        .mockResolvedValue(sheetResponse());
      vi.stubGlobal('fetch', fetchMock);
      vi.useFakeTimers();

      try {
        expect(await cugSheetGroups('/accounts/f/freshpet/', env)).toBeNull();
        vi.advanceTimersByTime(61 * 1000);

        expect(await cugSheetGroups('/accounts/f/freshpet/', env))
          .toEqual(['adobe.com', 'semrush.com', 'freshpet.com']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not answer from another origin\'s cached sheet', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sheetResponse()));
      await cugSheetGroups('/accounts/f/freshpet/', env);

      // Same isolate, different origin: the cached rules must not carry over.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sheetResponse([])));
      const otherEnv = createMockEnv({ ORIGIN_HOSTNAME: 'main--other--org.aem.live' });

      expect(await cugSheetGroups('/accounts/f/freshpet/', otherEnv)).toBeNull();
    });

    it('bounds a paginating origin with one deadline for the whole load', async () => {
      // A per-fetch timeout would let MAX_PAGES pages stall a page request for
      // MAX_PAGES × the timeout, so every page must share one signal.
      const page = (offset) => new Response(
        JSON.stringify({ total: 3, limit: 1, offset, data: [ROWS[offset]] }),
        { status: 200 },
      );
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(page(0))
        .mockResolvedValueOnce(page(1))
        .mockResolvedValueOnce(page(2));
      vi.stubGlobal('fetch', fetchMock);

      await cugSheetGroups('/accounts/f/freshpet/', env);

      const signals = fetchMock.mock.calls.map(([, init]) => init.signal);
      expect(signals).toHaveLength(3);
      expect(new Set(signals).size).toBe(1);
    });

    it('returns null when the fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      expect(await cugSheetGroups('/accounts/f/freshpet/', env)).toBeNull();
    });

    it('keeps serving the last good sheet when a refresh fails', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(sheetResponse())
        .mockRejectedValue(new Error('origin blip'));
      vi.stubGlobal('fetch', fetchMock);
      vi.useFakeTimers();

      try {
        await cugSheetGroups('/accounts/f/freshpet/', env);
        vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute TTL

        // Stale-if-error: a blip must not drop customers back to the staff-only
        // header groups, which would 403 them on their own pages.
        expect(await cugSheetGroups('/accounts/f/freshpet/', env))
          .toEqual(['adobe.com', 'semrush.com', 'freshpet.com']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('de-duplicates concurrent loads into one fetch', async () => {
      const fetchMock = vi.fn().mockResolvedValue(sheetResponse());
      vi.stubGlobal('fetch', fetchMock);

      await Promise.all([
        cugSheetGroups('/accounts/f/freshpet/', env),
        cugSheetGroups('/accounts/f/freshpet/', env),
        cugSheetGroups('/accounts/z/other/', env),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
