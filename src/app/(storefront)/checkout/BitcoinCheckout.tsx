'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { shouldRefreshOnStatusChange, type WidgetStatus } from './bitcoin-checkout-status';
import { RefreshQuoteButton } from './RefreshQuoteButton';
import styles from './BitcoinCheckout.module.css';

interface StatusResponse {
  status: WidgetStatus;
  confirmations: number;
  requiredConfirmations: number;
  underpaid: boolean;
  overpaid: boolean;
  confirmedSats: number;
  shortfallSats: number;
  /** BIP21 for the outstanding amount, against the same address. */
  topUpUri: string | null;
}

interface BitcoinCheckoutProps {
  orderId: string;
  address: string;
  bip21Uri: string;
  expiresAt: string | null;
  amountBtc: string;
  amountFiat: string;
  /** The order's payment status as the server knows it at render time. The
   * widget polls for changes, but without this it would paint "Awaiting
   * payment" for the first ~5s of every visit — including a visit to an
   * order that settled days ago. */
  initialStatus: WidgetStatus;
}

const STATUS_LABEL: Record<WidgetStatus, string> = {
  awaiting: 'Awaiting payment',
  confirming: 'Confirming',
  paid: 'Paid',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_TONE: Record<WidgetStatus, 'accent' | 'success' | 'danger'> = {
  awaiting: 'accent',
  confirming: 'accent',
  paid: 'success',
  failed: 'danger',
  expired: 'danger',
  cancelled: 'danger',
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

export function BitcoinCheckout({
  orderId,
  address,
  bip21Uri,
  expiresAt,
  amountBtc,
  amountFiat,
  initialStatus,
}: BitcoinCheckoutProps) {
  const [progress, setProgress] = useState<StatusResponse>({
    status: initialStatus,
    confirmations: 0,
    confirmedSats: 0,
    shortfallSats: 0,
    topUpUri: null,
    requiredConfirmations: 0,
    underpaid: false,
    overpaid: false,
  });
  const [copied, setCopied] = useState(false);
  const { status } = progress;
  const countdown = useCountdown(status === 'awaiting' ? expiresAt : null);
  // The rate lock has run out, but the order hasn't: the customer needs a
  // new price, not a new checkout. Reads "0:00" rather than a missing
  // countdown, so this only fires once the clock has genuinely elapsed.
  const quoteLapsed = status === 'awaiting' && countdown === '0:00';
  const router = useRouter();
  const lastStatusRef = useRef<WidgetStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setProgress(data);
        if (shouldRefreshOnStatusChange(lastStatusRef.current, data.status)) {
          router.refresh();
        }
        lastStatusRef.current = data.status;
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
  }, [orderId, router]);

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
        <div className={styles.stack}>
          <p className={styles.message}>Payment confirmed. Thank you for your order!</p>
          {progress.overpaid && (
            <p className={styles.message}>
              We received more than the expected amount — contact support with your order id
              about a refund of the difference.
            </p>
          )}
        </div>
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

      {status === 'cancelled' && (
        <p className={styles.message}>This order was cancelled.</p>
      )}

      {(status === 'awaiting' || status === 'confirming') && (
        <div className={styles.stack}>
          {status === 'confirming' && progress.underpaid ? (
            /* A part-payment isn't a dead end and mustn't read like one. The
               order stays open, the address doesn't change, and the customer
               can finish paying — so the useful thing to show is the balance,
               not an instruction to email us. */
            <div className={styles.stack}>
              <p className={styles.message}>
                We&apos;ve received {satsToBtcString(progress.confirmedSats)} BTC of{' '}
                {amountBtc} BTC. Send the remaining{' '}
                <strong>{satsToBtcString(progress.shortfallSats)} BTC</strong> to the same
                address below to complete your order.
              </p>
              <p className={styles.message}>
                The amount owed is fixed at the rate you were originally quoted — it
                won&apos;t move while you finish paying.
              </p>
            </div>
          ) : (
            <p className={styles.message}>
              {status === 'confirming'
                ? `Payment seen, waiting for confirmations… (${progress.confirmations} of ${progress.requiredConfirmations})`
                : 'Send exactly this amount to the address below.'}
            </p>
          )}

          {status === 'confirming' && progress.overpaid && (
            <p className={styles.message}>
              We received more than the expected amount — contact support with your order id
              about a refund of the difference.
            </p>
          )}

          {status === 'awaiting' && !quoteLapsed && (
            <p className={styles.amount}>
              {amountBtc} BTC <span className={styles.amountFiat}>({amountFiat})</span>
            </p>
          )}

          {quoteLapsed && (
            <div className={styles.stack}>
              <p className={styles.message}>
                This price was held for a short window and has now lapsed — bitcoin&apos;s rate
                moves, so we can&apos;t honour an old one. Your order is still open: get today&apos;s
                price and pay to the same address below.
              </p>
              <RefreshQuoteButton orderId={orderId} />
            </div>
          )}

          {/* Hidden while the price is stale: a QR encodes the amount, and
              scanning a lapsed one would send the wrong number of sats. Once
              part-paid, it encodes the *remainder* — scanning the original
              would send the full amount a second time. */}
          {!quoteLapsed && (
            <div className={styles.qrWrapper}>
              <QRCodeSVG value={progress.topUpUri ?? bip21Uri} size={220} />
            </div>
          )}

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
