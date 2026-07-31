import { describe, expect, it } from 'vitest';

import { jobIdFor } from './job-queue';

describe('jobIdFor', () => {
  it('joins its parts with hyphens', () => {
    expect(jobIdFor('fulfillment', 'order-1')).toBe('fulfillment-order-1');
  });

  it('reproduces the ids the call sites used to build by hand', () => {
    // These are load-bearing: an id is what makes an enqueue idempotent, so
    // changing one silently changes dedupe behaviour for jobs already queued.
    expect(jobIdFor('order-confirmation', 'o1')).toBe('order-confirmation-o1');
    expect(jobIdFor('payment-confirmed', 'o1')).toBe('payment-confirmed-o1');
    expect(jobIdFor('email.welcome', 'u1')).toBe('email-welcome-u1');
    expect(jobIdFor('email.verification', 'u1')).toBe('email-verification-u1');
  });

  it('replaces a colon rather than letting it reach BullMQ', () => {
    // The whole reason this helper exists. BullMQ rejects a custom id
    // containing `:` at enqueue time, which is invisible to types.
    expect(jobIdFor('email:welcome', 'u1')).toBe('email-welcome-u1');
    expect(jobIdFor('a', 'b:c:d')).toBe('a-b-c-d');
  });

  it('replaces every colon, not just the first', () => {
    expect(jobIdFor('a:b:c')).toBe('a-b-c');
  });

  it('rejects an empty or blank part', () => {
    // An empty part collapses distinct ids into one — `fulfillment-` for
    // every order — which would dedupe unrelated money-touching jobs into
    // each other. That can only come from a bug, so it fails loudly.
    expect(() => jobIdFor('fulfillment', '')).toThrow(/empty/i);
    expect(() => jobIdFor('fulfillment', '   ')).toThrow(/empty/i);
    expect(() => jobIdFor()).toThrow(/empty/i);
  });
});
