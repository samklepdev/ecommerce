import { describe, expect, it } from 'vitest';

import { clientIpFromForwardedFor } from './client-ip';

describe('clientIpFromForwardedFor', () => {
  describe('behind one proxy', () => {
    const HOPS = 1;

    it('reads the address the proxy appended', () => {
      expect(clientIpFromForwardedFor('203.0.113.9', HOPS)).toBe('203.0.113.9');
    });

    /**
     * The defect, stated directly. Under the standard nginx recipe the proxy
     * *appends*, so a request arriving with a forged header leaves it as
     * `<forged>, <real client>`. Reading index 0 handed back the forgery.
     */
    it('ignores a value the caller supplied ahead of it', () => {
      expect(clientIpFromForwardedFor('1.2.3.4, 203.0.113.9', HOPS)).toBe('203.0.113.9');
    });

    it('ignores a whole forged chain', () => {
      // Nothing stops a client sending several entries; only the rightmost was
      // written by something we trust.
      expect(clientIpFromForwardedFor('9.9.9.9, 8.8.8.8, 1.1.1.1, 203.0.113.9', HOPS)).toBe(
        '203.0.113.9',
      );
    });

    it('tolerates the spacing real proxies emit', () => {
      expect(clientIpFromForwardedFor('1.2.3.4,203.0.113.9', HOPS)).toBe('203.0.113.9');
      expect(clientIpFromForwardedFor('  1.2.3.4 ,  203.0.113.9  ', HOPS)).toBe('203.0.113.9');
    });
  });

  describe('behind two proxies', () => {
    const HOPS = 2;

    it('skips both appended hops to reach the client', () => {
      // load balancer appended the client, nginx then appended the LB.
      expect(clientIpFromForwardedFor('203.0.113.9, 10.0.0.5', HOPS)).toBe('203.0.113.9');
    });

    it('still ignores anything the caller put in front', () => {
      expect(clientIpFromForwardedFor('1.2.3.4, 203.0.113.9, 10.0.0.5', HOPS)).toBe('203.0.113.9');
    });
  });

  describe('with no proxy configured', () => {
    /**
     * Nothing appended the header, so every entry is whatever the client chose
     * to send. Half-trusting it would be worse than not reading it: a
     * self-hosted deployment would silently get spoofable limits while looking
     * protected.
     */
    it('refuses to read the header at all', () => {
      expect(clientIpFromForwardedFor('203.0.113.9', 0)).toBeNull();
      expect(clientIpFromForwardedFor('1.2.3.4, 203.0.113.9', 0)).toBeNull();
    });

    it('treats a negative configuration the same way', () => {
      expect(clientIpFromForwardedFor('203.0.113.9', -1)).toBeNull();
    });
  });

  describe('malformed or missing headers', () => {
    it('is null when the header is absent', () => {
      expect(clientIpFromForwardedFor(null, 1)).toBeNull();
    });

    it('is null when the header is empty or only separators', () => {
      expect(clientIpFromForwardedFor('', 1)).toBeNull();
      expect(clientIpFromForwardedFor('   ', 1)).toBeNull();
      expect(clientIpFromForwardedFor(',,,', 1)).toBeNull();
    });

    it('is null when there are fewer entries than configured hops', () => {
      // The request did not traverse the proxies we expect — a bypassed proxy,
      // a misconfiguration, or a direct hit on the app port. Clamping to the
      // leftmost entry would resolve to a caller-supplied value in exactly the
      // case where the chain cannot be vouched for.
      expect(clientIpFromForwardedFor('203.0.113.9', 3)).toBeNull();
      expect(clientIpFromForwardedFor('1.2.3.4, 203.0.113.9', 5)).toBeNull();
    });

    it('accepts a chain exactly as long as the configured hops', () => {
      // One proxy, one appended address: the normal case, not a short chain.
      expect(clientIpFromForwardedFor('203.0.113.9', 1)).toBe('203.0.113.9');
      expect(clientIpFromForwardedFor('203.0.113.9, 10.0.0.5', 2)).toBe('203.0.113.9');
    });
  });
});
