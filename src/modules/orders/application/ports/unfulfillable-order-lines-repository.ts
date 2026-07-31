export interface UnfulfillableOrderLine {
  orderLineId: string;
  orderId: string;
  productName: string;
  productId: string;
  reason: string;
}

export interface UnfulfillableOrderLinesRepository {
  listUnfulfillableLines(): Promise<UnfulfillableOrderLine[]>;
}
