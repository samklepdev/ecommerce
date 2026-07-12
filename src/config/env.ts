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
  BTC_WATCH_INTERVAL_MS: z.coerce.number().int().positive().default(45_000),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  SUPPLIER_SYNC_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
