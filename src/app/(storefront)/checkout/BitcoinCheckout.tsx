'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type WidgetStatus = 'awaiting' | 'confirming' | 'paid' | 'expired';

interface BitcoinCheckoutProps {
  orderId: string;
  address: string;
  bip21Uri: string;
  expiresAt: string | null;
}

export function BitcoinCheckout({ orderId, address, bip21Uri, expiresAt }: BitcoinCheckoutProps) {
  const [status, setStatus] = useState<WidgetStatus>('awaiting');

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

  if (status === 'paid') {
    return <p>Payment confirmed. Thank you for your order!</p>;
  }
  if (status === 'expired') {
    return <p>This payment window has expired. Please start checkout again.</p>;
  }

  return (
    <div>
      <p>
        {status === 'confirming'
          ? 'Payment seen, waiting for confirmations…'
          : 'Send exactly this amount to the address below.'}
      </p>
      <QRCodeSVG value={bip21Uri} size={220} />
      <p>
        <code>{address}</code>
      </p>
      {expiresAt && <p>Quote expires at {new Date(expiresAt).toLocaleTimeString()}</p>}
    </div>
  );
}
