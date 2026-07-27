'use client';

import { useEffect, useRef, useState } from 'react';

import { cx } from './cx';
import styles from './CopyButton.module.css';

interface CopyButtonProps {
  value: string;
  /** Named in the accessible label: "Copy address", "Copy order id". */
  label?: string;
}

const CONFIRM_MS = 1400;

export function CopyButton({ value, label = 'value' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clears on unmount so a component that disappears mid-confirmation
  // doesn't leave a timer setting state on nothing.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard needs a secure context; on plain http there's nothing to
      // do but leave the value selectable.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  return (
    <button
      type="button"
      className={cx(styles.copy, copied && styles.done)}
      onClick={copy}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}
