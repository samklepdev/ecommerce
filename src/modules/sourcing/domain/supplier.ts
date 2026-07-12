import { AggregateRoot } from '@/shared/domain/entity';

export interface SupplierProps {
  id: string;
  name: string;
  url: string;
  notes: string | null;
}

export class Supplier extends AggregateRoot<string> {
  readonly name: string;
  readonly url: string;
  readonly notes: string | null;

  private constructor(props: SupplierProps) {
    super(props.id);
    this.name = props.name;
    this.url = props.url;
    this.notes = props.notes;
  }

  static create(props: SupplierProps): Supplier {
    if (!props.name.trim()) throw new Error('Supplier requires a non-empty name');
    return new Supplier(props);
  }
}
