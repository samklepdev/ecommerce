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

  /** Best-effort slug from a human name — lowercase, non-alphanumerics
   * collapsed to single hyphens, edges trimmed. Mirrors the SQL used by
   * migration 0022's backfill, so a category created through the app and one
   * created by the migration slug identically. Throws if nothing survives
   * (a name of only punctuation), which the caller should report rather than
   * paper over. */
  static fromName(raw: string): Slug {
    const value = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return Slug.create(value);
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
