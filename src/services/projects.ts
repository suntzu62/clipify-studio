import { supabase } from "@/integrations/supabase/client";

export type Project = {
  id: string;
  user_id: string;
  youtube_url: string;
  title: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type CreateProjectInput = {
  youtube_url: string;
  title?: string;
  settings?: Record<string, unknown>;
};

export async function listProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Project[];
}

export async function createProject(input: CreateProjectInput) {
  const payload = {
    youtube_url: input.youtube_url,
    title: input.title ?? null,
    status: "pending" as const,
    settings: input.settings ?? null,
  };
  const { data, error } = await supabase
    .from("projects")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as Project;
}

export async function deleteProject(id: string) {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

