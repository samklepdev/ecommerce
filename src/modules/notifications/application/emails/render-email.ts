import { render } from '@react-email/components';
import type { ReactElement } from 'react';

export interface RenderedEmail {
  html: string;
  /**
   * The same content as plain text, sent alongside the HTML as a multipart
   * alternative. Worth the second render: a message with no text part scores
   * worse with spam filters, and these are the emails a customer needs to
   * actually receive — an order confirmation holds the only link back to a
   * guest's order, and a reset link is the only way back into an account.
   */
  text: string;
}

/**
 * Renders one email component to both forms.
 *
 * `render` is async (it formats the output), and rendering twice is cheap
 * relative to the network call that follows. Done in parallel because the two
 * passes are independent.
 *
 * Note what this buys beyond layout: the templates used to interpolate values
 * straight into an HTML string, so an admin-entered tracking number or a
 * product name containing `<` would either break the markup or inject into
 * it. JSX escapes its children, so that class of bug is gone by construction
 * rather than by remembering to escape.
 */
export async function renderEmail(node: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return { html, text };
}
