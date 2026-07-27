import { describe, expect, it } from 'vitest';


import { percentChange, type Delta } from './delta';

describe('percentChange', () => {
  it('reports growth as a positive percentage', () => {
    expect(percentChange(150, 100)).toEqual<Delta>({ direction: 'up', percent: 50 });
  });

  it('reports decline as a positive percentage with a down direction', () => {
    // The sign lives in `direction`, not in the number — the tile renders an
    // arrow, so a "-" in the text too would read as a double negative.
    expect(percentChange(75, 100)).toEqual<Delta>({ direction: 'down', percent: 25 });
  });

  it('reports an unchanged value as flat', () => {
    expect(percentChange(100, 100)).toEqual<Delta>({ direction: 'flat', percent: 0 });
  });

  it('rounds to one decimal place', () => {
    expect(percentChange(3, 7)).toEqual<Delta>({ direction: 'down', percent: 57.1 });
  });

  it('has no baseline to compare against when the previous window is zero', () => {
    // 0 → anything is an infinite increase, not a "100% rise". The tile shows
    // no delta at all rather than a meaningless number.
    expect(percentChange(42, 0)).toBeNull();
  });

  it('treats zero-to-zero as flat rather than undefined', () => {
    expect(percentChange(0, 0)).toEqual<Delta>({ direction: 'flat', percent: 0 });
  });

  it('handles a drop to zero', () => {
    expect(percentChange(0, 80)).toEqual<Delta>({ direction: 'down', percent: 100 });
  });
});
