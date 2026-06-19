/** NestJS API host when UI and API are on separate Hostinger subdomains. */
const PRODUCTION_API_BASE = 'https://midnightblue-partridge-476451.hostingersite.com';
const PRODUCTION_FRONTEND_ORIGIN = 'https://greenyellow-woodpecker-750354.hostingersite.com';

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isLocalDevHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

async function fetchApiBaseFromFrontend(frontendOrigin: string): Promise<string> {
  try {
    const response = await fetch(`${frontendOrigin}/extension-config.json`, { cache: 'no-store' });
    if (!response.ok) return '';
    const config = (await response.json()) as { apiBase?: string };
    return normalizeOrigin(config.apiBase ?? '');
  } catch {
    return '';
  }
}

/** Map a FlexHRM login URL to the NestJS API origin used by the extension. */
export async function resolveFlexHrmApiUrl(inputUrl: string): Promise<string> {
  const base = normalizeOrigin(inputUrl);
  if (!base) return base;

  const host = hostFromUrl(base);
  const apiHost = hostFromUrl(PRODUCTION_API_BASE);
  const frontendHost = hostFromUrl(PRODUCTION_FRONTEND_ORIGIN);

  // Local dev serves production extension-config.json from /public — never redirect away.
  if (isLocalDevHost(host)) return base;

  if (host === apiHost) return base;

  if (host === frontendHost) {
    const discovered = await fetchApiBaseFromFrontend(base);
    return discovered || PRODUCTION_API_BASE;
  }

  const discovered = await fetchApiBaseFromFrontend(base);
  if (discovered) return discovered;

  return base;
}
