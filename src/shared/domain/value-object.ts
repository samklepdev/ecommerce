export abstract class ValueObject<Props extends object> {
  protected constructor(protected readonly props: Readonly<Props>) {}

  equals(other?: ValueObject<Props>): boolean {
    if (!other) return false;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
