'use client';

import { useActionState, useOptimistic, startTransition } from 'react';

import { toggleWishlistItemAction, type ToggleWishlistActionResult } from '@/app/actions/wishlist';
import styles from './SaveButton.module.css';

const initialState: ToggleWishlistActionResult = {};

export interface SaveButtonProps {
  productId: string;
  productName: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
}

/**
 * The heart on a product card and on the product page.
 *
 * Optimistic: saving is reversible and instant in the customer's head, so
 * waiting on a round trip to fill the heart in reads as broken. The server's
 * answer is authoritative and replaces it when it lands.
 */
export function SaveButton({ productId, productName, initialSaved, isLoggedIn }: SaveButtonProps) {
  const [state, formAction] = useActionState(toggleWishlistItemAction, initialState);
  const serverSaved = state.saved ?? initialSaved;
  const [saved, setSaved] = useOptimistic(serverSaved);

  if (!isLoggedIn) {
    // A link, not a disabled button: the customer can act on it.
    return (
      <a
        href="/login"
        className={styles.button}
        aria-label={`Sign in to save ${productName}`}
        title="Sign in to save"
      >
        <HeartIcon filled={false} />
      </a>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(() => setSaved(!saved));
        formAction(formData);
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        className={styles.button}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${productName} from saved` : `Save ${productName}`}
        title={saved ? 'Saved' : 'Save for later'}
      >
        <HeartIcon filled={saved} />
      </button>
      {state.error && <span className={styles.error}>{state.error}</span>}
    </form>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.5 4.2 12.9a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.6 0l1.2 1.2 1.2-1.2a4.7 4.7 0 0 1 6.6 0 4.7 4.7 0 0 1 0 6.7Z" />
    </svg>
  );
}
