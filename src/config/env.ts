import { z } from 'zod';

/**
 * The only file allowed to read `process.env`. Everything else imports `env`
 * from here.
 */

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
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // Base URL used to build absolute links in outgoing email (e.g. the
  // welcome-email tracking pixel) — never derived from a request header.
  APP_URL: z.string().url().default('http://localhost:3000'),

  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // The Footer's "Contact support" mailto: link — swap for a real address
  // via env, no code change needed.
  SUPPORT_EMAIL: z.string().email().default('support@storefront.example'),

  // Development affordance. Locally there is no `x-forwarded-for` header, so
  // `getClientIp()` yields 'unknown' and analytics records no country —
  // the geo features look permanently broken while you build them. Set this
  // to any public address to see them populate. Forced to undefined outside
  // development below, so it can never launder a fake IP into real data.
  ANALYTICS_DEV_IP: z.string().min(1).optional(),
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
