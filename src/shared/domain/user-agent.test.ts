import { describe, expect, it } from 'vitest';

import { describeUserAgent, summariseUserAgent } from './user-agent';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  curl: 'curl/8.4.0',
  headlessChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
};

describe('describeUserAgent', () => {
  // Every one of these claims to be something else as well — Chrome says
  // Safari, Edge says Chrome, Android says Linux. That's the whole reason
  // this function tests in a specific order.
  it.each([
    ['chromeMac', UA.chromeMac, 'Chrome', 'macOS'],
    ['safariMac', UA.safariMac, 'Safari', 'macOS'],
    ['edgeWindows', UA.edgeWindows, 'Edge', 'Windows'],
    ['firefoxLinux', UA.firefoxLinux, 'Firefox', 'Linux'],
    ['chromeIphone', UA.chromeIphone, 'Chrome', 'iOS'],
    ['safariIpad', UA.safariIpad, 'Safari', 'iPadOS'],
    ['chromeAndroid', UA.chromeAndroid, 'Chrome', 'Android'],
  ])('reads %s as the specific browser and OS', (_name, ua, browser, os) => {
    expect(describeUserAgent(ua)).toEqual({ browser, os });
  });

  // Found by reading a real audit row: there's no word boundary before
  // "Chrome" in "HeadlessChrome/", so the generic Chrome test skips it and
  // the string used to fall through to Safari.
  it('recognises a headless browser instead of calling it Safari', () => {
    expect(describeUserAgent(UA.headlessChrome)).toEqual({
      browser: 'Chrome (headless)',
      os: 'macOS',
    });
  });

  it('names non-browser clients rather than reporting nothing', () => {
    expect(describeUserAgent(UA.curl).browser).toBe('Bot or CLI');
  });

  // Guessing would be worse than admitting ignorance: the raw string is
  // always stored alongside this.
  it('returns nulls for anything unrecognised, and for no agent at all', () => {
    expect(describeUserAgent('Something entirely made up')).toEqual({ browser: null, os: null });
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null });
    expect(describeUserAgent(undefined)).toEqual({ browser: null, os: null });
    expect(describeUserAgent('')).toEqual({ browser: null, os: null });
  });
});

describe('summariseUserAgent', () => {
  it('joins both halves when both are known', () => {
    expect(summariseUserAgent(UA.chromeMac)).toBe('Chrome on macOS');
  });

  it('falls back to whichever half it has', () => {
    expect(summariseUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
    expect(summariseUserAgent('curl/8.4.0')).toBe('Bot or CLI');
  });

  it('is null when it knows nothing', () => {
    expect(summariseUserAgent('gibberish')).toBeNull();
    expect(summariseUserAgent(null)).toBeNull();
  });
});
