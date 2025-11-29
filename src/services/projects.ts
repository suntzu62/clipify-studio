import { supabase } from "@/integrations/supabase/client";
import { getUserJobs } from "@/lib/storage";
import { Job } from "@/lib/jobs-api";

export type Project = {
  id: string;
  user_id: string;
  youtube_url: string | null;
  title: string | null;
  status: string;
  progress: number | null;
  source: string | null;
  storage_path: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string | null;
};

export type CreateProjectInput = {
  youtube_url: string;
  title?: string;
  settings?: Record<string, unknown>;
};

// Convert Job from localStorage to Project format
function jobToProject(job: Job, userId: string): Project {
  return {
    id: job.id,
    user_id: userId,
    youtube_url: job.youtubeUrl || null,
    title: null,
    status: job.status,
    progress: job.progress || 0,
    source: job.youtubeUrl ? 'youtube' : 'upload',
    storage_path: job.storagePath || null,
    file_name: job.fileName || null,
    created_at: job.createdAt,
    updated_at: null,
  };
}

export async function listProjects() {
  // Get authenticated user from Supabase (para obter email/userId mesmo sem usar o banco)
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Se não tiver usuário no Supabase Auth, usar userId fixo de desenvolvimento
  const userId = user?.id || 'dev-user';

  console.log('[listProjects] Fetching projects for user:', userId);

  try {
    // Buscar jobs do backend PostgreSQL via API
    const response = await fetch('http://localhost:3001/jobs', {
      headers: {
        'x-api-key': import.meta.env.VITE_API_KEY || '93560857g',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[listProjects] Found projects from API:', data.length);

    // Mapear os dados do backend para o formato Project
    return data.map((job: any): Project => ({
      id: job.id,
      user_id: job.user_id,
      youtube_url: job.youtube_url,
      title: job.title,
      status: job.status,
      progress: job.progress,
      source: job.source_type,
      storage_path: job.upload_path || job.video_path,
      file_name: null,
      created_at: job.created_at,
      updated_at: job.updated_at,
    }));
  } catch (error) {
    console.error('[listProjects] API error, falling back to localStorage:', error);

    // Fallback to localStorage if API fails
    const localJobs = getUserJobs(userId);
    console.log('[listProjects] Found projects in localStorage:', localJobs.length);

    return localJobs.map(job => jobToProject(job, userId));
  }
}

export async function createProject(input: CreateProjectInput) {
  // Get authenticated user from Supabase (para obter email/userId mesmo sem usar o banco)
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Se não tiver usuário no Supabase Auth, usar userId fixo de desenvolvimento
  const userId = user?.id || 'dev-user';

  console.log('[createProject] Creating project via local API for user:', userId);

  // Call the local backend API to create the job
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const apiKey = import.meta.env.VITE_API_KEY || '93560857g';

  const response = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      userId: userId,
      sourceType: 'youtube',
      youtubeUrl: input.youtube_url.trim(),
      targetDuration: 60,
      clipCount: 8,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[createProject] API error:', errorData);
    throw new Error(errorData.message || 'Failed to create project');
  }

  const data = await response.json();
  console.log('[createProject] Project created:', data.jobId);

  // Create project object
  const project: Project = {
    id: data.jobId,
    user_id: userId,
    youtube_url: input.youtube_url,
    title: input.title ?? null,
    status: 'queued',
    progress: 0,
    source: 'youtube',
    storage_path: null,
    file_name: null,
    created_at: new Date().toISOString(),
    updated_at: null,
  };

  // Also save to localStorage for immediate visibility
  try {
    const { saveUserJob } = await import('@/lib/storage');
    const job: Job = {
      id: project.id,
      status: project.status as any,
      progress: project.progress || 0,
      youtubeUrl: project.youtube_url || undefined,
      storagePath: project.storage_path || undefined,
      fileName: project.file_name || undefined,
      createdAt: project.created_at,
      neededMinutes: 10,
    };
    saveUserJob(session.user.id, job);
    console.log('[createProject] Saved to localStorage');
  } catch (storageError) {
    console.warn('[createProject] Failed to save to localStorage:', storageError);
  }

  return project;
}

export async function updateProject(id: string, updates: { title?: string }) {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const apiKey = import.meta.env.VITE_API_KEY || '93560857g';

  const response = await fetch(`${baseUrl}/jobs/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update project');
  }

  return response.json();
}

export async function deleteProject(id: string) {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const apiKey = import.meta.env.VITE_API_KEY || '93560857g';

  const response = await fetch(`${baseUrl}/jobs/${id}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': apiKey,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to delete project');
  }
}

