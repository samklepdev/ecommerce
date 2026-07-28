import * as bitcoin from 'bitcoinjs-lib';

/**
 * Is this a real address on this network?
 *
 * Delegates to `toOutputScript`, which is the authoritative check — it
 * verifies the bech32/base58 checksum and the network's own prefix, so a
 * single mistyped character or a mainnet address on a testnet build both
 * fail. A regex would accept either.
 *
 * Lives in infrastructure rather than the domain because that check needs
 * bitcoinjs-lib, and the domain layer imports no bitcoin libraries.
 */
export function isValidBitcoinAddress(
  address: string,
  network: bitcoin.networks.Network,
): boolean {
  try {
    bitcoin.address.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the address, or throws if it isn't valid on this network.
 *
 * Guards two places: what `HdAddressDeriver` hands back, and what gets
 * interpolated into the Esplora request path. The second is why the failure
 * message doesn't quote the offending value — an address that reached this
 * point malformed is exactly the kind of value you don't want echoed into a
 * log line unescaped.
 */
export function assertValidBitcoinAddress(
  address: string,
  network: bitcoin.networks.Network,
): string {
  if (!isValidBitcoinAddress(address, network)) {
    throw new Error('not a valid bitcoin address for the configured network');
  }
  return address;
}
