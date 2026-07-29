import { count as countRows, eq, ne } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { productInquiries } from '@/shared/infrastructure/db/schema';
import type { InquiryStatus } from '@/modules/inquiries/domain/inquiry';
import type {
  Inquiry,
  InquiryRepository,
  NewInquiry,
} from '@/modules/inquiries/application/ports/inquiry-repository';

type Row = typeof productInquiries.$inferSelect;

function toInquiry(row: Row): Inquiry {
  return {
    id: row.id,
    subject: row.subject,
    message: row.message,
    customerEmail: row.customerEmail,
    userId: row.userId,
    status: row.status as InquiryStatus,
    adminNotes: row.adminNotes,
    createdAt: row.createdAt,
  };
}

export class DrizzleInquiryRepository implements InquiryRepository {
  constructor(private readonly db: DB) {}

  async create(inquiry: NewInquiry): Promise<void> {
    await this.db.insert(productInquiries).values(inquiry);
  }

  async listByStatus(status: InquiryStatus | 'all'): Promise<Inquiry[]> {
    const rows = await this.db.query.productInquiries.findMany({
      where: status === 'all' ? undefined : eq(productInquiries.status, status),
      // Oldest first: a queue is worked front to back, and the oldest
      // unanswered message is the one costing the most goodwill.
      orderBy: (i, { asc }) => [asc(i.createdAt)],
    });
    return rows.map(toInquiry);
  }

  async countOpen(): Promise<number> {
    const [row] = await this.db
      .select({ value: countRows() })
      .from(productInquiries)
      .where(ne(productInquiries.status, 'closed'));
    return Number(row?.value ?? 0);
  }

  async setStatus(id: string, status: InquiryStatus): Promise<void> {
    await this.db
      .update(productInquiries)
      .set({ status, updatedAt: new Date() })
      .where(eq(productInquiries.id, id));
  }

  async setNotes(id: string, notes: string | null): Promise<void> {
    await this.db
      .update(productInquiries)
      .set({ adminNotes: notes, updatedAt: new Date() })
      .where(eq(productInquiries.id, id));
  }
}
