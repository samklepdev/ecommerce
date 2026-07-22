/** Pure — no infra imports, unit-testable without a database or network.
 * A small fixed list of known carriers; unknown/unset carriers simply get
 * no link (never break the page). */
export const KNOWN_CARRIERS = ['usps', 'ups', 'fedex', 'dhl'] as const;
export type Carrier = (typeof KNOWN_CARRIERS)[number];

const CARRIER_LABELS: Record<Carrier, string> = {
  usps: 'USPS',
  ups: 'UPS',
  fedex: 'FedEx',
  dhl: 'DHL',
};

const CARRIER_URL_TEMPLATES: Record<Carrier, (trackingNumber: string) => string> = {
  usps: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`,
  ups: (t) => `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`,
  fedex: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
  dhl: (t) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(t)}`,
};

function isKnownCarrier(carrier: string): carrier is Carrier {
  return (KNOWN_CARRIERS as readonly string[]).includes(carrier);
}

/** Returns null when the carrier is unset/unrecognized — callers fall
 * back to plain text, never broken output. */
export function buildCarrierTrackingUrl(carrier: string | null, trackingNumber: string): string | null {
  if (!carrier || !isKnownCarrier(carrier)) return null;
  return CARRIER_URL_TEMPLATES[carrier](trackingNumber);
}

export function carrierLabel(carrier: string | null): string | null {
  if (!carrier || !isKnownCarrier(carrier)) return null;
  return CARRIER_LABELS[carrier];
}
