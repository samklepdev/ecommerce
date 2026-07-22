import { describe, expect, it } from 'vitest';

import { buildCarrierTrackingUrl, carrierLabel } from './carrier-tracking';

describe('buildCarrierTrackingUrl', () => {
  it('builds a USPS tracking URL', () => {
    expect(buildCarrierTrackingUrl('usps', '9400111899560000000000')).toBe(
      'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899560000000000',
    );
  });

  it('builds a UPS tracking URL', () => {
    expect(buildCarrierTrackingUrl('ups', '1Z999AA10123456784')).toBe(
      'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    );
  });

  it('returns null for an unknown carrier', () => {
    expect(buildCarrierTrackingUrl('some-other-carrier', 'ABC123')).toBeNull();
  });

  it('returns null when carrier is null', () => {
    expect(buildCarrierTrackingUrl(null, 'ABC123')).toBeNull();
  });

  it('URL-encodes the tracking number', () => {
    expect(buildCarrierTrackingUrl('usps', 'abc def')).toContain('abc%20def');
  });
});

describe('carrierLabel', () => {
  it('returns a display label for a known carrier', () => {
    expect(carrierLabel('fedex')).toBe('FedEx');
  });

  it('returns null for null or unknown', () => {
    expect(carrierLabel(null)).toBeNull();
    expect(carrierLabel('unknown')).toBeNull();
  });
});
