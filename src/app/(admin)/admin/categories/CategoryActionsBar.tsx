'use client';

import { useActionState, useEffect, useRef } from 'react';

import { createCategoryAction, type CategoryActionResult } from '@/app/actions/admin/categories';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import styles from './page.module.css';

const initialState: CategoryActionResult = {};

function AddCategoryForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, formAction, isPending] = useActionState(createCategoryAction, initialState);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) onSuccess?.();
    lastMessage.current = state.message;
  }, [state.message, onSuccess]);

  return (
    <form action={formAction} className={styles.modalForm}>
      <Field label="Name" htmlFor="categoryName" hint="The URL form is derived from this">
        <Input type="text" id="categoryName" name="name" required maxLength={80} />
      </Field>
      <Field label="Description" htmlFor="categoryDescription" hint="Optional">
        <Input type="text" id="categoryDescription" name="description" maxLength={500} />
      </Field>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <div className={styles.modalFooter}>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add category'}
        </Button>
      </div>
    </form>
  );
}

export function CategoryActionsBar() {
  return (
    <div className={styles.actionsRow}>
      <Modal
        title="Add category"
        className={styles.adminModal}
        trigger={(open) => <Button onClick={open}>+ Add category</Button>}
      >
        {(close) => <AddCategoryForm onSuccess={close} />}
      </Modal>
    </div>
  );
}
