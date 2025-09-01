-- Projects table and RLS policies
-- Run this in your Supabase SQL editor.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  youtube_url text not null,
  title text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.projects enable row level security;

-- Allow users to manage only their own projects
create policy if not exists "Projects are viewable by owner"
  on public.projects for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their projects"
  on public.projects for insert
  with check (auth.uid() = user_id or user_id is null);

create policy if not exists "Owners can update their projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy if not exists "Owners can delete their projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Ensure user_id is set automatically on insert if not provided
create or replace function public.handle_projects_user_id()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_projects_user_id on public.projects;
create trigger set_projects_user_id
  before insert on public.projects
  for each row execute procedure public.handle_projects_user_id();

