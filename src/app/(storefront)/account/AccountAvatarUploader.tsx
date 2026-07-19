'use client';

import { useActionState, useState } from 'react';

import { updateAvatarAction, type UpdateAvatarActionResult } from '@/app/actions/account';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: UpdateAvatarActionResult = {};

/** Adjusts state during render (rather than an effect) so a repeat
 * submission restarts the alert's fade-out animation — same trick as
 * `ProductImagesManager`'s `useResultNonce`. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

interface AccountAvatarUploaderProps {
  avatarUrl: string | null;
  email: string;
}

export function AccountAvatarUploader({ avatarUrl, email }: AccountAvatarUploaderProps) {
  const [state, formAction, isPending] = useActionState(updateAvatarAction, initialState);
  const nonce = useResultNonce(state);

  return (
    <div className={styles.avatarRow}>
      <Avatar avatarUrl={avatarUrl} label={email} size="lg" />
      <form action={formAction} className={styles.avatarForm}>
        <input
          type="file"
          name="avatar"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Upload avatar"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
      {state.error && (
        <Alert key={nonce} tone="danger" className={styles.fadeAlert}>
          {state.error}
        </Alert>
      )}
      {state.message && (
        <Alert key={nonce} tone="success" className={styles.fadeAlert}>
          {state.message}
        </Alert>
      )}
    </div>
  );
}
