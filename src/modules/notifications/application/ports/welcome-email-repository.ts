export interface WelcomeEmailStatus {
  sentAt: Date;
  openedAt: Date | null;
}

export interface CreateWelcomeEmailInput {
  id: string;
  userId: string;
  trackingToken: string;
}

export interface WelcomeEmailRepository {
  create(input: CreateWelcomeEmailInput): Promise<void>;
  findByUserId(userId: string): Promise<WelcomeEmailStatus | null>;
  /** Guarded + idempotent: false if already opened (or token doesn't exist). */
  markOpened(trackingToken: string): Promise<boolean>;
}
