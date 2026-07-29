import { Entity } from '@/shared/domain/entity';
import { Slug } from '@/modules/catalog/domain/slug';

export interface CategoryProps {
  id: string;
  name: string;
  slug: Slug;
  description: string | null;
}

/**
 * A catalog category.
 *
 * Was a free-text column on the product until 0022. As a string, "rename a
 * category" meant rewriting every product that held the old spelling, a
 * typo silently created a second category, and there was nowhere to hang a
 * description. As an entity, a rename is one write and the products follow.
 *
 * The slug is derived from the name once, at creation, and then kept — a
 * renamed category shouldn't invalidate the links pointing at it. Rename it
 * to something unrecognisable and the slug is stale but stable, which is the
 * lesser of the two problems (and the same rule `Product` already applies to
 * its own slug).
 */
export class Category extends Entity<string> {
  readonly name: string;
  readonly slug: Slug;
  readonly description: string | null;

  private constructor(props: CategoryProps) {
    super(props.id);
    this.name = props.name;
    this.slug = props.slug;
    this.description = props.description;
  }

  static create(props: CategoryProps): Category {
    const name = props.name.trim();
    if (name.length === 0) throw new Error('Category name cannot be empty');
    return new Category({ ...props, name });
  }

  /** A renamed category keeps its slug — see the class note. */
  renamedTo(name: string): Category {
    return Category.create({
      id: this.id,
      name,
      slug: this.slug,
      description: this.description,
    });
  }

  describedAs(description: string | null): Category {
    return Category.create({
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: description?.trim() ? description.trim() : null,
    });
  }
}
