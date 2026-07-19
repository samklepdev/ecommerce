'use client';

import { useActionState, useState } from 'react';

import {
  addProductImagesAction,
  removeProductImageAction,
  removePrimaryProductImageAction,
  type AddProductImagesActionResult,
  type RemoveProductImageActionResult,
  type RemovePrimaryProductImageActionResult,
} from '@/app/actions/admin/catalog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './ProductImagesManager.module.css';

const addInitialState: AddProductImagesActionResult = {};
const removeInitialState: RemoveProductImageActionResult = {};
const removePrimaryInitialState: RemovePrimaryProductImageActionResult = {};

/** A nonce that bumps whenever `result` is a new object (useActionState
 * returns a fresh one per dispatch, even with identical text) — used to
 * `key` the alert so a repeat submission restarts its fade-out animation.
 * Adjusts state during render rather than in an effect, per React's
 * guidance for resetting state in response to a prop change. */
function useResultNonce(result: unknown): number {
  const [[prev, nonce], setState] = useState<[unknown, number]>([result, 0]);
  if (prev !== result) {
    setState([result, nonce + 1]);
  }
  return nonce;
}

export interface ProductImagesManagerProps {
  productId: string;
  productName: string;
  imageUrl: string | null;
  additionalImages: { id: string; url: string }[];
}

/** Lets an admin attach image files they downloaded themselves, bypassing
 * the automated supplier-fetch path entirely (useful when a supplier's
 * images are hotlink-protected or otherwise unreachable from the server).
 * The first image added becomes the primary image; every image after that
 * is an additional (hover) image, removable individually. */
export function ProductImagesManager({
  productId,
  productName,
  imageUrl,
  additionalImages,
}: ProductImagesManagerProps) {
  const [addState, addFormAction, isAddPending] = useActionState(
    addProductImagesAction,
    addInitialState,
  );
  const [removeState, removeFormAction, isRemovePending] = useActionState(
    removeProductImageAction,
    removeInitialState,
  );
  const [removePrimaryState, removePrimaryFormAction, isRemovePrimaryPending] = useActionState(
    removePrimaryProductImageAction,
    removePrimaryInitialState,
  );
  const isPending = isAddPending || isRemovePending || isRemovePrimaryPending;

  const addNonce = useResultNonce(addState);
  const removeNonce = useResultNonce(removeState);
  const removePrimaryNonce = useResultNonce(removePrimaryState);

  return (
    <div className={styles.wrap}>
      {(imageUrl || additionalImages.length > 0) && (
        <ul className={styles.gallery}>
          {imageUrl && (
            <li className={styles.galleryItem}>
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className={styles.galleryThumb} />
                <form action={removePrimaryFormAction} className={styles.removeForm}>
                  <input type="hidden" name="productId" value={productId} />
                  <Button
                    type="submit"
                    variant="ghost"
                    className={styles.removeButton}
                    disabled={isPending}
                    title="Remove image"
                  >
                    ×
                  </Button>
                </form>
              </div>
              <span className={styles.galleryLabel}>Primary</span>
            </li>
          )}
          {additionalImages.map((img) => (
            <li key={img.id} className={styles.galleryItem}>
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className={styles.galleryThumb} />
                <form action={removeFormAction} className={styles.removeForm}>
                  <input type="hidden" name="imageId" value={img.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    className={styles.removeButton}
                    disabled={isPending}
                    title="Remove image"
                  >
                    ×
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addFormAction} className={styles.form}>
        <input type="hidden" name="productId" value={productId} />
        <input
          type="file"
          name="images"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={`Add images for ${productName}`}
        />
        <Button type="submit" variant="ghost" disabled={isPending}>
          {imageUrl ? 'Add image(s)' : 'Upload image(s)'}
        </Button>
      </form>

      {addState.error && (
        <Alert key={addNonce} tone="danger" className={styles.fadeAlert}>
          {addState.error}
        </Alert>
      )}
      {addState.message && (
        <Alert key={addNonce} tone="success" className={styles.fadeAlert}>
          {addState.message}
        </Alert>
      )}
      {removeState.error && (
        <Alert key={removeNonce} tone="danger" className={styles.fadeAlert}>
          {removeState.error}
        </Alert>
      )}
      {removeState.message && (
        <Alert key={removeNonce} tone="success" className={styles.fadeAlert}>
          {removeState.message}
        </Alert>
      )}
      {removePrimaryState.error && (
        <Alert key={removePrimaryNonce} tone="danger" className={styles.fadeAlert}>
          {removePrimaryState.error}
        </Alert>
      )}
      {removePrimaryState.message && (
        <Alert key={removePrimaryNonce} tone="success" className={styles.fadeAlert}>
          {removePrimaryState.message}
        </Alert>
      )}
    </div>
  );
}
