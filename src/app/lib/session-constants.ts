/**
 * Values shared between server actions and the client components that read
 * their results.
 *
 * Separate from `session.ts` because that module imports `next/headers` and
 * the DI container — importing it from a client component would drag the
 * whole server graph into the browser bundle, and the failure only shows up
 * at build time.
 */

/** A destructive admin action refusing until the password is re-entered. */
export const REAUTH_REQUIRED = 'reauth_required';
