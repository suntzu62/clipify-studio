import { getUserJobs } from "@/lib/storage";
import { Job } from "@/lib/jobs-api";
import { extractVideoId } from "@/lib/youtube-metadata";

export type Project = {
  id: string;
  user_id: string;
  youtube_url: string | null;
  title: string | null;
  display_title?: string | null;
  status: string;
  progress: number | null;
  source: string | null;
  storage_path: string | null;
  file_name: string | null;
  clips_ready_count?: number;
  created_at: string;
  updated_at: string | null;
};

export type CreateProjectInput = {
  youtube_url: string;
  title?: string;
  settings?: Record<string, unknown>;
};

type BackendJob = {
  id: string;
  user_id: string;
  youtube_url: string | null;
  title: string | null;
  display_title?: string | null;
  status: string;
  progress: number | null;
  source_type: string | null;
  upload_path: string | null;
  video_path: string | null;
  clips_ready_count?: number;
  created_at: string;
  updated_at: string | null;
};

// Convert Job from localStorage to Project format
function jobToProject(job: Job, userId: string): Project {
  const fallbackTitle = job.youtubeUrl ? fallbackVideoNameFromUrl(job.youtubeUrl) : null;
  return {
    id: job.id,
    user_id: userId,
    youtube_url: job.youtubeUrl || null,
    title: fallbackTitle,
    display_title: fallbackTitle,
    status: job.status,
    progress: job.progress || 0,
    source: job.youtubeUrl ? 'youtube' : 'upload',
    storage_path: job.storagePath || null,
    file_name: job.fileName || null,
    clips_ready_count: job.result?.clips?.length || 0,
    created_at: job.createdAt,
    updated_at: null,
  };
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

function normalizeProjectStatus(status: string | null | undefined): string {
  const value = (status || '').toLowerCase();
  if (value === 'processing' || value === 'active') return 'active';
  if (value === 'pending' || value === 'queued' || value === 'waiting') return 'queued';
  if (value === 'completed') return 'completed';
  if (value === 'failed') return 'failed';
  return 'queued';
}

function fallbackVideoNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').trim();
      return id ? `YouTube ${id}` : null;
    }

    const v = parsed.searchParams.get('v');
    if (v) return `YouTube ${v}`;

    const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts?.[1]) return `YouTube Short ${shorts[1]}`;

    return null;
  } catch {
    return null;
  }
}

function sortProjectsByDateDesc(items: Project[]): Project[] {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return bTime - aTime;
  });
}

export async function listProjects(currentUserId?: string) {
  const userId = currentUserId || 'dev-user';

  console.log('[listProjects] Fetching projects for user:', userId);

  try {
    // Buscar jobs do backend PostgreSQL via API
    const response = await fetch(
      `${BACKEND_URL}/jobs?userId=${encodeURIComponent(userId)}&includeLegacy=true`,
      {
      headers: {
        'x-api-key': API_KEY,
      },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as BackendJob[];
    console.log('[listProjects] Found projects from API:', data.length);

    // Mapear os dados do backend para o formato Project
    const mapped = data.map((job): Project => {
      const fallbackTitle = fallbackVideoNameFromUrl(job.youtube_url);
      const resolvedTitle = job.display_title || job.title || fallbackTitle;

      return {
      id: job.id,
      user_id: job.user_id,
      youtube_url: job.youtube_url,
      title: resolvedTitle,
      display_title: job.display_title || fallbackTitle,
      status: normalizeProjectStatus(job.status),
      progress: job.progress,
      source: job.source_type,
      storage_path: job.upload_path || job.video_path,
      file_name: null,
      clips_ready_count: Number(job.clips_ready_count || 0),
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
    });

    return sortProjectsByDateDesc(mapped);
  } catch (error) {
    console.error('[listProjects] API error, falling back to localStorage:', error);

    // Fallback to localStorage if API fails
    const localJobs = getUserJobs(userId);
    console.log('[listProjects] Found projects in localStorage:', localJobs.length);

    const mapped = localJobs.map(job => jobToProject(job, userId));
    return sortProjectsByDateDesc(mapped);
  }
}

export async function createProject(input: CreateProjectInput, currentUserId?: string) {
  const userId = currentUserId || 'dev-user';
  console.log('[createProject] Creating project via local API for user:', userId);

  // Call the local backend API to create the job
  const response = await fetch(`${BACKEND_URL}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      userId: userId,
      sourceType: 'youtube',
      youtubeUrl: input.youtube_url.trim(),
      targetDuration: 30,
      clipCount: 30,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[createProject] API error:', errorData);
    throw new Error(errorData.message || 'Failed to create project');
  }

    const data = (await response.json()) as { jobId: string };
    console.log('[createProject] Project created:', data.jobId);

  // Create project object
  const project: Project = {
    id: data.jobId,
    user_id: userId,
    youtube_url: input.youtube_url,
    title: input.title?.trim() || fallbackVideoNameFromUrl(input.youtube_url),
    display_title: fallbackVideoNameFromUrl(input.youtube_url),
    status: 'queued',
    progress: 0,
    source: 'youtube',
    storage_path: null,
    file_name: null,
    clips_ready_count: 0,
    created_at: new Date().toISOString(),
    updated_at: null,
  };

  // Also save to localStorage for immediate visibility
  try {
    const { saveUserJob } = await import('@/lib/storage');
    const job: Job = {
      id: project.id,
      status: 'queued',
      progress: project.progress || 0,
      youtubeUrl: project.youtube_url || undefined,
      storagePath: project.storage_path || undefined,
      fileName: project.file_name || undefined,
      createdAt: project.created_at,
      neededMinutes: 10,
    };
    saveUserJob(userId, job);
    console.log('[createProject] Saved to localStorage');
  } catch (storageError) {
    console.warn('[createProject] Failed to save to localStorage:', storageError);
  }

  return project;
}

export async function updateProject(id: string, updates: { title?: string }) {
  const response = await fetch(`${BACKEND_URL}/jobs/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
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
  const response = await fetch(`${BACKEND_URL}/jobs/${id}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to delete project');
  }
}
