'use client';

import { AddSupplierForm } from '../suppliers/AddSupplierForm';
import { AddProductForm } from './AddProductForm';
import { ImportFeedForm } from './ImportFeedForm';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/components/ui/cx';
import styles from './page.module.css';

interface Supplier {
  id: string;
  name: string;
}

interface ProductActionsBarProps {
  suppliers: Supplier[];
}

/** The "create new" actions (add supplier / import feed / add product), each
 * behind its own modal. Has to be a client component because `Modal`'s
 * trigger/body are function props — those can't cross the server→client
 * boundary, so this is the boundary itself. */
export function ProductActionsBar({ suppliers }: ProductActionsBarProps) {
  return (
    <div className={styles.actionsRow}>
      <Modal
        title="Add supplier"
        className={styles.adminModal}
        trigger={(open) => <Button onClick={open}>+ Add supplier</Button>}
      >
        {(close) => <AddSupplierForm onSuccess={close} />}
      </Modal>

      <Modal
        title="Import Products"
        className={styles.adminModal}
        trigger={(open) => (
          <Button onClick={open} variant="secondary">
            + Import Products
          </Button>
        )}
      >
        {suppliers.length === 0 ? (
          <p className={styles.empty}>Add a supplier first.</p>
        ) : (
          <ImportFeedForm suppliers={suppliers} />
        )}
      </Modal>

      <Modal
        title="Add product"
        className={cx(styles.adminModal, styles.addProductModal)}
        trigger={(open) => (
          <Button onClick={open} variant="secondary">
            + Add product
          </Button>
        )}
      >
        {(close) =>
          suppliers.length === 0 ? (
            <p className={styles.empty}>Add a supplier first.</p>
          ) : (
            <AddProductForm suppliers={suppliers} onSuccess={close} />
          )
        }
      </Modal>
    </div>
  );
}
