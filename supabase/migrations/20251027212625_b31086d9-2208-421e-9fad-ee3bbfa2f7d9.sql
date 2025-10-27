-- FASE 1: Configurar Supabase Auth Backend
-- Criar tabela profiles para informações adicionais de usuário

-- 1. Criar tabela profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS na tabela profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS: Usuários só veem/editam próprio perfil
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Criar função para auto-criar profile ao criar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- 3. Criar trigger para executar função em cada novo usuário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Migrar tabelas existentes de clerk_user_id para user_id (UUID)

-- Subscriptions: Adicionar user_id e atualizar RLS
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Dropar policies antigas do Clerk
DROP POLICY IF EXISTS "Authenticated users can view own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Prevent direct subscription creation" ON public.subscriptions;
DROP POLICY IF EXISTS "Prevent direct subscription updates" ON public.subscriptions;
DROP POLICY IF EXISTS "Prevent direct subscription deletion" ON public.subscriptions;

-- Criar novas policies usando auth.uid()
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Prevent direct subscription creation"
  ON public.subscriptions FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Prevent direct subscription updates"
  ON public.subscriptions FOR UPDATE
  USING (false);

CREATE POLICY "Prevent direct subscription deletion"
  ON public.subscriptions FOR DELETE
  USING (false);

-- Usage: Adicionar user_id e atualizar RLS
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Dropar policy antiga do Clerk
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage;

-- Criar nova policy usando auth.uid()
CREATE POLICY "Users can view own usage"
  ON public.usage FOR SELECT
  USING (auth.uid() = user_id);

-- Usage Events: Adicionar user_id e atualizar RLS
ALTER TABLE public.usage_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Dropar policy antiga do Clerk
DROP POLICY IF EXISTS "Users can view own usage events" ON public.usage_events;

-- Criar nova policy usando auth.uid()
CREATE POLICY "Users can view own usage events"
  ON public.usage_events FOR SELECT
  USING (auth.uid() = user_id);

-- YouTube Accounts: Já tem user_id mas precisa atualizar RLS (a coluna já referencia auth.users)
-- Verificar se as policies estão corretas (já parecem estar usando auth.uid() corretamente)

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON public.usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON public.usage_events(user_id);

-- 6. Trigger para atualizar updated_at em profiles
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();