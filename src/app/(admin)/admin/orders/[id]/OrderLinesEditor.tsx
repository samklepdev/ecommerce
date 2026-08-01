'use client';

import { useActionState, useState } from 'react';

import {
  setOrderLineQuantityAction,
  addOrderLineAction,
  type EditOrderLinesActionResult,
} from '@/app/actions/admin/orders';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: EditOrderLinesActionResult = {};

export interface OrderLinesEditorLine {
  id: string;
  productName: string;
  quantity: number;
}

export interface OrderLinesEditorProps {
  orderId: string;
  lines: OrderLinesEditorLine[];
  products: { id: string; name: string }[];
  /** False once the chain has seen a payment. The panel then explains why
   * rather than disappearing — "no edit controls" and "editing is closed"
   * look identical otherwise. */
  editable: boolean;
  paymentStatus: string;
}

export function OrderLinesEditor({
  orderId,
  lines,
  products,
  editable,
  paymentStatus,
}: OrderLinesEditorProps) {
  const [quantityState, quantityAction, isQuantityPending] = useActionState(
    setOrderLineQuantityAction,
    initialState,
  );
  const [addState, addAction, isAddPending] = useActionState(addOrderLineAction, initialState);
  const [addProductId, setAddProductId] = useState('');
  const isPending = isQuantityPending || isAddPending;

  if (!editable) {
    return (
      <div className={styles.editorPanel}>
        <h2 className={styles.editorTitle}>Items</h2>
        <p className={styles.editorNote}>
          Fixed — this order is <strong>{paymentStatus}</strong>, so the chain has already seen a
          payment against its total. Changing the items now would leave the amount paid and the
          amount owed disagreeing; cancel the order instead.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.editorPanel}>
      <h2 className={styles.editorTitle}>Items</h2>
      <p className={styles.editorNote}>
        Editable until the chain sees a payment. Changing the items restates the Bitcoin amount on
        the same address — a customer holding the old QR would send the wrong amount.
      </p>

      {quantityState.error && <Alert tone="danger">{quantityState.error}</Alert>}
      {quantityState.message && <Alert tone="success">{quantityState.message}</Alert>}
      {addState.error && <Alert tone="danger">{addState.error}</Alert>}
      {addState.message && <Alert tone="success">{addState.message}</Alert>}

      <ul className={styles.editorList}>
        {lines.map((line) => (
          <li key={line.id} className={styles.editorRow}>
            <span className={styles.editorProductName}>{line.productName}</span>
            <form action={quantityAction} className={styles.editorInline}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="orderLineId" value={line.id} />
              <Input
                type="number"
                name="quantity"
                defaultValue={line.quantity}
                min={0}
                max={99}
                aria-label={`Quantity for ${line.productName}`}
                className={styles.editorQuantity}
              />
              <Button type="submit" variant="secondary" disabled={isPending}>
                Update
              </Button>
              {/* Zero is the removal gesture, same as the cart. Spelled out
                  so nobody has to guess it. */}
              <span className={styles.editorHint}>0 removes</span>
            </form>
          </li>
        ))}
      </ul>

      <form action={addAction} className={styles.editorInline}>
        <input type="hidden" name="orderId" value={orderId} />
        <Select
          name="productId"
          value={addProductId}
          onChange={(e) => setAddProductId(e.target.value)}
          aria-label="Product to add"
        >
          <option value="">Add a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          name="quantity"
          defaultValue={1}
          min={1}
          max={99}
          aria-label="Quantity to add"
          className={styles.editorQuantity}
        />
        <Button type="submit" variant="secondary" disabled={isPending || !addProductId}>
          Add
        </Button>
      </form>
    </div>
  );
}
