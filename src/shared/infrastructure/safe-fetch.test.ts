import { describe, expect, it, vi } from 'vitest';

import { isPrivateAddress, assertPublicUrl, safeFetch } from './safe-fetch';

describe('isPrivateAddress', () => {
  it('flags loopback', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '::1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  // The one that leaks cloud credentials.
  it('flags the link-local metadata range', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  it('flags RFC1918 space', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('does not flag addresses just outside RFC1918', () => {
    for (const ip of ['172.15.255.255', '172.32.0.1', '11.0.0.1', '192.167.1.1']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it('flags unspecified, CGNAT, multicast and reserved', () => {
    for (const ip of ['0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '::']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it('flags IPv6 unique-local', () => {
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fd12:3456::1')).toBe(true);
  });

  // ::ffff:127.0.0.1 is loopback wearing an IPv6 hat — a classic bypass.
  it('sees through IPv4-mapped IPv6', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1::']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup = async () => [{ address: '127.0.0.1', family: 4 }];

describe('assertPublicUrl', () => {
  it('accepts a public https URL', async () => {
    await expect(assertPublicUrl('https://supplier.example/x', publicLookup)).resolves.toBeUndefined();
  });

  it('rejects a non-http scheme without resolving anything', async () => {
    const lookup = vi.fn(publicLookup);
    await expect(assertPublicUrl('file:///etc/passwd', lookup)).rejects.toThrow(/http/i);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private address', async () => {
    await expect(assertPublicUrl('http://internal.test/', privateLookup)).rejects.toThrow(
      /private|internal/i,
    );
  });

  // A name can return several records; one private answer is enough to refuse.
  it('rejects when any resolved address is private', async () => {
    const mixed = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    await expect(assertPublicUrl('http://mixed.test/', mixed)).rejects.toThrow(/private|internal/i);
  });

  it('rejects a literal private IP without needing DNS', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/', publicLookup)).rejects.toThrow(
      /private|internal/i,
    );
  });

  it('rejects a name that resolves to nothing', async () => {
    await expect(assertPublicUrl('http://nowhere.test/', async () => [])).rejects.toThrow(/resolve/i);
  });
});

describe('safeFetch', () => {
  const ok = (body = 'hi') => new Response(body, { status: 200 });

  it('fetches a public URL', async () => {
    const fetchImpl = vi.fn(async () => ok());
    const res = await safeFetch('https://supplier.example/x', {}, { lookup: publicLookup, fetchImpl });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // The bypass that makes a URL-level check alone insufficient: a public
  // URL that 302s to the metadata service.
  it('re-checks the target of a redirect', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    await expect(
      safeFetch('https://supplier.example/x', {}, { lookup: publicLookup, fetchImpl }),
    ).rejects.toThrow(/private|internal/i);
  });

  it('follows a redirect to another public URL', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1
        ? new Response(null, { status: 301, headers: { location: 'https://supplier.example/final' } })
        : ok('landed');
    });
    const res = await safeFetch('https://supplier.example/x', {}, { lookup: publicLookup, fetchImpl });
    expect(await res.text()).toBe('landed');
  });

  it('gives up on a redirect loop rather than following forever', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://supplier.example/x' } }),
    );
    await expect(
      safeFetch('https://supplier.example/x', {}, { lookup: publicLookup, fetchImpl }),
    ).rejects.toThrow(/redirect/i);
  });

  it('never lets the caller opt back into automatic redirects', async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(init ?? {});
      return ok();
    };
    await safeFetch(
      'https://supplier.example/x',
      { redirect: 'follow' },
      { lookup: publicLookup, fetchImpl: fetchImpl as typeof fetch },
    );
    expect(seen[0]?.redirect).toBe('manual');
  });
});
