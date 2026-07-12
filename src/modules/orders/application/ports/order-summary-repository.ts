export interface OrderShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface OrderSummary {
  id: string;
  customerEmail: string;
  shippingAddress: OrderShippingAddress | null;
}

export interface OrderSummaryRepository {
  getSummary(orderId: string): Promise<OrderSummary | null>;
}
