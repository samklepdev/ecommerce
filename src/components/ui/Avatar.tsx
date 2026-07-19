import { cx } from './cx';
import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  avatarUrl: string | null;
  /** Used for the alt text and, when there's no image, the initial shown. */
  label: string;
  size?: AvatarSize;
  className?: string;
}

/** An uploaded image if there is one, otherwise a single-initial fallback
 * derived from `label` (usually the user's email) — shared by the Header's
 * dropdown trigger and the account page's uploader so the fallback logic
 * only lives in one place. */
export function Avatar({ avatarUrl, label, size = 'md', className }: AvatarProps) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={label}
        className={cx(styles.avatar, styles[size], className)}
      />
    );
  }

  return (
    <div className={cx(styles.avatar, styles.fallback, styles[size], className)} aria-label={label}>
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
