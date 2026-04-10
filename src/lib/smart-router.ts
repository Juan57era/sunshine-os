const TUNNEL_URLS = [
  'https://sunshine-os-juan.loca.lt',
  'https://sunshine-ops.loca.lt',
];

const VERCEL_URL = 'https://sunshine-os.vercel.app';
const LOCAL_URL = 'http://localhost:3000';

let cachedBaseUrl: string | null = null;
let lastCheck = 0;
const CHECK_INTERVAL = 60000; // re-check every 60s

async function probe(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/api/chat`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok || res.status === 405; // 405 = method not allowed but server is there
  } catch {
    return false;
  }
}

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export async function getBaseUrl(): Promise<string> {
  // If we're on localhost, just use relative URLs
  if (isLocalhost()) {
    return '';
  }

  // If we're on Vercel domain, check if tunnel is available for vault access
  const now = Date.now();
  if (cachedBaseUrl && (now - lastCheck) < CHECK_INTERVAL) {
    return cachedBaseUrl;
  }

  // Try tunnel URLs first (direct to Mac = vault access)
  for (const url of TUNNEL_URLS) {
    if (await probe(url)) {
      cachedBaseUrl = url;
      lastCheck = now;
      console.log(`[SUNSHINE] Connected to Mac via tunnel: ${url}`);
      return url;
    }
  }

  // Fallback to current origin (Vercel)
  cachedBaseUrl = '';
  lastCheck = now;
  console.log('[SUNSHINE] Using Vercel (no vault access)');
  return '';
}

export function getConnectionStatus(): 'local' | 'tunnel' | 'cloud' {
  if (isLocalhost()) return 'local';
  if (cachedBaseUrl && cachedBaseUrl.includes('loca.lt')) return 'tunnel';
  return 'cloud';
}
