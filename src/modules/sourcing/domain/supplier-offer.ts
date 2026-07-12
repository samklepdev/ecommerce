import { Entity } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';

export type SupplierOfferSyncStatus = 'never' | 'ok' | 'blocked' | 'error';

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
  lastSyncedAt?: Date | null;
  lastSyncStatus?: SupplierOfferSyncStatus;
  lastSyncError?: string | null;
  autoSyncEnabled?: boolean;
  scrapedTitle?: string | null;
}

export class SupplierOffer extends Entity<string> {
  readonly variantId: string;
  readonly supplierId: string;
  readonly supplierProductUrl: string;
  readonly cost: Money;
  readonly isAvailable: boolean;
  readonly isPreferred: boolean;
  readonly lastSyncedAt: Date | null;
  readonly lastSyncStatus: SupplierOfferSyncStatus;
  readonly lastSyncError: string | null;
  readonly autoSyncEnabled: boolean;
  readonly scrapedTitle: string | null;

  private constructor(props: SupplierOfferProps) {
    super(props.id);
    this.variantId = props.variantId;
    this.supplierId = props.supplierId;
    this.supplierProductUrl = props.supplierProductUrl;
    this.cost = props.cost;
    this.isAvailable = props.isAvailable;
    this.isPreferred = props.isPreferred;
    this.lastSyncedAt = props.lastSyncedAt ?? null;
    this.lastSyncStatus = props.lastSyncStatus ?? 'never';
    this.lastSyncError = props.lastSyncError ?? null;
    this.autoSyncEnabled = props.autoSyncEnabled ?? true;
    this.scrapedTitle = props.scrapedTitle ?? null;
  }

  static create(props: SupplierOfferProps): SupplierOffer {
    if (!props.supplierProductUrl.trim()) {
      throw new Error('SupplierOffer requires a non-empty supplierProductUrl');
    }
    return new SupplierOffer(props);
  }
}
