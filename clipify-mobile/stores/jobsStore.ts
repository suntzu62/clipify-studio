import { create } from 'zustand';
import type { Job, CreateJobRequest, Clip } from '@/types';
import apiClient from '@/services/api';

interface JobsState {
  jobs: Job[];
  currentJob: Job | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchJobs: () => Promise<void>;
  fetchJob: (jobId: string) => Promise<void>;
  createJob: (data: CreateJobRequest) => Promise<Job>;
  updateJob: (jobId: string, updates: { title?: string }) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  clearError: () => void;
  clearCurrentJob: () => void;
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: [],
  currentJob: null,
  isLoading: false,
  error: null,

  fetchJobs: async () => {
    set({ isLoading: true, error: null });
    try {
      const jobs = await apiClient.getJobs();
      set({ jobs, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao carregar projetos',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchJob: async (jobId: string) => {
    set({ isLoading: true, error: null });
    try {
      const job = await apiClient.getJob(jobId);
      set({ currentJob: job, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao carregar projeto',
        isLoading: false,
      });
      throw error;
    }
  },

  createJob: async (data: CreateJobRequest): Promise<Job> => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.createJob(data);

      // Fetch the created job
      const job = await apiClient.getJob(response.jobId);

      // Add to jobs list
      set((state) => ({
        jobs: [job, ...state.jobs],
        currentJob: job,
        isLoading: false,
      }));

      return job;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao criar projeto',
        isLoading: false,
      });
      throw error;
    }
  },

  updateJob: async (jobId: string, updates: { title?: string }) => {
    set({ isLoading: true, error: null });
    try {
      const updatedJob = await apiClient.updateJob(jobId, updates);

      // Update in jobs list
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.jobId === jobId ? updatedJob : job
        ),
        currentJob:
          state.currentJob?.jobId === jobId ? updatedJob : state.currentJob,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao atualizar projeto',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteJob: async (jobId: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.deleteJob(jobId);

      // Remove from jobs list
      set((state) => ({
        jobs: state.jobs.filter((job) => job.jobId !== jobId),
        currentJob:
          state.currentJob?.jobId === jobId ? null : state.currentJob,
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Erro ao deletar projeto',
        isLoading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  clearCurrentJob: () => set({ currentJob: null }),
}));
