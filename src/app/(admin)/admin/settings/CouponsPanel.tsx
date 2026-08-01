'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CreateCouponForm } from './CreateCouponForm';
import { CouponRow } from './CouponRow';
import styles from './page.module.css';

export interface CouponsPanelCoupon {
  id: string;
  code: string;
  discountDisplay: string;
  /** Expiry and redemption limits, already worded. */
  limitsDisplay: string;
  isActive: boolean;
}

/**
 * Coupons, folded into settings.
 *
 * They were a page of their own in the sidebar, which put a rarely-touched
 * list at the same level as Orders and Products. A discount rule is a
 * setting for the storefront, so it lives beside the shipping rate — the
 * other thing that silently changes what a customer is charged.
 *
 * A client component because `Modal` takes its trigger and body as function
 * props, and functions can't cross the server→client boundary — the same
 * reason `ProductActionsBar` and `SupplierActionsBar` are clients.
 */
export function CouponsPanel({ coupons }: { coupons: CouponsPanelCoupon[] }) {
  const active = coupons.filter((c) => c.isActive).length;

  return (
    <div className={styles.panel} id="coupons">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>Coupons</h3>
        <Modal
          title="New coupon"
          className={styles.adminModal}
          trigger={(open) => (
            <Button onClick={open} variant="secondary">
              + New coupon
            </Button>
          )}
        >
          {() => <CreateCouponForm />}
        </Modal>
      </div>

      <p className={styles.panelNote}>
        Percentage or fixed-amount codes, applied server-side at checkout before the BTC quote is
        locked. A fixed amount is clamped so it can never exceed the subtotal, and the discount is
        snapshotted onto the order — deactivating a code later never alters an order that already
        used it.
      </p>

      {coupons.length === 0 ? (
        <p className={styles.empty}>No coupons yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Limits</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <CouponRow
                  key={c.id}
                  id={c.id}
                  code={c.code}
                  discountDisplay={c.discountDisplay}
                  limitsDisplay={c.limitsDisplay}
                  isActive={c.isActive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {coupons.length > 0 && (
        <p className={styles.panelNote}>
          {active} of {coupons.length} active.
        </p>
      )}
    </div>
  );
}
