/**
 * The kill switch, from a terminal.
 *
 * This is the trigger that has to work when the others don't: no browser, no
 * session, no working storefront, no admin console. It talks to Redis
 * through the same adapter the app uses, so there's no second definition of
 * what "closed" means on disk.
 *
 * Usage:
 *   npm run store:close                     # shut the storefront
 *   npm run store:close -- "supplier outage" # ...with a note for the audit log
 *   npm run store:open                      # reopen
 *   npm run store:status                    # is it open?
 *
 * It does NOT stop the BTC watcher. Coins already sent still need
 * confirming, and orders already paid still need fulfilling — closing the
 * front door must not strand someone who paid before you shut it. Stopping
 * the watcher is a separate, deliberate act (stop that process).
 *
 * Takes effect immediately, including on the storefront: every route in that
 * group renders dynamically (the layout reads headers for analytics), so
 * there is no cached page to wait out. Verified against a production build,
 * not assumed.
 */
import { getContainer } from '../src/composition/container';

type Command = 'close' | 'open' | 'status';

function parseCommand(raw: string | undefined): Command {
  if (raw === 'close' || raw === 'open' || raw === 'status') return raw;
  console.error('Usage: npm run store:close | store:open | store:status');
  process.exit(1);
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const reason = process.argv.slice(3).join(' ').trim() || null;
  const { getStoreAvailability, setStoreAvailability } = getContainer();

  if (command === 'status') {
    const { isOpen, closure } = await getStoreAvailability.execute();
    if (isOpen) {
      console.log('Store is OPEN.');
    } else {
      console.log(
        `Store is CLOSED since ${closure?.closedAt.toISOString()} by ${closure?.closedBy}` +
          (closure?.reason ? ` — ${closure.reason}` : ''),
      );
    }
    process.exit(0);
  }

  const isOpen = command === 'open';
  await setStoreAvailability.execute({
    isOpen,
    reason,
    // No session here, so the audit entry says which door was used rather
    // than naming a person it can't verify.
    actor: { userId: null, email: 'cli' },
  });

  console.log(
    isOpen
      ? 'Store REOPENED. Customers can browse and check out again.'
      : `Store CLOSED. Checkout refuses and the storefront serves a closed page.${
          reason ? ` Reason: ${reason}` : ''
        }`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed to flip the store kill switch:', e instanceof Error ? e.message : e);
  process.exit(1);
});
