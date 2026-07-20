/**
 * Promotes an existing account to admin — the real replacement for hand-run
 * `UPDATE users SET role = 'admin'` SQL. The account must already exist
 * (sign up normally first, then run this).
 *
 * Usage:
 *   npm run admin:promote -- someone@example.com
 */
import { getContainer } from '../src/composition/container';
import { isErr } from '../src/shared/domain/result';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run admin:promote -- <email>');
    process.exit(1);
  }

  const { promoteUserToAdmin } = getContainer();
  const result = await promoteUserToAdmin.execute({ email });

  if (isErr(result)) {
    console.error(`No account exists for "${email}" — sign up first, then promote.`);
    process.exit(1);
  }

  console.log(`${email} is now an admin.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('bootstrap-admin failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
