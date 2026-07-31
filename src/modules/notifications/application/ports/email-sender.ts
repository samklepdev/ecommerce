export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /**
   * The plain-text alternative, sent alongside the HTML rather than instead of
   * it. Optional on the port so a caller that genuinely has only HTML still
   * type-checks, but every template produces one — a message with no text part
   * scores worse with spam filters, and these are the emails a customer has to
   * receive.
   */
  text?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
