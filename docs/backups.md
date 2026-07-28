# Backups and restore

Postgres holds the only record that an order exists, what was owed, which
address it was owed to, and whether it settled. There is no processor to
reconcile against and no second copy anywhere — on-chain data proves that
*an address* was paid, not who it belonged to or what they bought. Losing
this database loses the business.

Everything else is reconstructible:

- **Redis** — carts, sessions, idempotency keys, rate-limit counters, the
  watcher heartbeat, and the BTC address-index counter. All disposable
  except the counter, and that self-heals: the payment gateway raises it to
  `max(address_index) + 1` from Postgres before its first allocation, so a
  wiped Redis re-seeds from the database rather than re-issuing addresses.
- **Uploaded images** — `public/uploads/` on local disk today. Not covered
  by this procedure, and another reason to move to object storage before
  launch.

## Taking a backup

```bash
DATABASE_URL=postgres://... ./scripts/backup-db.sh
```

Writes `./backups/ecommerce-<UTC timestamp>.dump` (pg_dump custom format),
verifies the file is a readable dump, and prunes anything older than
`RETENTION_DAYS` (default 14). Override `BACKUP_DIR` and `RETENTION_DAYS` as
needed.

Run it on a schedule — hourly is not excessive for a store taking
irreversible payments, since the window between backups is the window of
orders you would have to reconstruct from the chain by hand. Cron example:

```cron
17 * * * * cd /srv/storefront && BACKUP_DIR=/var/backups/storefront RETENTION_DAYS=30 ./scripts/backup-db.sh >> /var/log/storefront-backup.log 2>&1
```

**Store them off the box.** A backup on the same disk as the database
survives exactly the failures that don't matter. Sync `BACKUP_DIR` to object
storage (S3/R2 with versioning and a lifecycle rule) as a second step.

## Restoring

```bash
# 1. Stop the writers first. A restore into a live database races the
#    watcher, which is actively transitioning orders.
docker compose stop web worker

# 2. Restore into a fresh database, never over a live one — --clean on a
#    database you still need is how a bad backup becomes no database.
createdb -T template0 ecommerce_restored
pg_restore --dbname=ecommerce_restored --no-owner --jobs=4 backups/ecommerce-<stamp>.dump

# 3. Check it holds what you expect before cutting over.
psql ecommerce_restored -c 'select count(*), max(created_at) from orders;'

# 4. Point DATABASE_URL at the restored database and start back up.
docker compose up -d web worker
```

## After any restore, reconcile the chain

The database is a projection of on-chain events, so a restore rolls back to
the last backup while the chain has kept moving. Payments that confirmed in
between are simply absent.

The watcher recovers most of this by itself: it re-polls every awaiting
address and `ConfirmPayment` de-dupes by event id, so a payment it already
processed before the backup is not re-applied, and one it missed is picked
up on the next pass. What it cannot recover is an order that was *created*
after the backup — that row is gone, along with the address derived for it.

So after a restore:

1. Let the watcher run a full pass and confirm orders are settling.
2. Check the address-index counter is at or above the wallet's real
   next-unused index (see the BIP32 note in CLAUDE.md). It self-seeds from
   the restored database, which may be behind the wallet.
3. Reconcile the wallet's received transactions against `orders` for the
   gap window. Anything paid to an address with no matching order is a
   customer who paid for an order the restore lost — contact them.

## Drill it

Restore into a scratch database once before launch and once a quarter after,
and time it. The number you want to know is how long step 2 takes on a
production-sized dump, because that is your recovery time — and the first
time you measure it should not be during an outage.
