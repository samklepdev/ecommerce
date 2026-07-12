export abstract class Entity<Id> {
  protected constructor(readonly id: Id) {}

  equals(other?: Entity<Id>): boolean {
    if (!other) return false;
    if (other === this) return true;
    return this.id === other.id;
  }
}

export abstract class AggregateRoot<Id> extends Entity<Id> {}
