export interface UnfulfillableOrderLine {
  orderLineId: string;
  orderId: string;
  sku: string;
  variantId: string;
  reason: string;
}

export interface UnfulfillableOrderLinesRepository {
  listUnfulfillableLines(): Promise<UnfulfillableOrderLine[]>;
}
