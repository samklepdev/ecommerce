import { describe, expect, it } from 'vitest';

import { ListUnfulfillableOrderLines } from './list-unfulfillable-order-lines';
import type {
  UnfulfillableOrderLine,
  UnfulfillableOrderLinesRepository,
} from '@/modules/orders/application/ports/unfulfillable-order-lines-repository';

function makeFakeRepo(lines: UnfulfillableOrderLine[]): UnfulfillableOrderLinesRepository {
  return {
    async listUnfulfillableLines() {
      return lines;
    },
  };
}

describe('ListUnfulfillableOrderLines', () => {
  it('returns the flagged lines from the repository', async () => {
    const lines: UnfulfillableOrderLine[] = [
      { orderLineId: 'line-1', orderId: 'order-1', sku: 'SKU-1', variantId: 'v1', reason: 'no_preferred_supplier_offer' },
    ];
    const repo = makeFakeRepo(lines);

    const result = await new ListUnfulfillableOrderLines(repo).execute();

    expect(result).toEqual(lines);
  });

  it('returns an empty array when nothing is flagged', async () => {
    const repo = makeFakeRepo([]);

    const result = await new ListUnfulfillableOrderLines(repo).execute();

    expect(result).toEqual([]);
  });
});
