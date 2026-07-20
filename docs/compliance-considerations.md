# Compliance considerations

**This is not legal advice.** It's a starting checklist of the categories of
obligation that typically come up for a store accepting non-custodial
on-chain Bitcoin payments directly (no payment processor absorbing this on
your behalf) — meant to be brought to a licensed attorney and accountant in
your actual operating jurisdiction before launch, not treated as a
determination of what applies to you.

## Why this exists

With a card processor (Stripe, etc.), the processor absorbs most of the
regulatory surface: KYC on the merchant, cardholder dispute handling,
various reporting. This app has no processor in the payment path —
`OnChainBitcoinPaymentGateway` talks directly to the chain — so obligations
a processor would normally carry are yours to evaluate.

## Categories to ask about

- **KYC/AML and money-transmitter licensing.** Whether accepting BTC as
  payment for goods (as opposed to, say, operating an exchange) triggers
  money-transmitter or similar licensing questions varies enormously by
  jurisdiction, and the answer is genuinely unsettled or contested in some.
  This is the single question most worth a real answer before volume grows.
- **Large-transaction reporting.** Some jurisdictions impose reporting
  requirements on large cash-equivalent transactions above a threshold
  (e.g. the US's Form 8300 regime). Whether/how this applies to on-chain
  crypto receipts is jurisdiction- and fact-specific.
- **Standard merchant tax obligations.** Ordinary income reporting on
  revenue, and sales/VAT tax on physical goods where applicable — the same
  obligations any merchant has, just denominated in BTC and needing a
  fiat-value basis at time of receipt.
- **Record-keeping.** The `orders` and `bitcoin_payment_intents` tables
  already durably record who paid what, when, and at what BTC/fiat rate —
  a practical head start on record-keeping regardless of what's ultimately
  required, but not itself a compliance program.

## Bottom line

This is a starting checklist, not a compliance determination — get a real
answer from a professional in your jurisdiction before relying on any of it.
