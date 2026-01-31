import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type {
  User,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Job,
  CreateJobRequest,
  CreateJobResponse,
  Clip,
} from '@/types';

// API URL - em desenvolvimento, usar IP local (não localhost)
// Ajuste o IP para o da sua máquina rodando o backend
const API_URL = __DEV__ ? 'http://192.168.0.119:3001' : 'https://api.clipify.com';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Unauthorized - clear tokens and redirect to login
          await AsyncStorage.removeItem('accessToken');
          await AsyncStorage.removeItem('refreshToken');
          await AsyncStorage.removeItem('user');

          // Navigate to login (usar router do expo-router)
          if (router.canGoBack()) {
            router.replace('/login');
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // ============================================
  // AUTH ENDPOINTS
  // ============================================

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/register', data);

    if (response.data.accessToken) {
      await AsyncStorage.setItem('accessToken', response.data.accessToken);
      await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
    }

    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', data);

    if (response.data.accessToken) {
      await AsyncStorage.setItem('accessToken', response.data.accessToken);
      await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
    }

    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('user');
  }

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await this.client.get<{ user: User }>('/auth/me');

    // Atualizar cache local
    await AsyncStorage.setItem('user', JSON.stringify(response.data.user));

    return response.data;
  }

  async getCachedUser(): Promise<User | null> {
    const userJson = await AsyncStorage.getItem('user');
    return userJson ? JSON.parse(userJson) : null;
  }

  // ============================================
  // JOBS/PROJECTS ENDPOINTS
  // ============================================

  async getJobs(): Promise<Job[]> {
    const response = await this.client.get<Job[]>('/jobs');
    return response.data;
  }

  async getJob(jobId: string): Promise<Job> {
    const response = await this.client.get(`/jobs/${jobId}`);
    return response.data;
  }

  async createJob(data: CreateJobRequest): Promise<CreateJobResponse> {
    const response = await this.client.post<CreateJobResponse>('/jobs', data);
    return response.data;
  }

  async createJobFromUpload(
    userId: string,
    storagePath: string,
    fileName: string,
    targetDuration: number = 60,
    clipCount: number = 5
  ): Promise<CreateJobResponse> {
    const response = await this.client.post<CreateJobResponse>('/jobs/from-upload', {
      userId,
      storagePath,
      fileName,
      targetDuration,
      clipCount,
    });
    return response.data;
  }

  async updateJob(jobId: string, updates: { title?: string }): Promise<Job> {
    const response = await this.client.patch<Job>(`/jobs/${jobId}`, updates);
    return response.data;
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.client.delete(`/jobs/${jobId}`);
  }

  // ============================================
  // UPLOAD ENDPOINTS
  // ============================================

  async uploadVideo(
    uri: string,
    userId: string,
    onProgress?: (progress: number) => void
  ): Promise<{ storagePath: string; fileName: string }> {
    const formData = new FormData();

    // Extrair nome do arquivo do URI
    const fileName = uri.split('/').pop() || 'video.mp4';

    // @ts-ignore - React Native FormData handles file uploads differently
    formData.append('video', {
      uri,
      type: 'video/mp4',
      name: fileName,
    });
    formData.append('userId', userId);

    const response = await this.client.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });

    return response.data;
  }

  // ============================================
  // CLIPS ENDPOINTS
  // ============================================

  async getClips(jobId: string): Promise<Clip[]> {
    const job = await this.getJob(jobId);
    return job.result?.clips || [];
  }

  // ============================================
  // SSE STREAM ENDPOINTS (Real-time updates)
  // ============================================

  async subscribeToJobUpdates(
    jobId: string,
    callbacks: {
      onProgress?: (data: any) => void;
      onCompleted?: (data: any) => void;
      onFailed?: (data: any) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<() => void> {
    // EventSource não é nativo no React Native, então vamos usar fetch com streaming
    // Ou podemos fazer polling como fallback

    // Por enquanto, retornar função de cleanup vazia
    // TODO: Implementar SSE ou polling para updates em tempo real
    return () => {};
  }

  // ============================================
  // HEALTH CHECK
  // ============================================

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
