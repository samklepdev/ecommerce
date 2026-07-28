'use client';

import { useActionState, useEffect, useRef } from 'react';

import { createSupplierAction, type CreateSupplierActionResult } from '@/app/actions/admin/catalog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

interface AddSupplierFormProps {
  onSuccess?: () => void;
}

const initialState: CreateSupplierActionResult = {};

export function AddSupplierForm({ onSuccess }: AddSupplierFormProps) {
  const [state, formAction, isPending] = useActionState(createSupplierAction, initialState);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) onSuccess?.();
    lastMessage.current = state.message;
  }, [state.message, onSuccess]);

  return (
    <form action={formAction} className={styles.modalForm}>
      <Field label="Name" htmlFor="supplierName">
        <Input type="text" id="supplierName" name="name" required />
      </Field>
      <Field label="URL" htmlFor="supplierUrl">
        <Input type="url" id="supplierUrl" name="url" required />
      </Field>
      <Field label="Notes" htmlFor="supplierNotes" hint="Optional">
        <Input type="text" id="supplierNotes" name="notes" />
      </Field>

      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}

      <div className={styles.modalFooter}>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add supplier'}
        </Button>
      </div>
    </form>
  );
}
