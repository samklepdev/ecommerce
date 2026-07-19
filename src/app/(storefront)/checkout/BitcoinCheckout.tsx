'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './BitcoinCheckout.module.css';

type WidgetStatus = 'awaiting' | 'confirming' | 'paid' | 'failed' | 'expired' | 'refunded';

interface StatusResponse {
  status: WidgetStatus;
  confirmations: number;
  requiredConfirmations: number;
  underpaid: boolean;
}

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
  failed: 'Failed',
  expired: 'Expired',
  refunded: 'Refunded',
};

const STATUS_TONE: Record<WidgetStatus, 'accent' | 'success' | 'danger'> = {
  awaiting: 'accent',
  confirming: 'accent',
  paid: 'success',
  failed: 'danger',
  expired: 'danger',
  refunded: 'danger',
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

const initialProgress: StatusResponse = {
  status: 'awaiting',
  confirmations: 0,
  requiredConfirmations: 0,
  underpaid: false,
};

export function BitcoinCheckout({ orderId, address, bip21Uri, expiresAt }: BitcoinCheckoutProps) {
  const [progress, setProgress] = useState<StatusResponse>(initialProgress);
  const [copied, setCopied] = useState(false);
  const { status } = progress;
  const countdown = useCountdown(status === 'awaiting' ? expiresAt : null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (!cancelled) setProgress(data);
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

      {status === 'refunded' && (
        <p className={styles.message}>This order has been refunded.</p>
      )}

      {status === 'failed' && (
        <div className={styles.stack}>
          <p className={styles.message}>This payment could not be completed.</p>
          <Link href="/cart">
            <Button variant="secondary">Back to cart</Button>
          </Link>
        </div>
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
          {status === 'confirming' && progress.underpaid ? (
            <p className={styles.message}>
              We received less than the expected amount. This needs manual review — please
              contact support with your order id.
            </p>
          ) : (
            <p className={styles.message}>
              {status === 'confirming'
                ? `Payment seen, waiting for confirmations… (${progress.confirmations} of ${progress.requiredConfirmations})`
                : 'Send exactly this amount to the address below.'}
            </p>
          )}

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
