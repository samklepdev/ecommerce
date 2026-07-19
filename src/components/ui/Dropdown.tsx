'use client';

import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import Link, { type LinkProps } from 'next/link';

import { cx } from './cx';
import styles from './Dropdown.module.css';

export interface DropdownProps {
  /** Content of the toggle button (text, an icon, whatever). */
  trigger: ReactNode;
  children: ReactNode;
  /** Which side the menu panel hangs off of. Defaults to 'left'. */
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
}

/** Generic, headless-ish dropdown: a toggle button plus an absolutely
 * positioned menu panel. Closes on outside click, Escape, or when any item
 * inside it is clicked. Put whatever you want inside — `DropdownItem` is a
 * convenience for the common "list of links/buttons" case, not a requirement. */
export function Dropdown({
  trigger,
  children,
  align = 'left',
  className,
  triggerClassName,
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={cx(styles.wrap, className)} ref={wrapRef}>
      <button
        type="button"
        className={cx(styles.trigger, triggerClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={cx(styles.menu, align === 'right' && styles.alignRight, menuClassName)}
          onClick={() => {
            // Deferred: closing synchronously would unmount this menu (and
            // any <form> inside it, e.g. a submit-button DropdownItem)
            // before the browser gets to carry out the click's default
            // action — a form whose DOM node is removed mid-click has its
            // submission silently cancelled. Waiting a tick lets the
            // browser finish (submit/navigate) before React unmounts.
            setTimeout(() => setOpen(false), 0);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownLinkItemProps extends LinkProps {
  className?: string;
  children: ReactNode;
}

interface DropdownButtonItemProps extends ComponentPropsWithoutRef<'button'> {
  href?: undefined;
}

type DropdownItemProps = DropdownLinkItemProps | DropdownButtonItemProps;

/** A single menu row, styled consistently. Pass `href` for a link, or
 * `onClick`/`type="submit"` (e.g. inside a `<form>`) for an action. */
export function DropdownItem(props: DropdownItemProps) {
  const { className, children, ...rest } = props;
  if ('href' in rest && rest.href !== undefined) {
    return (
      <Link className={cx(styles.item, className)} {...(rest as LinkProps)}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cx(styles.item, className)} {...(rest as ComponentPropsWithoutRef<'button'>)}>
      {children}
    </button>
  );
}

/** A thin rule for grouping menu rows (e.g. separating admin-only links from
 * account actions) — purely visual, not itself a `role="menuitem"`. */
export function DropdownDivider({ className }: { className?: string }) {
  return <div className={cx(styles.divider, className)} role="separator" />;
}
