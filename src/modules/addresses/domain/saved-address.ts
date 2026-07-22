import { AggregateRoot } from '@/shared/domain/entity';

export interface SavedAddressProps {
  id: string;
  userId: string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
  createdAt?: Date;
}

/** Same field set as `ShippingAddress` (orders/domain), inlined rather than
 * reused — that's an identity-less value object; a saved address has its
 * own id/userId and needs to be persisted, listed, and deleted on its own. */
export class SavedAddress extends AggregateRoot<string> {
  readonly userId: string;
  readonly name: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;

  private constructor(props: SavedAddressProps) {
    super(props.id);
    this.userId = props.userId;
    this.name = props.name;
    this.line1 = props.line1;
    this.line2 = props.line2;
    this.city = props.city;
    this.region = props.region;
    this.postalCode = props.postalCode;
    this.country = props.country;
    this.isDefault = props.isDefault ?? false;
    this.createdAt = props.createdAt ?? new Date();
  }

  static create(props: SavedAddressProps): SavedAddress {
    if (!props.name.trim()) throw new Error('SavedAddress requires a non-empty name');
    if (!props.line1.trim()) throw new Error('SavedAddress requires a non-empty line1');
    if (!props.city.trim()) throw new Error('SavedAddress requires a non-empty city');
    if (!props.postalCode.trim()) throw new Error('SavedAddress requires a non-empty postalCode');
    if (!props.country.trim()) throw new Error('SavedAddress requires a non-empty country');
    return new SavedAddress(props);
  }
}
