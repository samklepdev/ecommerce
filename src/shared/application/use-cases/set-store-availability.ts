import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { StoreAvailabilityStore } from '@/shared/application/ports/store-availability';
import type { RecordAuditLogEntry } from '@/modules/audit/application/use-cases/record-audit-log-entry';

export interface SetStoreAvailabilityInput {
  isOpen: boolean;
  /** Operator note, kept internal. Ignored when opening. */
  reason?: string | null;
  /** Who is flipping it. `email` carries `cli` or `token` for the
   * out-of-band triggers, which have no session behind them — the audit log
   * should still say which door was used. */
  actor: { userId: string | null; email: string };
}

/**
 * Flips the kill switch, from any of its three triggers: the admin toggle,
 * the CLI script, or the token URL.
 *
 * All three land here so all three are audited identically. That matters
 * more than usual: the two out-of-band triggers exist precisely for moments
 * when the normal path isn't available, which is exactly when you'll later
 * want to know what happened and who did it. The audit recorder tolerates
 * running outside a request, so the CLI path records too — with a null
 * origin rather than a missing entry.
 *
 * Cache invalidation is *not* done here. Blowing the ISR cache needs
 * `revalidatePath`, which is a Next binding and would drag the framework
 * into the application layer; the callers that have one do it. The switch is
 * still authoritative the moment this returns, because the guard on the
 * money path reads Redis and never a cached page.
 */
export class SetStoreAvailability implements UseCase<SetStoreAvailabilityInput, void> {
  constructor(
    private readonly store: StoreAvailabilityStore,
    private readonly auditLog: RecordAuditLogEntry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SetStoreAvailabilityInput): Promise<void> {
    if (input.isOpen) {
      await this.store.open();
    } else {
      await this.store.close({
        closedAt: this.now(),
        reason: input.reason?.trim() ? input.reason.trim() : null,
        closedBy: input.actor.email,
      });
    }

    // Logged as well as audited: the audit log is a database read away, and
    // the first thing you do when the store is unexpectedly shut is tail the
    // logs.
    logger.warn(input.isOpen ? 'store REOPENED' : 'store CLOSED by kill switch', {
      actor: input.actor.email,
      reason: input.reason ?? null,
    });

    await this.auditLog.execute({
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      action: input.isOpen ? 'store.opened' : 'store.closed',
      targetType: 'store',
      targetId: 'default',
      metadata: input.isOpen ? {} : { reason: input.reason ?? null },
    });
  }
}
