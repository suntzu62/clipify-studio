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
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error('[listProjects] Auth error:', authError);
    throw authError;
  }
  if (!user) {
    console.error('[listProjects] No authenticated user');
    throw new Error('Not authenticated');
  }

  console.log('[listProjects] Fetching projects for user:', user.id);

  // Try to fetch from database first
  const { data, error } = await supabase
    .from("user_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // If database query succeeds and has data, return it
  if (!error && data && data.length > 0) {
    console.log('[listProjects] Found projects in database:', data.length);
    return data as unknown as Project[];
  }

  // Fallback to localStorage if database is empty or has errors
  console.warn('[listProjects] Database error or empty, falling back to localStorage:', error);
  const localJobs = getUserJobs(user.id);
  console.log('[listProjects] Found projects in localStorage:', localJobs.length);

  return localJobs.map(job => jobToProject(job, user.id));
}

export async function createProject(input: CreateProjectInput) {
  // Get authenticated session
  const { data: { session }, error: authError } = await supabase.auth.getSession();
  if (authError) {
    console.error('[createProject] Auth error:', authError);
    throw authError;
  }
  if (!session?.access_token) {
    console.error('[createProject] No authenticated session');
    throw new Error('Not authenticated');
  }

  console.log('[createProject] Creating project via enqueue-pipeline for user:', session.user.id);

  // Call the enqueue-pipeline edge function to properly queue the job
  const { data, error } = await supabase.functions.invoke('enqueue-pipeline', {
    body: {
      youtubeUrl: input.youtube_url.trim(),
      neededMinutes: 10,
      meta: {
        targetDuration: '60'
      }
    }
  });

  if (error) {
    console.error('[createProject] Edge function error:', error);
    throw new Error(error.message || 'Failed to create project');
  }

  console.log('[createProject] Project created:', data?.jobId);

  // Create project object
  const project: Project = {
    id: data.jobId,
    user_id: session.user.id,
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

export async function deleteProject(id: string) {
  const { error } = await supabase
    .from("user_jobs")
    .delete()
    .eq("id", id as any);
  if (error) throw error;
}

