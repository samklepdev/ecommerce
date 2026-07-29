import { z } from 'zod';

/**
 * The only file allowed to read `process.env`. Everything else imports `env`
 * from here.
 */

const emptyAsUndefined = (v: unknown) => (v === '' ? undefined : v);

const PUBLIC_KEY_PREFIXES = ['xpub', 'ypub', 'zpub', 'tpub', 'upub', 'vpub'];
const PRIVATE_KEY_PREFIXES = ['xprv', 'yprv', 'zprv', 'tprv', 'uprv', 'vprv'];

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Watch-only public key for m/84'/0'/0'. Never a seed, mnemonic, or private
  // extended key — a server compromise must not be able to move funds.
  BTC_ACCOUNT_XPUB: z
    .string()
    .min(1)
    .refine((v) => !PRIVATE_KEY_PREFIXES.some((p) => v.startsWith(p)), {
      message:
        'BTC_ACCOUNT_XPUB looks like a PRIVATE extended key (xprv/tprv/...). Only a ' +
        'watch-only public xpub may ever be set here.',
    })
    .refine((v) => PUBLIC_KEY_PREFIXES.some((p) => v.startsWith(p)), {
      message: 'BTC_ACCOUNT_XPUB must be a public extended key (xpub/tpub/...).',
    }),
  BTC_NETWORK: z.enum(['bitcoin', 'testnet']).default('testnet'),
  BTC_ESPLORA_URL: z.string().url().default('https://mempool.space/api'),
  /**
   * The fiat price feed — deliberately separate from BTC_ESPLORA_URL.
   *
   * `/v1/prices` is a mempool.space extension, not part of the Esplora API,
   * so pointing both at a self-hosted electrs/Esplora (which this repo's own
   * deployment guide recommends) made every checkout fail on a 404 at the
   * rate lookup. They're different services that happen to share a host by
   * default.
   */
  BTC_RATE_URL: z.string().url().default('https://mempool.space/api'),
  BTC_REQUIRED_CONFIRMATIONS: z.coerce.number().int().positive().default(2),
  // Extra confirmations layered on top of BTC_REQUIRED_CONFIRMATIONS before
  // an order is actually marked paid/fulfilled — a reorg-safety margin, not
  // a change to the nominal/documented requirement. Threaded through as one
  // unified "effective" number everywhere confirmations are checked or
  // displayed, so the customer-facing progress count and the actual gate
  // never disagree (see container.ts).
  BTC_SETTLEMENT_BUFFER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(1),
  BTC_WATCH_INTERVAL_MS: z.coerce.number().int().positive().default(45_000),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  // The rate lock. Short on purpose: every minute of it is BTC/USD exposure
  // on a price already quoted to a customer.
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // How long the order stays open for payment, re-quoting as needed. The
  // customer-facing promise ("you have a day to pay"), decoupled from the
  // rate lock so neither number has to compromise for the other.
  ORDER_PAYMENT_WINDOW_HOURS: z.coerce.number().int().positive().default(24),

  // Base URL used to build absolute links in outgoing email (e.g. the
  // welcome-email tracking pixel) — never derived from a request header.
  APP_URL: z.string().url().default('http://localhost:3000'),

  // The kill switch's out-of-band trigger, reachable at
  // `/api/ops/<STORE_SWITCH_PATH>`. Both of these must be set or the route
  // does not exist at all — a shutdown endpoint with no secret behind it is
  // worse than no endpoint.
  //
  // The path is itself a secret, which is why it comes from env rather than
  // being a literal in the repo: there is no URL to find by reading the
  // source or by scanning. Generate both with `npm run store:switch-setup`.
  STORE_SWITCH_PATH: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(16, 'STORE_SWITCH_PATH must be at least 16 characters — it is a secret, not a name')
      .regex(/^[A-Za-z0-9_-]+$/, 'STORE_SWITCH_PATH must be URL-safe (A-Z a-z 0-9 _ -)')
      .optional(),
  ),
  // Base32 shared secret for the 6-digit code, as held by your authenticator
  // app. 32 base32 chars = 160 bits, the RFC 6238 recommendation. A static
  // token would stay valid forever once it appeared in a log; this doesn't.
  STORE_SWITCH_TOTP_SECRET: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(32, 'STORE_SWITCH_TOTP_SECRET must be at least 32 base32 characters')
      .regex(/^[A-Z2-7]+=*$/i, 'STORE_SWITCH_TOTP_SECRET must be base32 (A-Z, 2-7)')
      .optional(),
  ),

  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // The Footer's "Contact support" mailto: link — swap for a real address
  // via env, no code change needed.
  SUPPORT_EMAIL: z.string().email().default('support@storefront.example'),

  // Outbound email. Unset, the app falls back to ConsoleEmailSender, which
  // logs instead of sending — fine for local dev, but it means password
  // resets and order confirmations never reach a customer, so production
  // needs both of these. The pair is validated together below.
  // Blank reads as absent, not as a validation failure: `KEY=` with nothing
  // after it is how a .env file normally says "not configured yet", and
  // failing the whole boot over it would be obnoxious.
  RESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  /** The verified sender address on the Resend account (e.g.
   * `orders@yourshop.com`). Resend rejects anything unverified. */
  EMAIL_FROM: z.preprocess(emptyAsUndefined, z.string().email().optional()),

  // Where the DB-IP database lives. Defaults to the copy in the repo, but
  // on a server it's better kept outside the working tree — the archive is
  // 59 MB and a monthly refresh would otherwise add that to git history
  // permanently. Point this at e.g. /var/lib/storefront/dbip-city-lite.mmdb.gz
  // and refresh it in place with `npm run geo:fetch`.
  IP_GEO_DB_PATH: z.string().min(1).optional(),

  // Development affordance. Locally there is no `x-forwarded-for` header, so
  // `getClientIp()` yields 'unknown' and analytics records no country —
  // the geo features look permanently broken while you build them. Set this
  // to any public address to see them populate. Forced to undefined outside
  // development below, so it can never launder a fake IP into real data.
  ANALYTICS_DEV_IP: z.string().min(1).optional(),
})
  // A key with no verified sender is a boot-time misconfiguration that would
  // otherwise surface as every email failing at Resend, one silent 422 at a
  // time. Fail here instead.
  .refine((v) => !v.RESEND_API_KEY || v.EMAIL_FROM, {
    path: ['EMAIL_FROM'],
    message: 'EMAIL_FROM is required when RESEND_API_KEY is set — Resend rejects unverified senders.',
  });

const parsed = envSchema.parse(process.env);

export const env: Env = {
  ...parsed,
  // Gated here rather than at the call site so this stays the only file that
  // reads process.env.
  ANALYTICS_DEV_IP:
    process.env.NODE_ENV === 'development' ? parsed.ANALYTICS_DEV_IP : undefined,
};

export type Env = z.infer<typeof envSchema>;
