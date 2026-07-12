import { ValueObject } from '@/shared/domain/value-object';

export interface ShippingAddressProps {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export class ShippingAddress extends ValueObject<ShippingAddressProps> {
  private constructor(props: ShippingAddressProps) {
    super(props);
  }

  static create(props: ShippingAddressProps): ShippingAddress {
    if (!props.name.trim()) throw new Error('ShippingAddress requires a non-empty name');
    if (!props.line1.trim()) throw new Error('ShippingAddress requires a non-empty line1');
    if (!props.city.trim()) throw new Error('ShippingAddress requires a non-empty city');
    if (!props.postalCode.trim()) {
      throw new Error('ShippingAddress requires a non-empty postalCode');
    }
    if (!props.country.trim()) throw new Error('ShippingAddress requires a non-empty country');
    return new ShippingAddress(props);
  }

  get name(): string {
    return this.props.name;
  }
  get line1(): string {
    return this.props.line1;
  }
  get line2(): string | undefined {
    return this.props.line2;
  }
  get city(): string {
    return this.props.city;
  }
  get region(): string {
    return this.props.region;
  }
  get postalCode(): string {
    return this.props.postalCode;
  }
  get country(): string {
    return this.props.country;
  }

  toJSON(): ShippingAddressProps {
    return { ...this.props };
  }
}
