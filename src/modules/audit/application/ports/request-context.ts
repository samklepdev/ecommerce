export interface RequestOrigin {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Where an admin action came from.
 *
 * A port rather than a parameter on every audit call: there are twenty-odd
 * call sites, and threading two more arguments through each one is how they
 * drift — one gets forgotten and its entries are silently anonymous. The use
 * case asks for the context itself, so an entry can't be recorded without
 * it. The adapter reads request headers, which is why this isn't just a
 * function.
 */
export interface RequestContextProvider {
  current(): Promise<RequestOrigin>;
}
