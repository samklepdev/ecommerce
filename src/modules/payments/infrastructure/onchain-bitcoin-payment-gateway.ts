import { env } from '@/config/env';
import { err, ok, type Result } from '@/shared/domain/result';
import type {
  CreatePaymentError,
  CreatePaymentInput,
  CreatePaymentOutput,
  PaymentGateway,
} from '@/modules/payments/application/ports/payment-gateway';
import type {
  AddressIndexAllocator,
  BitcoinPaymentStore,
  BtcRateProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type { HdAddressDeriver } from '@/modules/payments/infrastructure/bitcoin/address-deriver';
import { toBip21 } from '@/modules/payments/domain/bip21';

export class OnChainBitcoinPaymentGateway implements PaymentGateway {
  readonly method = 'crypto' as const;

  constructor(
    private readonly deriver: HdAddressDeriver,
    private readonly indexAllocator: AddressIndexAllocator,
    private readonly rates: BtcRateProvider,
    private readonly paymentStore: BitcoinPaymentStore,
  ) {}

  async createPayment(
    input: CreatePaymentInput,
  ): Promise<Result<CreatePaymentOutput, CreatePaymentError>> {
    // Idempotent: a double-submit for the same order returns the existing intent.
    const existing = await this.paymentStore.getByOrderId(input.orderId);
    if (existing) {
      return ok({
        reference: existing.address,
        bip21Uri: toBip21(existing.address, existing.expectedSats),
        expiresAt: existing.expiresAt,
      });
    }

    try {
      const index = await this.indexAllocator.next();
      const address = this.deriver.deriveAddress(index);
      const satsPerFiatUnit = await this.rates.satsPerFiatUnit(input.amount.currency);
      // Assumes a 2-decimal-place fiat currency (minor unit = 1/100 major unit),
      // true for USD/EUR/etc — revisit if a 0- or 3-decimal currency is added.
      const expectedSats = Math.round((input.amount.amountMinor / 100) * satsPerFiatUnit);
      const expiresAt = new Date(Date.now() + env.QUOTE_TTL_SECONDS * 1000);

      await this.paymentStore.save({
        orderId: input.orderId,
        address,
        addressIndex: index,
        expectedSats,
        fiatCurrency: input.amount.currency,
        satsPerFiatUnit,
        expiresAt,
        status: 'awaiting',
      });

      return ok({ reference: address, bip21Uri: toBip21(address, expectedSats), expiresAt });
    } catch (e) {
      return err({ code: 'gateway_error', message: e instanceof Error ? e.message : String(e) });
    }
  }
}
