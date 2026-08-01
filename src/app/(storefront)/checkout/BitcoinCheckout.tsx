'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { Badge } from '@/components/ui/Badge';
import { cx } from '@/components/ui/cx';
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
  /** Sent, but not yet in a block. */
  pendingSats: number;
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
};

const STATUS_TONE: Record<WidgetStatus, 'accent' | 'success' | 'danger'> = {
  awaiting: 'accent',
  confirming: 'accent',
  paid: 'success',
  failed: 'danger',
  expired: 'danger',
  cancelled: 'danger',
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
    pendingSats: 0,
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
  /**
   * Whether the shop is still waiting to receive money — and therefore whether
   * showing a payment QR is honest.
   *
   * `confirming` on its own is not enough: it also covers "they paid in full and
   * we're waiting for blocks", where a scannable QR invites a second payment for
   * an order already settled. With no refund mechanism, that money is simply
   * gone. It also excludes a shortfall smaller than the dust tolerance, where
   * `underpaid` is false and the remainder would render as a nonsense sub-dust
   * amount nobody should send.
   */
  const owesBalance = status === 'confirming' && progress.underpaid && progress.shortfallSats > 0;
  const awaitingAnything = status === 'awaiting';
  const showPaymentQr = !quoteLapsed && (awaitingAnything || owesBalance);
  /**
   * The address and its Copy button are payment affordances too, just slower
   * ones than the QR. Once nothing is owed, offering them invites a second
   * payment for an order already settled — and with no refund mechanism that
   * money is gone. Shown whenever money is still expected, including while the
   * quote is stale (the address doesn't change on a re-quote, so it's still the
   * right one to copy).
   */
  const owesAnything = awaitingAnything || owesBalance;
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
              We received more than the expected amount. Get in touch with your order id
              and we&apos;ll sort it out with you.
            </p>
          )}
        </div>
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
        <div className={styles.payPanel}>
          <div className={cx(styles.payPanelSplit, !showPaymentQr && styles.payPanelSingle)}>
            {/* QR first in the source so it leads on a stacked layout — the
                scannable thing is what a customer on a phone is here for. Shown
                only when money is genuinely owed: a QR encodes an amount, so a
                stale one sends the wrong number of sats and one shown after full
                payment invites paying twice. When a balance is owed it encodes
                the *remainder*; scanning the original would send the whole
                amount again. */}
            {showPaymentQr && (
              <div className={styles.qrWrapper}>
                <QRCodeSVG
                  value={owesBalance && progress.topUpUri ? progress.topUpUri : bip21Uri}
                  size={220}
                />
              </div>
            )}

            <div className={styles.payDetails}>
              {status === 'confirming' && progress.underpaid ? (
                /* A part-payment isn't a dead end and mustn't read like one. The
                   order stays open, the address doesn't change, and the customer
                   can finish paying — so the useful thing to show is the balance,
                   not an instruction to email us. */
                <>
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
                </>
              ) : (
                <p className={styles.message}>
                  {status !== 'confirming'
                    ? 'Send exactly this amount to the address below.'
                    : progress.confirmedSats === 0 && progress.pendingSats > 0
                      ? /* In the mempool, not yet in a block. "0 of 3
                           confirmations" is true but reads like nothing has
                           happened, at the exact moment the customer most wants
                           to hear that their money arrived. */
                        'Payment seen — it’s waiting to be included in a block. No further payment is needed; this page will update on its own.'
                      : `Payment seen, waiting for confirmations… (${progress.confirmations} of ${progress.requiredConfirmations}). No further payment is needed.`}
                </p>
              )}

              {status === 'confirming' && progress.overpaid && (
                <p className={styles.message}>
                  We received more than the expected amount. Get in touch with your order id
                  and we&apos;ll sort it out with you.
                </p>
              )}

              {status === 'awaiting' && !quoteLapsed && (
                <p className={styles.amount}>
                  {amountBtc} BTC <span className={styles.amountFiat}>({amountFiat})</span>
                </p>
              )}

              {quoteLapsed && (
                <>
                  <p className={styles.message}>
                    This price was held for a short window and has now lapsed —
                    bitcoin&apos;s rate moves, so we can&apos;t honour an old one. Your order
                    is still open: get today&apos;s price and pay to the same address below.
                  </p>
                  <RefreshQuoteButton orderId={orderId} />
                </>
              )}

            </div>
          </div>

          {/* Full width, below the split: an address is a long unbroken string
              and cramming it into the text column wrapped it mid-hash. It is
              also its own step — scan, or copy this — so it reads better as a
              band under the instructions than as another paragraph inside them.
              The Copy button is a payment affordance like the QR, so it goes
              when nothing is owed. */}
          {owesAnything && (
            <div className={styles.addressRow}>
              <code className={styles.address}>{address}</code>
              <Button variant="secondary" type="button" onClick={copyAddress}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
