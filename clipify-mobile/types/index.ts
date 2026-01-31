// User types
export interface User {
  id: string;
  email: string;
  fullName?: string;
  profilePicture?: string;
  createdAt: string;
  plan?: 'free' | 'premium' | 'enterprise';
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// Job/Project types (backend usa "job" como nomenclatura)
export interface Job {
  id: string;
  jobId: string;
  userId: string;
  title?: string;
  sourceType: 'youtube' | 'upload';
  youtubeUrl?: string;
  uploadPath?: string;
  targetDuration: number;
  clipCount: number;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  state: 'waiting' | 'active' | 'completed' | 'failed';
  currentStep?: 'ingest' | 'transcribe' | 'scenes' | 'rank' | 'render' | 'texts' | 'export';
  progress?: number | { progress: number; message?: string };
  error?: string;
  result?: JobResult;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string;
}

export interface JobResult {
  clips: Clip[];
  metadata?: any;
}

// Clip types
export interface Clip {
  id: string;
  title: string;
  description?: string;
  hashtags?: string[];
  previewUrl: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  duration: number;
  start: number;
  end: number;
  score?: number;
  status: 'processing' | 'ready' | 'error';
  transcript?: string;
}

// Adicionar alias Project que mapeia para Job
export type Project = Job;

// Subtitle types
export interface Subtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style?: SubtitleStyle;
}

export interface SubtitleStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  position?: 'top' | 'center' | 'bottom';
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Upload types
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface VideoUploadRequest {
  uri: string;
  name: string;
  type: string;
}

// Job creation types
export interface CreateJobRequest {
  userId: string;
  sourceType: 'youtube' | 'upload';
  youtubeUrl?: string;
  uploadPath?: string;
  targetDuration?: number;
  clipCount?: number;
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  message: string;
}

// SSE Event types for real-time updates
export interface SSEProgressEvent {
  jobId: string;
  state: string;
  status: string;
  currentStep: string;
  progress: number | { progress: number; message?: string };
}

export interface SSECompletedEvent {
  jobId: string;
  state: 'completed';
  status: 'completed';
  currentStep: 'export';
  progress: { progress: number; message: string };
  result: JobResult;
}

export interface SSEFailedEvent {
  jobId: string;
  state: 'failed';
  status: 'failed';
  error: string;
}
