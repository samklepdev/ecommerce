import { z } from 'zod';

import { err, ok, type Result } from '@/shared/domain/result';
import type { JobName, JobPayloads } from '@/shared/application/ports/job-queue';

/**
 * Schemas for job payloads coming back off Redis.
 *
 * Same reasoning as `esplora-response.ts`: this is data crossing into the
 * process from outside it, and it was a cast (`job.data` is `any`, and
 * `job.name as JobName` asserted rather than checked). A job may have been
 * enqueued minutes ago by a *previous deploy* — a payload whose shape has
 * since changed, or a name whose handler no longer exists, are both normal
 * consequences of shipping, not hypotheticals.
 *
 * Ids are `min(1)` because an empty one is worse than a malformed one: it
 * parses, reaches the repository, and quietly matches no rows, so the job
 * completes having done nothing.
 *
 * Emails are **not** `z.string().email()`, deliberately. The address was
 * already validated by the Zod schema at the action that accepted it; a
 * second, differently-spelled check here could only ever *drop* mail for an
 * address the system has already accepted. What this layer is for is
 * catching shape drift and garbage, not re-litigating the address.
 */
const OrderJobSchema = z.object({ orderId: z.string().min(1) });
const UserEmailJobSchema = z.object({ userId: z.string().min(1), email: z.string().min(1) });

/**
 * The `satisfies` clause is the load-bearing part: it makes the compiler
 * check every schema against `JobPayloads`, so adding a job type or a field
 * to the port without describing it here is a type error rather than a
 * payload that silently fails to parse in production.
 */
export const jobPayloadSchemas = {
  'email.order-confirmation': z.object({
    orderId: z.string().min(1),
    customerEmail: z.string().min(1),
  }),
  'email.welcome': UserEmailJobSchema,
  'email.verification': UserEmailJobSchema,
  'email.payment-confirmed': OrderJobSchema,
  'fulfillment.create-supplier-orders': OrderJobSchema,
} satisfies { [T in JobName]: z.ZodType<JobPayloads[T]> };

/** Narrows a name off Redis to one the worker has a handler for. `in` on the
 * schema map rather than a hand-kept list, so the two can't disagree. */
export function isJobName(name: string): name is JobName {
  return Object.prototype.hasOwnProperty.call(jobPayloadSchemas, name);
}

/**
 * Returns the parsed payload, or a description of what was wrong with it.
 *
 * A `Result` rather than a throw because the caller's correct response is to
 * drop the job, not retry it: a payload that doesn't parse won't parse on the
 * fifth attempt either, so retrying it just delays the failed-set entry
 * somebody needs to look at.
 */
export function parseJobPayload<T extends JobName>(
  name: T,
  data: unknown,
): Result<JobPayloads[T], string> {
  const parsed = jobPayloadSchemas[name].safeParse(data);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
  }
  return ok(parsed.data as JobPayloads[T]);
}
