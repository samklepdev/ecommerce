import { lookup as dnsLookup } from 'node:dns/promises';

/**
 * Server-side fetching of admin-supplied URLs, without handing the admin a
 * window onto everything the server can reach.
 *
 * Three places take a URL from a form and fetch it: the JSON feed fetcher,
 * the HTML content extractor, and the robots.txt check. Without a guard,
 * any of them will happily retrieve `http://169.254.169.254/…` (cloud
 * instance metadata, which usually carries credentials) or
 * `http://127.0.0.1:6379` (this app's own Redis). The extractor renders
 * what it fetched back into the admin UI, so it's a read channel, not
 * blind.
 *
 * Known limit: this resolves the hostname, checks the answers, and then
 * fetches — so a name that answers public on the first query and private on
 * the second (DNS rebinding) can still slip through. Closing that needs a
 * custom agent that pins the checked IP for the connection, which
 * `undici`'s dispatcher supports but is a bigger change than this. The
 * realistic attacks here — a literal metadata IP, a redirect to one, a
 * hostname with a private A record — are all covered.
 */

interface LookupAddress {
  address: string;
  family: number;
}

export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true });

/** Max hops before we assume a loop. Browsers use 20; a supplier feed
 * needing more than a handful is not a feed we want. */
const MAX_REDIRECTS = 5;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** CIDR blocks that must never be fetched from. */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — cloud metadata lives here
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255
];

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable — refuse rather than guess

  return BLOCKED_V4.some(([base, bits]) => {
    const baseValue = ipv4ToInt(base);
    if (baseValue === null) return false;
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
  });
}

/**
 * True for any address that isn't safely public.
 *
 * Defaults to `true` on anything it can't parse: an address this doesn't
 * understand is one it can't vouch for, and the cost of refusing a valid
 * supplier URL is much lower than the cost of fetching an internal one.
 */
export function isPrivateAddress(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  if (value === '') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) is loopback in a costume, and a
  // check that only looked at the textual form would wave it through.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);

  if (value.includes(':')) {
    if (value === '::' || value === '::1') return true;
    // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast.
    if (/^f[cd]/.test(value)) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (/^ff/.test(value)) return true;
    return false;
  }

  return isPrivateV4(value);
}

/** Throws unless `url` is http(s) and every address it resolves to is
 * public. Exported for the redirect loop below and for direct use. */
export async function assertPublicUrl(url: string, lookup: LookupFn = defaultLookup): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Not a valid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be fetched.');
  }

  // A literal IP needs no DNS, and asking for one would fail anyway.
  const literal = parsed.hostname.replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(literal) || literal.includes(':')) {
    if (isPrivateAddress(literal)) {
      throw new Error('That URL points at a private or internal address.');
    }
    return;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(parsed.hostname);
  } catch {
    throw new Error(`Could not resolve ${parsed.hostname}.`);
  }
  if (addresses.length === 0) throw new Error(`Could not resolve ${parsed.hostname}.`);

  // Every answer has to be public: a name returning one public and one
  // private record would otherwise be a coin toss.
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That URL points at a private or internal address.');
  }
}

export interface SafeFetchOptions {
  lookup?: LookupFn;
  fetchImpl?: typeof fetch;
  maxRedirects?: number;
}

/**
 * `fetch`, with every URL in the chain checked first.
 *
 * Redirects are followed by hand rather than by the runtime, because
 * checking only the URL the admin typed would be trivially bypassed — a
 * public URL that 302s to the metadata service passes a URL-level check and
 * still reads the metadata.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  { lookup = defaultLookup, fetchImpl = fetch, maxRedirects = MAX_REDIRECTS }: SafeFetchOptions = {},
): Promise<Response> {
  let target = url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(target, lookup);

    // `redirect: 'manual'` is forced, never taken from the caller — letting
    // it through would hand the redirect back to the runtime and skip the
    // check on the next hop.
    const res = await fetchImpl(target, { ...init, redirect: 'manual' });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location');
    if (!isRedirect || !location) return res;

    target = new URL(location, target).toString();
  }

  throw new Error(`Too many redirects (more than ${maxRedirects}).`);
}
