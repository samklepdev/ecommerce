import type { UseCase } from '@/shared/application/use-case';
import type { ImageStorage } from '@/shared/application/ports/image-storage';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface UpdateAvatarInput {
  userId: string;
  buffer: Buffer;
  contentType: string;
}

export interface UpdateAvatarResult {
  url: string | null;
}

/** Stores an uploaded avatar file directly (no supplier-fetch path — this is
 * always a user's own upload), mirroring the single-file path of
 * `AddProductImages`. Returns `url: null` when the storage layer rejects the
 * file (unrecognized content type or oversized) rather than throwing. */
export class UpdateAvatar implements UseCase<UpdateAvatarInput, UpdateAvatarResult> {
  constructor(
    private readonly users: UserRepository,
    private readonly avatarStorage: ImageStorage,
  ) {}

  async execute(input: UpdateAvatarInput): Promise<UpdateAvatarResult> {
    const url = await this.avatarStorage.storeUploadedFile(input.buffer, input.contentType);
    if (!url) return { url: null };

    await this.users.updateAvatarUrl(input.userId, url);
    return { url };
  }
}
