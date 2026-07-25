import { AggregateRoot } from '@/shared/domain/entity';

export interface SupplierProps {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  isActive?: boolean;
}

export class Supplier extends AggregateRoot<string> {
  readonly name: string;
  readonly url: string;
  readonly notes: string | null;
  readonly isActive: boolean;

  private constructor(props: SupplierProps) {
    super(props.id);
    this.name = props.name;
    this.url = props.url;
    this.notes = props.notes;
    this.isActive = props.isActive ?? true;
  }

  static create(props: SupplierProps): Supplier {
    if (!props.name.trim()) throw new Error('Supplier requires a non-empty name');
    return new Supplier(props);
  }
}
