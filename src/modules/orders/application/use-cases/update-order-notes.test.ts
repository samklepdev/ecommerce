import { describe, expect, it } from 'vitest';

import { UpdateOrderNotes, type UpdateOrderNotesRepository } from './update-order-notes';

function makeRepo() {
  const calls: { orderId: string; notes: string | null }[] = [];
  const repo: UpdateOrderNotesRepository = {
    async setNotes(orderId, notes) {
      calls.push({ orderId, notes });
    },
  };
  return { repo, calls };
}

describe('UpdateOrderNotes', () => {
  it('sets the notes for the given order', async () => {
    const { repo, calls } = makeRepo();

    await new UpdateOrderNotes(repo).execute({ orderId: 'order1', notes: 'Called customer about delay.' });

    expect(calls).toEqual([{ orderId: 'order1', notes: 'Called customer about delay.' }]);
  });

  it('allows clearing notes back to null', async () => {
    const { repo, calls } = makeRepo();

    await new UpdateOrderNotes(repo).execute({ orderId: 'order1', notes: null });

    expect(calls).toEqual([{ orderId: 'order1', notes: null }]);
  });
});
