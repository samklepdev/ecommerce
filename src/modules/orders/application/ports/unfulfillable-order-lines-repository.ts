export interface UnfulfillableOrderLine {
  orderLineId: string;
  orderId: string;
  sku: string;
  productId: string;
  reason: string;
}

export interface UnfulfillableOrderLinesRepository {
  listUnfulfillableLines(): Promise<UnfulfillableOrderLine[]>;
}
