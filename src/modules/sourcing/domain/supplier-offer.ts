import { Entity } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';

/**
 * A candidate source for a catalog variant. Cost is admin/ops-only data —
 * nothing in this entity should ever reach a customer-facing repository.
 */
export interface SupplierOfferProps {
  id: string;
  variantId: string;
  supplierId: string;
  supplierProductUrl: string;
  cost: Money;
  isAvailable: boolean;
  isPreferred: boolean;
}

export class SupplierOffer extends Entity<string> {
  readonly variantId: string;
  readonly supplierId: string;
  readonly supplierProductUrl: string;
  readonly cost: Money;
  readonly isAvailable: boolean;
  readonly isPreferred: boolean;

  private constructor(props: SupplierOfferProps) {
    super(props.id);
    this.variantId = props.variantId;
    this.supplierId = props.supplierId;
    this.supplierProductUrl = props.supplierProductUrl;
    this.cost = props.cost;
    this.isAvailable = props.isAvailable;
    this.isPreferred = props.isPreferred;
  }

  static create(props: SupplierOfferProps): SupplierOffer {
    if (!props.supplierProductUrl.trim()) {
      throw new Error('SupplierOffer requires a non-empty supplierProductUrl');
    }
    return new SupplierOffer(props);
  }
}
