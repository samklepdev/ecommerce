import type { User, UserRole } from '@/modules/identity/domain/user';

export interface UserProfile {
  id: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: User): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateAvatarUrl(userId: string, avatarUrl: string): Promise<void>;
  updateRole(userId: string, role: UserRole): Promise<void>;
  findProfileById(userId: string): Promise<UserProfile | null>;
}
