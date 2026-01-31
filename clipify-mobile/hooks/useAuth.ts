import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User, LoginRequest, RegisterRequest } from '@/types';
import apiClient from '@/services/api';
import { useAuthStore } from '@/stores';

// Query keys
export const authKeys = {
  currentUser: ['auth', 'currentUser'] as const,
};

// Hook para buscar o usuário atual
export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: () => apiClient.getCurrentUser(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10, // 10 minutos
    retry: false,
  });
}

// Hook para login
export function useLogin() {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();

  return useMutation({
    mutationFn: (data: LoginRequest) => apiClient.login(data),
    onSuccess: (response) => {
      // Atualizar Zustand store
      authStore.login(response.user.email, '').catch(() => {});

      // Atualizar cache do React Query
      queryClient.setQueryData(authKeys.currentUser, { user: response.user });
    },
  });
}

// Hook para registro
export function useRegister() {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();

  return useMutation({
    mutationFn: (data: RegisterRequest) => apiClient.register(data),
    onSuccess: (response) => {
      // Atualizar Zustand store
      authStore.register(response.user.email, '', response.user.fullName).catch(() => {});

      // Atualizar cache do React Query
      queryClient.setQueryData(authKeys.currentUser, { user: response.user });
    },
  });
}

// Hook para logout
export function useLogout() {
  const queryClient = useQueryClient();
  const authStore = useAuthStore();

  return useMutation({
    mutationFn: () => apiClient.logout(),
    onSuccess: () => {
      // Limpar Zustand store
      authStore.logout();

      // Limpar todo o cache do React Query
      queryClient.clear();
    },
  });
}
