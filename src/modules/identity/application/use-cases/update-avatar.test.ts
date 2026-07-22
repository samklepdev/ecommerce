import { describe, expect, it } from 'vitest';

import { UpdateAvatar } from './update-avatar';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { ImageStorage } from '@/shared/application/ports/image-storage';

function makeFakeUsers() {
  const updatedUrls: { userId: string; avatarUrl: string }[] = [];
  const repo: UserRepository = {
    async findByEmail() {
      return null;
    },
    async findById() {
      return null;
    },
    async create() {},
    async updatePasswordHash() {},
    async updateAvatarUrl(userId, avatarUrl) {
      updatedUrls.push({ userId, avatarUrl });
    },
    async updateRole() {},
    async findProfileById() {
      return null;
    },
    async updateEmail() {},
    async markEmailVerified() {},
    async delete() {},
  };
  return { repo, updatedUrls };
}

function makeFakeStorage(url: string | null) {
  const storage: ImageStorage = {
    async store() {
      return null;
    },
    async storeUploadedFile() {
      return url;
    },
  };
  return storage;
}

describe('UpdateAvatar', () => {
  it('stores the file and updates the user record when storage accepts it', async () => {
    const { repo, updatedUrls } = makeFakeUsers();
    const storage = makeFakeStorage('https://cdn.example.com/avatars/1.png');

    const result = await new UpdateAvatar(repo, storage).execute({
      userId: 'user-1',
      buffer: Buffer.from('fake-image-bytes'),
      contentType: 'image/png',
    });

    expect(result.url).toBe('https://cdn.example.com/avatars/1.png');
    expect(updatedUrls).toEqual([{ userId: 'user-1', avatarUrl: 'https://cdn.example.com/avatars/1.png' }]);
  });

  it('returns url: null and skips the repo update when storage rejects the file', async () => {
    const { repo, updatedUrls } = makeFakeUsers();
    const storage = makeFakeStorage(null);

    const result = await new UpdateAvatar(repo, storage).execute({
      userId: 'user-1',
      buffer: Buffer.from('too-big-or-wrong-type'),
      contentType: 'application/octet-stream',
    });

    expect(result.url).toBeNull();
    expect(updatedUrls).toHaveLength(0);
  });
});
