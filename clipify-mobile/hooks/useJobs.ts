import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Job, CreateJobRequest } from '@/types';
import apiClient from '@/services/api';

// Query keys
export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (filters?: any) => [...jobKeys.lists(), { filters }] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
};

// Hook para listar todos os jobs/projetos
export function useJobs() {
  return useQuery({
    queryKey: jobKeys.lists(),
    queryFn: () => apiClient.getJobs(),
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

// Hook para buscar um job específico
export function useJob(jobId: string) {
  return useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: () => apiClient.getJob(jobId),
    enabled: !!jobId,
    staleTime: 1000 * 30, // 30 segundos
    refetchInterval: (query) => {
      const data = query.state.data as Job | undefined;
      // Se o job está processando, atualizar a cada 3 segundos
      if (data && (data.status === 'active' || data.status === 'waiting')) {
        return 3000;
      }
      // Caso contrário, não fazer polling
      return false;
    },
  });
}

// Hook para criar um job
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateJobRequest) => apiClient.createJob(data),
    onSuccess: () => {
      // Invalidar lista de jobs para refazer a query
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Hook para atualizar um job
export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, updates }: { jobId: string; updates: { title?: string } }) =>
      apiClient.updateJob(jobId, updates),
    onSuccess: (data, variables) => {
      // Invalidar job específico e lista
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(variables.jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Hook para deletar um job
export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => apiClient.deleteJob(jobId),
    onSuccess: (_, jobId) => {
      // Remover job do cache
      queryClient.removeQueries({ queryKey: jobKeys.detail(jobId) });
      // Invalidar lista
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}

// Hook para upload de vídeo
export function useUploadVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      uri,
      userId,
      onProgress,
    }: {
      uri: string;
      userId: string;
      onProgress?: (progress: number) => void;
    }) => apiClient.uploadVideo(uri, userId, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
    },
  });
}
