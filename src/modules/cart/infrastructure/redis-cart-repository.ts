import { randomUUID } from 'node:crypto';

import type Redis from 'ioredis';

import { Money } from '@/shared/domain/money';
import { Cart, type CartOwner } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

interface StoredLine {
  productId: string;
  productName?: string;
  /** What pre-0028 carts stored instead of `productName`. Read, never
   * written — see `nameOf`. */
  sku?: string;
  quantity: number;
  unitAmountMinor: number;
  currency: string;
}

/**
 * A cart written before 0028 holds the product's SKU where its name now goes.
 * That's read as the name rather than discarding the cart, unlike the
 * variant-era shape below: a SKU is a poor label but a *valid* one, it's only
 * ever a fallback (every cart view prefers the live catalogue name), and
 * emptying every cart in existence on deploy is a far worse trade than one
 * ugly string on a product that has since been deleted.
 */
function nameOf(line: StoredLine): string | undefined {
  return line.productName ?? line.sku;
}

interface StoredCart {
  id: string;
  lines: StoredLine[];
}

const GUEST_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Sentinel for "no cart was stored". A real document is JSON and starts `{`,
 * so this can never collide with one. */
const ABSENT = '\u0000absent';

/** One place a cart becomes its stored form, shared by `save` and `mutate` —
 * two encoders would eventually disagree about what a cart is. */
function toStored(cart: Cart): StoredCart {
  return {
    id: cart.id,
    lines: cart.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      unitAmountMinor: l.unitPrice.amountMinor,
      currency: l.unitPrice.currency,
    })),
  };
}

/**
 * How many times a conflicting write may send `mutate` round again.
 *
 * Each retry means another request wrote this same cart in the microseconds
 * between our read and our write. One cart belongs to one visitor, so genuine
 * contention is a double-click or a login-merge — a handful at most. A bound
 * that is generous for that and still finite means a pathological caller
 * fails loudly rather than spinning on the request thread.
 */
const MAX_MUTATE_ATTEMPTS = 10;

function keyFor(owner: CartOwner): string {
  if (owner.type === 'user') return `cart:user:${owner.userId}`;
  // An empty session id would build `cart:guest:` — a single key every
  // visitor without a guest cookie shares, letting strangers read and edit
  // each other's carts. `proxy.ts` gives every request an id, so reaching
  // here without one means that broke; fail loudly instead of quietly
  // handing back somebody else's cart.
  if (!owner.sessionId) throw new Error('guest cart owner has no session id');
  return `cart:guest:${owner.sessionId}`;
}

export class RedisCartRepository implements CartRepository {
  constructor(private readonly redis: Redis) {}

  async get(owner: CartOwner): Promise<Cart | null> {
    const raw = await this.redis.get(keyFor(owner));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredCart;

    // Carts written before variants were removed store a `variantId` holding
    // a product_variants id — a row that no longer exists, so the line can't
    // be re-priced or ordered. There's nothing to migrate it to from here, and
    // a cart is cheap to rebuild, so drop it rather than hand back lines that
    // would fail at checkout.
    // A line carrying neither name nor legacy sku isn't a shape this app ever
    // wrote, so it goes the same way as the variant-era one.
    if (stored.lines.some((l) => typeof l.productId !== 'string' || nameOf(l) === undefined)) {
      await this.delete(owner);
      return null;
    }

    return Cart.create({
      id: stored.id,
      owner,
      lines: stored.lines.map((l) =>
        CartLine.create({
          productId: l.productId,
          // Non-null: the guard above rejected the whole cart otherwise.
          productName: nameOf(l)!,
          quantity: l.quantity,
          unitPrice: Money.of(l.unitAmountMinor, l.currency),
        }),
      ),
    });
  }

  /**
   * Read-transform-write, atomic against other writers of the same key.
   *
   * Optimistic concurrency with the previously-stored document as the version:
   * read it, transform in the domain, then swap it in **only if** it is still
   * byte-for-byte what we read. A conflicting write changes it, the swap
   * fails, and we retry against fresh state — which is why `transform` must be
   * pure.
   *
   * A Lua script rather than `WATCH`/`MULTI`, and that is not a style choice.
   * `WATCH` is scoped to a *connection*, and ioredis multiplexes every command
   * in the process over one — so concurrent mutations of different carts
   * clobber each other's watches and the guard silently does nothing. The
   * integration test proves it: with `WATCH` on the shared client, ten
   * simultaneous adds still collapsed to one line.
   *
   * The transform stays in JavaScript on purpose. The rules being applied —
   * merging a repeated product, clamping the summed quantity, dropping a line
   * at zero — live in `Cart`, and rewriting them in Lua would be a second
   * implementation of a business rule that could disagree with the first.
   * Redis supplies only the compare-and-set.
   */
  async mutate(owner: CartOwner, transform: (cart: Cart) => Cart): Promise<Cart> {
    const key = keyFor(owner);

    for (let attempt = 0; attempt < MAX_MUTATE_ATTEMPTS; attempt += 1) {
      const previous = await this.redis.get(key);
      const current = previous === null ? null : await this.get(owner);
      const base = current ?? Cart.create({ id: randomUUID(), owner, lines: [] });
      const next = transform(base);

      /**
       * Nothing to store and nothing stored before: writing here would mint an
       * empty document that then occupies Redis for the full guest TTL. A
       * stray remove for a visitor with no cart is the common way to get here.
       */
      if (next.isEmpty && previous === null) return next;

      const applied = await this.compareAndSet(key, previous, next, owner);
      if (applied) return next;
    }

    throw new Error(`cart mutation kept losing to concurrent writes: ${key}`);
  }

  /**
   * Swap the stored document only if it still holds `previous`.
   *
   * `ABSENT` stands for "there was no key": Lua sees a missing key as `false`,
   * and a caller expecting absence must not match a key that has since been
   * created by someone else.
   */
  private async compareAndSet(
    key: string,
    previous: string | null,
    next: Cart,
    owner: CartOwner,
  ): Promise<boolean> {
    const ttl = owner.type === 'guest' ? GUEST_TTL_SECONDS : 0;
    const result = await this.redis.eval(
      `
      local current = redis.call('GET', KEYS[1])
      local expected = ARGV[2]
      if expected == '${ABSENT}' then
        if current then return 0 end
      elseif current ~= expected then
        return 0
      end
      if tonumber(ARGV[3]) > 0 then
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
      else
        redis.call('SET', KEYS[1], ARGV[1])
      end
      return 1
      `,
      1,
      key,
      JSON.stringify(toStored(next)),
      previous ?? ABSENT,
      String(ttl),
    );
    return result === 1;
  }

  async save(cart: Cart): Promise<void> {
    const stored = toStored(cart);
    const key = keyFor(cart.owner);
    const payload = JSON.stringify(stored);
    if (cart.owner.type === 'guest') {
      await this.redis.set(key, payload, 'EX', GUEST_TTL_SECONDS);
    } else {
      await this.redis.set(key, payload);
    }
  }


  async delete(owner: CartOwner): Promise<boolean> {
    // `DEL` returns how many keys it removed, and Redis runs it atomically —
    // so of two concurrent deletes exactly one sees 1. That is the whole
    // concurrency guarantee `PlaceOrder` leans on; no lock or Lua needed.
    return (await this.redis.del(keyFor(owner))) > 0;
  }
}
