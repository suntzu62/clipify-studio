import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api-client';

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

const DEFAULT_SETTINGS: UserSettings = {
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

const STORAGE_PREFIX = 'cortai:settings:';

function mergeSettings(current: UserSettings, updates: Partial<UserSettings>): UserSettings {
  return {
    ...current,
    ...updates,
    notifications: { ...current.notifications, ...updates.notifications },
    privacy: { ...current.privacy, ...updates.privacy },
    appearance: { ...current.appearance, ...updates.appearance },
  };
}

export function useUserSettings() {
  const { user } = useAuth();
  const storageKey = useMemo(
    () => `${STORAGE_PREFIX}${user?.id ?? 'guest'}`,
    [user?.id]
  );
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const loadFromStorage = () => {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<UserSettings>;
          return mergeSettings(DEFAULT_SETTINGS, parsed);
        } catch {
          return DEFAULT_SETTINGS;
        }
      }
      return DEFAULT_SETTINGS;
    };

    const bootstrap = async () => {
      const localSettings = loadFromStorage();
      if (active) {
        setSettings(localSettings);
        setLoaded(true);
      }

      if (!user?.id) return;

      try {
        const response = await api.get<{ settings: UserSettings }>('/user/settings');
        if (active && response?.settings) {
          const merged = mergeSettings(DEFAULT_SETTINGS, response.settings);
          setSettings(merged);
          localStorage.setItem(storageKey, JSON.stringify(merged));
        }
      } catch {
        // Mantem preferencias locais quando o backend nao responde
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, [storageKey, user?.id]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings, storageKey, loaded]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = settings.appearance.reduceMotion ? 'true' : 'false';
    root.dataset.glass = settings.appearance.glassEffects ? 'on' : 'off';
    root.dataset.contrast = settings.appearance.highContrast ? 'high' : 'normal';
    root.lang = settings.language;
  }, [settings.appearance, settings.language]);

  const updateSettings = (updates: Partial<UserSettings>) => {
    setSettings((current) => mergeSettings(current, updates));

    if (!user?.id) return;

    void api.patch('/user/settings', updates).catch(() => {
      // Silencia erro para nao travar UI se o backend estiver indisponivel
    });
  };

  return { settings, updateSettings, loaded };
}
