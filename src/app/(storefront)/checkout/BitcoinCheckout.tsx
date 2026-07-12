'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './BitcoinCheckout.module.css';

type WidgetStatus = 'awaiting' | 'confirming' | 'paid' | 'expired';

interface BitcoinCheckoutProps {
  orderId: string;
  address: string;
  bip21Uri: string;
  expiresAt: string | null;
}

const STATUS_LABEL: Record<WidgetStatus, string> = {
  awaiting: 'Awaiting payment',
  confirming: 'Confirming',
  paid: 'Paid',
  expired: 'Expired',
};

const STATUS_TONE: Record<WidgetStatus, 'accent' | 'success' | 'danger'> = {
  awaiting: 'accent',
  confirming: 'accent',
  paid: 'success',
  expired: 'danger',
};

function useCountdown(expiresAt: string | null): string | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();

    function tick() {
      setRemainingMs(Math.max(0, target - Date.now()));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (remainingMs === null) return null;
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function BitcoinCheckout({ orderId, address, bip21Uri, expiresAt }: BitcoinCheckoutProps) {
  const [status, setStatus] = useState<WidgetStatus>('awaiting');
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(status === 'awaiting' ? expiresAt : null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { status: WidgetStatus };
        if (!cancelled) setStatus(data.status);
      } catch {
        // transient network error — next interval retries
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the address is still selectable text
    }
  }

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        {countdown && <span className={styles.countdown}>Expires in {countdown}</span>}
      </div>

      {status === 'paid' && (
        <p className={styles.message}>Payment confirmed. Thank you for your order!</p>
      )}

      {status === 'expired' && (
        <div className={styles.stack}>
          <p className={styles.message}>
            This payment window has expired. Please start checkout again.
          </p>
          <Link href="/cart">
            <Button variant="secondary">Back to cart</Button>
          </Link>
        </div>
      )}

      {(status === 'awaiting' || status === 'confirming') && (
        <div className={styles.stack}>
          <p className={styles.message}>
            {status === 'confirming'
              ? 'Payment seen, waiting for confirmations…'
              : 'Send exactly this amount to the address below.'}
          </p>

          <div className={styles.qrWrapper}>
            <QRCodeSVG value={bip21Uri} size={220} />
          </div>

          <div className={styles.addressRow}>
            <code className={styles.address}>{address}</code>
            <Button variant="secondary" type="button" onClick={copyAddress}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
