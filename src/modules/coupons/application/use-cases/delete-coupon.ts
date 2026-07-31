import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

export interface DeleteCouponInput {
  id: string;
}

export type DeleteCouponError = { code: 'not_found' };

/**
 * Removes a coupon outright — the counterpart to deactivating one, which
 * leaves it in the list and merely stops it applying.
 *
 * Unlike `DeleteSupplier` this needs no in-use check, and the difference is
 * worth stating because the asymmetry looks like an oversight otherwise: a
 * supplier is referenced by offers and purchase history through real foreign
 * keys, whereas an order snapshots the coupon's code and the discount it was
 * given at `PlaceOrder` time (`orders.coupon_code` is plain text). So there is
 * nothing to hold, and deleting a coupon cannot alter what a past order was
 * charged.
 *
 * Deleting an *active* coupon is allowed for the same reason. It stops working
 * immediately, which is the point of pressing delete; the only thing lost is
 * the code's own row.
 *
 * `not_found` rather than a silent success, so two admins on the same page
 * don't both get told they deleted it.
 */
export class DeleteCoupon
  implements UseCase<DeleteCouponInput, Result<void, DeleteCouponError>>
{
  constructor(private readonly coupons: CouponRepository) {}

  async execute(input: DeleteCouponInput): Promise<Result<void, DeleteCouponError>> {
    const coupon = await this.coupons.findById(input.id);
    if (!coupon) return err({ code: 'not_found' });

    await this.coupons.delete(input.id);
    return ok(undefined);
  }
}
