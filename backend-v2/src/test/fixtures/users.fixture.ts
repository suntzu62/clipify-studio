import { v4 as uuidv4 } from 'crypto';

export interface UserFixture {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

// Pre-hashed password "password123" with bcrypt
export const DEFAULT_PASSWORD_HASH = '$2a$10$rQEY7F0NJ.5n8ZD5vhqQVOqJK3wHzVZnz1eLmQZOQGzG0xJLhJXHi';

export function createUserFixture(overrides?: Partial<UserFixture>): UserFixture {
  const id = overrides?.id ?? uuidv4();
  return {
    id,
    email: overrides?.email ?? `user-${id.substring(0, 8)}@test.com`,
    full_name: overrides?.full_name ?? 'Test User',
    avatar_url: overrides?.avatar_url ?? null,
    password_hash: overrides?.password_hash ?? DEFAULT_PASSWORD_HASH,
    created_at: overrides?.created_at ?? new Date(),
    updated_at: overrides?.updated_at ?? new Date(),
  };
}

// Pre-built fixtures for common test scenarios
export const fixtures = {
  validUser: createUserFixture({
    id: 'user-valid-1234-5678-9012',
    email: 'valid@test.com',
    full_name: 'Valid User',
  }),

  userWithAvatar: createUserFixture({
    id: 'user-avatar-1234-5678-9012',
    email: 'avatar@test.com',
    full_name: 'User With Avatar',
    avatar_url: 'https://example.com/avatar.jpg',
  }),

  googleOAuthUser: createUserFixture({
    id: 'user-google-1234-5678-9012',
    email: 'google@gmail.com',
    full_name: 'Google User',
    avatar_url: 'https://lh3.googleusercontent.com/test-avatar',
    password_hash: '', // OAuth users have no password
  }),

  adminUser: createUserFixture({
    id: 'admin-user-1234-5678-9012',
    email: 'admin@clipify.studio',
    full_name: 'Admin User',
  }),

  newUser: createUserFixture({
    id: 'user-new-1234-5678-9012',
    email: 'new@test.com',
    full_name: 'New User',
  }),

  devUnlimitedUser: createUserFixture({
    id: 'dev-unlimited-1234-5678',
    email: 'dev@unlimited.test',
    full_name: 'Dev Unlimited User',
  }),
};

// Helper to create DB row format (for mock query results)
export function toDbRow(user: UserFixture) {
  return {
    ...user,
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
  };
}

// Helper to create multiple users
export function createUserFixtures(count: number): UserFixture[] {
  return Array.from({ length: count }, (_, i) =>
    createUserFixture({
      email: `user${i + 1}@test.com`,
      full_name: `Test User ${i + 1}`,
    })
  );
}
