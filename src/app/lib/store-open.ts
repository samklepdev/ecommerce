import { getContainer } from '@/composition/container';

/**
 * Is the store open right now?
 *
 * A small `app/lib` helper in the same spirit as `requireAdmin` and
 * `checkRateLimit`: a cross-cutting policy check that server actions need,
 * with no business entity of its own.
 *
 * The *money* path does not use this — `PlaceOrder` and `StartCheckout` take
 * the guard as a dependency and enforce it inside the use case, where it
 * can't be forgotten and is covered by tests that run without infra. This is
 * for the secondary writes (cart, wishlist, reviews, inquiries, sign-up)
 * where the check is a presentation-level policy rather than a rule of the
 * domain.
 *
 * Fails closed, like the checkout guard it delegates to: if the switch can't
 * be read, we don't accept writes.
 */
export async function isStoreOpen(): Promise<boolean> {
  const { assertStoreOpenForCheckout } = getContainer();
  return assertStoreOpenForCheckout.execute();
}

/** What every paused write says. One sentence, no apology, and it tells the
 * customer their data is safe — the common fear when a form refuses. */
export const STORE_CLOSED_MESSAGE =
  'Ordering is paused right now. Nothing was lost — please try again later.';
