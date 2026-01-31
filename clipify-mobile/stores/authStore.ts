import { create } from 'zustand';
import type { User } from '@/types';
import apiClient from '@/services/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.login({ email, password });
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao fazer login',
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (email: string, password: string, fullName?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.register({ email, password, fullName });
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao criar conta',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      await apiClient.logout();
      set({
        user: null,
        isAuthenticated: false,
        error: null,
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  },

  loadUser: async () => {
    set({ isLoading: true });
    try {
      const { user } = await apiClient.getCurrentUser();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      // Tentar carregar do cache
      const cachedUser = await apiClient.getCachedUser();
      if (cachedUser) {
        set({
          user: cachedUser,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    }
  },

  checkAuth: async (): Promise<boolean> => {
    try {
      const { user } = await apiClient.getCurrentUser();
      set({ user, isAuthenticated: true });
      return true;
    } catch (error) {
      const cachedUser = await apiClient.getCachedUser();
      if (cachedUser) {
        set({ user: cachedUser, isAuthenticated: true });
        return true;
      }
      set({ user: null, isAuthenticated: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
