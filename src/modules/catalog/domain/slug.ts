import { ValueObject } from '@/shared/domain/value-object';

interface SlugProps {
  value: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class Slug extends ValueObject<SlugProps> {
  private constructor(props: SlugProps) {
    super(props);
  }

  static create(raw: string): Slug {
    const value = raw.trim().toLowerCase();
    if (!SLUG_PATTERN.test(value)) {
      throw new Error(`Invalid slug: "${raw}"`);
    }
    return new Slug({ value });
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
