const SATS_PER_BTC = 100_000_000;

export function satsToBtcString(sats: number): string {
  return (sats / SATS_PER_BTC).toFixed(8);
}

export function toBip21(address: string, sats: number): string {
  return `bitcoin:${address}?amount=${satsToBtcString(sats)}`;
}
