'use client';

import { useEffect, useState } from 'react';

import { getRecentlyViewedProductsAction } from '@/app/actions/products';
import { ProductCardMini, type ProductCardSummary } from '../ProductCardMini';
import styles from './page.module.css';

const STORAGE_KEY = 'recentlyViewed';
const MAX_STORED = 8;

function readStoredIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeStoredIds(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage disabled/full (e.g. private browsing) — feature degrades to
    // "no memory across visits", not an error worth surfacing.
  }
}

interface RecentlyViewedProps {
  currentProductId: string;
}

export function RecentlyViewed({ currentProductId }: RecentlyViewedProps) {
  const [products, setProducts] = useState<ProductCardSummary[]>([]);

  useEffect(() => {
    const previouslyStored = readStoredIds().filter((id) => id !== currentProductId);
    const updated = [currentProductId, ...previouslyStored].slice(0, MAX_STORED);
    writeStoredIds(updated);

    const otherIds = previouslyStored.slice(0, MAX_STORED - 1);
    let cancelled = false;

    const fetchSummaries: Promise<ProductCardSummary[]> =
      otherIds.length === 0 ? Promise.resolve([]) : getRecentlyViewedProductsAction(otherIds);

    fetchSummaries.then((result) => {
      if (!cancelled) setProducts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [currentProductId]);

  if (products.length === 0) return null;

  return (
    <section>
      <div className={styles.sectionHeader}>
        <h2>Recently viewed</h2>
      </div>
      {/* No sats figure here: the rate is fetched on the server and this
          list is assembled in the browser from localStorage. Fiat alone is
          better than a stale or invented conversion. */}
      <div className={styles.cardGrid}>
        {products.map((product) => (
          <ProductCardMini key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
