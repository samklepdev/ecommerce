export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
