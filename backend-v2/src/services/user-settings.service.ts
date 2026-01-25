import { pool } from './database.service.js';

export type UserSettings = {
  notifications: {
    jobCompleteEmail: boolean;
    jobFailedEmail: boolean;
    weeklyDigest: boolean;
  };
  privacy: {
    profileVisible: boolean;
    shareAnalytics: boolean;
    personalizedRecommendations: boolean;
  };
  appearance: {
    reduceMotion: boolean;
    glassEffects: boolean;
    highContrast: boolean;
  };
  language: 'pt-BR' | 'en-US' | 'es-ES';
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notifications: {
    jobCompleteEmail: true,
    jobFailedEmail: true,
    weeklyDigest: false,
  },
  privacy: {
    profileVisible: false,
    shareAnalytics: true,
    personalizedRecommendations: true,
  },
  appearance: {
    reduceMotion: false,
    glassEffects: true,
    highContrast: false,
  },
  language: 'pt-BR',
};

function mergeSettings(
  current: UserSettings,
  updates: Partial<UserSettings>
): UserSettings {
  return {
    ...current,
    ...updates,
    notifications: { ...current.notifications, ...updates.notifications },
    privacy: { ...current.privacy, ...updates.privacy },
    appearance: { ...current.appearance, ...updates.appearance },
  };
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const result = await pool.query(
    'SELECT settings FROM user_settings WHERE user_id = $1',
    [userId]
  );

  if (!result.rows.length) {
    return DEFAULT_USER_SETTINGS;
  }

  const stored = result.rows[0].settings || {};
  return mergeSettings(DEFAULT_USER_SETTINGS, stored);
}

export async function upsertUserSettings(
  userId: string,
  updates: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const merged = mergeSettings(current, updates);

  await pool.query(
    `INSERT INTO user_settings (user_id, settings, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET settings = $2::jsonb, updated_at = NOW()`,
    [userId, JSON.stringify(merged)]
  );

  return merged;
}
