import type { UseCase } from '@/shared/application/use-case';

export interface UpdateOrderNotesRepository {
  setNotes(orderId: string, notes: string | null): Promise<void>;
}

export interface UpdateOrderNotesInput {
  orderId: string;
  notes: string | null;
}

/** Internal ops notes on an order — admin-only, never shown to customers. */
export class UpdateOrderNotes implements UseCase<UpdateOrderNotesInput, void> {
  constructor(private readonly orders: UpdateOrderNotesRepository) {}

  async execute(input: UpdateOrderNotesInput): Promise<void> {
    await this.orders.setNotes(input.orderId, input.notes);
  }
}
