'use client';

import { AddSupplierForm } from './AddSupplierForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import styles from './page.module.css';

/** The one "create new" action on this page, behind a modal — same shape as
 * `ProductActionsBar`. Has to be a client component because `Modal`'s
 * trigger/body are function props, which can't cross the server→client
 * boundary; this is that boundary. */
export function SupplierActionsBar() {
  return (
    <div className={styles.actionsRow}>
      <Modal
        title="Add supplier"
        className={styles.adminModal}
        trigger={(open) => <Button onClick={open}>+ Add supplier</Button>}
      >
        {(close) => <AddSupplierForm onSuccess={close} />}
      </Modal>
    </div>
  );
}
