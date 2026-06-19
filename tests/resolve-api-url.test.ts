import { describe, expect, it } from 'vitest';
import { resolveFlexHrmApiUrl } from '../src/shared/utils/resolve-api-url';

describe('resolveFlexHrmApiUrl', () => {
  it('maps the production frontend host to the API host', async () => {
    const resolved = await resolveFlexHrmApiUrl(
      'https://greenyellow-woodpecker-750354.hostingersite.com/',
    );
    expect(resolved).toBe('https://midnightblue-partridge-476451.hostingersite.com');
  });

  it('keeps an API host unchanged', async () => {
    const api = 'https://midnightblue-partridge-476451.hostingersite.com';
    await expect(resolveFlexHrmApiUrl(api)).resolves.toBe(api);
  });

  it('keeps localhost unchanged', async () => {
    const local = 'http://localhost:3001';
    await expect(resolveFlexHrmApiUrl(local)).resolves.toBe(local);
  });

  it('keeps localhost UI origin even when extension-config points to production', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/extension-config.json')) {
        return new Response(
          JSON.stringify({
            apiBase: 'https://midnightblue-partridge-476451.hostingersite.com',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input);
    }) as typeof fetch;

    try {
      await expect(resolveFlexHrmApiUrl('http://localhost:3000')).resolves.toBe(
        'http://localhost:3000',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
