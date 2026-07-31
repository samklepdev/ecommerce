import { describe, expect, it } from 'vitest';

import { isErr, isOk } from '@/shared/domain/result';
import { isJobName, parseJobPayload } from './job-payload-schemas';

describe('isJobName', () => {
  it('accepts the names the queue actually handles', () => {
    expect(isJobName('email.welcome')).toBe(true);
    expect(isJobName('fulfillment.create-supplier-orders')).toBe(true);
  });

  it('rejects anything else', () => {
    // A name off Redis that no handler covers — a deploy removed the type
    // while jobs were still queued.
    expect(isJobName('email.no-such-job')).toBe(false);
    expect(isJobName('')).toBe(false);
    expect(isJobName('__proto__')).toBe(false);
  });
});

describe('parseJobPayload', () => {
  it('parses each job type', () => {
    expect(
      parseJobPayload('email.order-confirmation', { orderId: 'o1', customerEmail: 'a@b.com' }),
    ).toEqual({ ok: true, value: { orderId: 'o1', customerEmail: 'a@b.com' } });
    expect(parseJobPayload('email.welcome', { userId: 'u1', email: 'a@b.com' })).toEqual({
      ok: true,
      value: { userId: 'u1', email: 'a@b.com' },
    });
    expect(parseJobPayload('email.payment-confirmed', { orderId: 'o1' })).toEqual({
      ok: true,
      value: { orderId: 'o1' },
    });
    expect(parseJobPayload('fulfillment.create-supplier-orders', { orderId: 'o1' })).toEqual({
      ok: true,
      value: { orderId: 'o1' },
    });
  });

  it('ignores extra keys, so an older payload shape still runs', () => {
    // A job enqueued before a deploy that added a field must not be dropped
    // for carrying one this version doesn't read.
    const result = parseJobPayload('email.payment-confirmed', { orderId: 'o1', legacy: true });
    expect(isOk(result)).toBe(true);
  });

  it('rejects a missing field', () => {
    expect(isErr(parseJobPayload('email.welcome', { userId: 'u1' }))).toBe(true);
  });

  it('rejects a field of the wrong type', () => {
    // This is the case a cast waved through: an id that arrives as a number
    // or an object reaches the repository and queries for nothing.
    expect(isErr(parseJobPayload('email.payment-confirmed', { orderId: 42 }))).toBe(true);
    expect(isErr(parseJobPayload('email.payment-confirmed', { orderId: { id: 'o1' } }))).toBe(true);
  });

  it('rejects an empty id rather than querying for nothing', () => {
    expect(isErr(parseJobPayload('email.payment-confirmed', { orderId: '' }))).toBe(true);
  });

  it('rejects a payload that is not an object at all', () => {
    expect(isErr(parseJobPayload('email.payment-confirmed', null))).toBe(true);
    expect(isErr(parseJobPayload('email.payment-confirmed', 'o1'))).toBe(true);
    expect(isErr(parseJobPayload('email.payment-confirmed', undefined))).toBe(true);
  });

  it('explains what was wrong, since the payload is dropped not retried', () => {
    const result = parseJobPayload('email.welcome', { userId: 'u1' });
    if (isOk(result)) throw new Error('expected a parse failure');
    expect(result.error).toMatch(/email/i);
  });
});
