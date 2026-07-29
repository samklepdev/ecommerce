import { describe, expect, it } from 'vitest';

import { AssertStoreOpenForCheckout } from './assert-store-open-for-checkout';
import { GetStoreAvailability } from './get-store-availability';
import { SetStoreAvailability } from './set-store-availability';
import type {
  StoreAvailabilityStore,
  StoreClosure,
} from '@/shared/application/ports/store-availability';
import type { RecordAuditLogEntry } from '@/modules/audit/application/use-cases/record-audit-log-entry';

const CLOSURE: StoreClosure = {
  closedAt: new Date('2026-07-29T12:00:00Z'),
  reason: 'supplier outage',
  closedBy: 'admin@example.com',
};

function makeStore(initial: StoreClosure | null = null) {
  let current = initial;
  const store: StoreAvailabilityStore = {
    async read() {
      return current;
    },
    async close(closure) {
      current = closure;
    },
    async open() {
      current = null;
    },
  };
  return { store, get current() { return current; } };
}

/** A store whose reads throw — Redis unreachable. */
const unreachable: StoreAvailabilityStore = {
  async read() {
    throw new Error('ECONNREFUSED');
  },
  async close() {},
  async open() {},
};

function makeAuditLog() {
  const entries: unknown[] = [];
  const auditLog = {
    async execute(entry: unknown) {
      entries.push(entry);
    },
  } as unknown as RecordAuditLogEntry;
  return { auditLog, entries };
}

describe('GetStoreAvailability', () => {
  it('is open when nothing is stored', async () => {
    const { store } = makeStore(null);

    expect(await new GetStoreAvailability(store).execute()).toEqual({
      isOpen: true,
      closure: null,
    });
  });

  it('is closed, with the closure details, when the switch is set', async () => {
    const { store } = makeStore(CLOSURE);

    const result = await new GetStoreAvailability(store).execute();

    expect(result.isOpen).toBe(false);
    expect(result.closure).toEqual(CLOSURE);
  });

  // Deliberately the opposite of the checkout guard below. A Redis blip must
  // not take a browsable catalogue offline, and this runs during `next
  // build`, where Redis is intentionally absent.
  it('treats an unreachable store as OPEN rather than closing the shop itself', async () => {
    expect(await new GetStoreAvailability(unreachable).execute()).toEqual({
      isOpen: true,
      closure: null,
    });
  });
});

describe('AssertStoreOpenForCheckout', () => {
  it('allows checkout when the switch is off', async () => {
    const { store } = makeStore(null);

    expect(await new AssertStoreOpenForCheckout(store).execute()).toBe(true);
  });

  it('refuses checkout when the switch is on', async () => {
    const { store } = makeStore(CLOSURE);

    expect(await new AssertStoreOpenForCheckout(store).execute()).toBe(false);
  });

  // The asymmetry that matters: money fails closed. Checkout can't work
  // without Redis anyway (the BTC address index is a Redis INCR), so this
  // costs nothing that wasn't already broken.
  it('treats an unreachable store as CLOSED rather than taking a payment it cannot track', async () => {
    expect(await new AssertStoreOpenForCheckout(unreachable).execute()).toBe(false);
  });
});

describe('SetStoreAvailability', () => {
  const actor = { userId: 'u1', email: 'admin@example.com' };

  it('closes the store, recording who and why', async () => {
    const state = makeStore(null);
    const { auditLog, entries } = makeAuditLog();
    const now = new Date('2026-07-29T12:00:00Z');

    await new SetStoreAvailability(state.store, auditLog, () => now).execute({
      isOpen: false,
      reason: 'supplier outage',
      actor,
    });

    expect(state.current).toEqual({
      closedAt: now,
      reason: 'supplier outage',
      closedBy: 'admin@example.com',
    });
    expect(entries).toEqual([
      {
        actorUserId: 'u1',
        actorEmail: 'admin@example.com',
        action: 'store.closed',
        targetType: 'store',
        targetId: 'default',
        metadata: { reason: 'supplier outage' },
      },
    ]);
  });

  it('reopens the store and audits that separately', async () => {
    const state = makeStore(CLOSURE);
    const { auditLog, entries } = makeAuditLog();

    await new SetStoreAvailability(state.store, auditLog).execute({ isOpen: true, actor });

    expect(state.current).toBeNull();
    expect(entries).toHaveLength(1);
    expect((entries[0] as { action: string }).action).toBe('store.opened');
  });

  it('normalises a blank reason to null rather than storing whitespace', async () => {
    const state = makeStore(null);
    const { auditLog } = makeAuditLog();

    await new SetStoreAvailability(state.store, auditLog).execute({
      isOpen: false,
      reason: '   ',
      actor,
    });

    expect(state.current?.reason).toBeNull();
  });

  // The out-of-band triggers have no session. The audit entry should still
  // say which door was used — that's the whole point of recording it.
  it('records the trigger for a CLI flip that has no user behind it', async () => {
    const state = makeStore(null);
    const { auditLog, entries } = makeAuditLog();

    await new SetStoreAvailability(state.store, auditLog).execute({
      isOpen: false,
      actor: { userId: null, email: 'cli' },
    });

    expect((entries[0] as { actorEmail: string; actorUserId: null }).actorEmail).toBe('cli');
    expect((entries[0] as { actorUserId: string | null }).actorUserId).toBeNull();
  });
});
