import { z } from 'zod';

import { validatePassword } from '@/shared/domain/password-policy';

/**
 * For any field where a password is *set* — signup, reset, change.
 *
 * Deliberately not used on the login form. The policy applies to new
 * passwords; enforcing it at sign-in would lock out every account created
 * under the old 8-character rule, and rejecting a password at the door
 * teaches an attacker which ones aren't worth trying.
 */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  const problem = validatePassword(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});
