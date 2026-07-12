import type { PaymentMethod } from '@/modules/payments/application/payment-provider';
import type { PaymentGateway } from '@/modules/payments/application/ports/payment-gateway';

export class PaymentGatewayRegistry {
  private readonly gateways: Map<PaymentMethod, PaymentGateway>;

  constructor(gateways: PaymentGateway[]) {
    this.gateways = new Map(gateways.map((g) => [g.method, g]));
  }

  resolve(method: PaymentMethod): PaymentGateway {
    const gateway = this.gateways.get(method);
    if (!gateway) throw new Error(`No payment gateway registered for method "${method}"`);
    return gateway;
  }
}
