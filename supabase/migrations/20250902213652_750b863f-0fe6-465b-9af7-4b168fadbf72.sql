
-- 1) Enum de planos (opcional, para consistência)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_type') then
    create type public.plan_type as enum ('free','pro','scale');
  end if;
end$$;

-- 2) subscriptions: status do Stripe + plano atual
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.plan_type not null default 'free',
  status text not null default 'canceled',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) usage: consumo do ciclo atual
create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  minutes_quota int not null default 30,
  minutes_used int not null default 0,
  shorts_quota int not null default 100,
  shorts_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) usage_events: idempotência de incrementos
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  idempotency_key text not null unique,
  minutes int not null default 0,
  shorts int not null default 0,
  created_at timestamptz not null default now()
);

-- 5) índices úteis
create index if not exists idx_subscriptions_clerk_user_id on public.subscriptions (clerk_user_id);
create index if not exists idx_usage_clerk_user_id on public.usage (clerk_user_id);
create index if not exists idx_usage_events_clerk_user_id on public.usage_events (clerk_user_id);

-- 6) RLS: habilitar e não expor dados diretamente (somente Edge Functions com Service Role)
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.usage_events enable row level security;

-- Observação: Sem políticas de SELECT/INSERT/UPDATE/DELETE para "authenticated"/"anon".
-- Somente o Service Role (usado nos Edge Functions) conseguirá ler/gravar (bypass RLS).
-- Isso é intencional pois usamos Clerk (não Supabase Auth) para autenticação.

-- 7) Trigger para updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_usage_updated_at on public.usage;
create trigger trg_usage_updated_at
before update on public.usage
for each row execute function public.set_updated_at();
