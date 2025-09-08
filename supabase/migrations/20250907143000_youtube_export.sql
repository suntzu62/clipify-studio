-- YouTube OAuth accounts per user
create table if not exists public.youtube_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_id text,
  channel_title text,
  access_token text,
  refresh_token text not null,
  expiry_date timestamptz,
  scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Clip export attempts per clip
create table if not exists public.clip_exports (
  id uuid primary key default gen_random_uuid(),
  root_id text not null,
  clip_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued', -- queued|uploading|processing|done|failed
  youtube_video_id text,
  youtube_url text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.youtube_accounts enable row level security;
alter table public.clip_exports enable row level security;

-- Simple RLS: each user can select their own rows
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='youtube_accounts' and policyname='yt self'
  ) then
    create policy "yt self" on public.youtube_accounts for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='clip_exports' and policyname='exports self'
  ) then
    create policy "exports self" on public.clip_exports for select using (auth.uid() = user_id);
  end if;
end$$;

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_youtube_accounts_updated_at on public.youtube_accounts;
create trigger trg_youtube_accounts_updated_at
before update on public.youtube_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_clip_exports_updated_at on public.clip_exports;
create trigger trg_clip_exports_updated_at
before update on public.clip_exports
for each row execute function public.set_updated_at();

