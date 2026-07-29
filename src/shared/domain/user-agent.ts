export interface UserAgentDescription {
  browser: string | null;
  os: string | null;
}

/**
 * A readable browser and OS from a user-agent string.
 *
 * Deliberately small and dependency-free. A UA database would be more
 * precise, but this exists so an admin reading the audit log can tell "my
 * Mac, Chrome" from "someone else's Windows box" — not to fingerprint
 * anyone. Anything it doesn't recognise stays null rather than guessing,
 * and the raw string is always kept alongside it.
 *
 * Order matters throughout: Edge and Opera both claim Chrome, Chrome claims
 * Safari, and every browser on iOS is Safari underneath. The most specific
 * claim is tested first.
 */
export function describeUserAgent(userAgent: string | null | undefined): UserAgentDescription {
  if (!userAgent) return { browser: null, os: null };
  return { browser: browserOf(userAgent), os: osOf(userAgent) };
}

function browserOf(ua: string): string | null {
  // Before the Chrome test, and not caught by it: "HeadlessChrome/" has no
  // word boundary before "Chrome", so `\bChrome/` skips it and the string
  // falls through to Safari. Worth naming on its own — an automated browser
  // in an audit log is a fact someone would want to see.
  if (/\bHeadlessChrome\//i.test(ua)) return 'Chrome (headless)';
  if (/\bEdg(e|A|iOS)?\//i.test(ua)) return 'Edge';
  if (/\bOPR\/|\bOpera\//i.test(ua)) return 'Opera';
  if (/\bSamsungBrowser\//i.test(ua)) return 'Samsung Internet';
  if (/\bFirefox\/|\bFxiOS\//i.test(ua)) return 'Firefox';
  // Chrome on iOS reports CriOS; desktop Chrome reports Chrome and also
  // Safari, which is why Safari is last.
  if (/\bCriOS\/|\bChrome\//i.test(ua)) return 'Chrome';
  if (/\bSafari\//i.test(ua)) return 'Safari';
  // Not a browser at all — worth naming rather than reporting as unknown.
  if (/\bcurl\/|\bwget\/|\bbot\b|spider|crawler/i.test(ua)) return 'Bot or CLI';
  return null;
}

function osOf(ua: string): string | null {
  if (/\biPhone\b|\biPod\b/i.test(ua)) return 'iOS';
  // An iPad on recent iPadOS presents as Macintosh; the touch hint is what
  // separates them, and without it a tablet reads as a desktop.
  if (/\biPad\b/i.test(ua)) return 'iPadOS';
  if (/\bAndroid\b/i.test(ua)) return 'Android';
  if (/\bWindows NT\b/i.test(ua)) return 'Windows';
  if (/\bMac OS X\b|\bMacintosh\b/i.test(ua)) return 'macOS';
  if (/\bCrOS\b/i.test(ua)) return 'ChromeOS';
  if (/\bLinux\b/i.test(ua)) return 'Linux';
  return null;
}

/** One short label for a table cell: "Chrome on macOS", or whichever half
 * is known, or null when neither is. */
export function summariseUserAgent(userAgent: string | null | undefined): string | null {
  const { browser, os } = describeUserAgent(userAgent);
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? null;
}
