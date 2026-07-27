'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cx } from './cx';
import styles from './Modal.module.css';

const noopSubscribe = () => () => {};
/** True only once mounted client-side — lets us defer `createPortal` (which
 * needs `document`) without a setState-in-effect render cascade. */
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export interface ModalProps {
  /** Renders whatever you want as the trigger — a `Button`, an icon, plain
   * text — call the given `open()` from its `onClick`. e.g.
   * `trigger={(open) => <Button onClick={open}>+ Add supplier</Button>}`
   * Omit this when you'd rather control open/closed yourself (e.g. several
   * thumbnails all opening the same modal instance) via `open`/`onOpenChange`. */
  trigger?: (open: () => void) => ReactNode;
  /** Controlled open state. Only needed if you're not using `trigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  /** Modal body. Pass a function to get a `close()` you can call yourself
   * (e.g. from a form's `onSuccess`) instead of only closing via the
   * backdrop/Escape/X. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Panel width; defaults to a comfortable form-sized max-width. */
  className?: string;
}

/** Generic, reusable modal: a caller-supplied trigger plus a portaled dialog
 * panel. Closes on backdrop click, Escape, or the built-in X — or
 * programmatically via the `close` passed to a function-as-children body.
 * Manages its own open state by default; pass `open`/`onOpenChange` instead
 * of `trigger` to control it externally. */
export function Modal({ trigger, open: controlledOpen, onOpenChange, title, children, className }: ModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const mounted = useMounted();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [open, close]);

  return (
    <>
      {trigger?.(() => setOpen(true))}

      {open &&
        mounted &&
        createPortal(
          <div className={styles.backdrop} onMouseDown={close}>
            <div
              ref={panelRef}
              className={cx(styles.panel, className)}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* `header` and `h2` rather than divs so a calling area can
                  theme the chrome from its own stylesheet — CSS-module class
                  names are hashed and can't be selected across modules, but
                  elements can. See `.adminModal` on the products page. */}
              <header className={styles.header}>
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={close}
                  aria-label="Close"
                >
                  ×
                </button>
              </header>
              <div className={styles.body}>
                {typeof children === 'function' ? children(close) : children}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
