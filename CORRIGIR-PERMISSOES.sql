-- Corrigir permissões do schema public para o service_role
-- Execute este SQL no Supabase SQL Editor

-- Garantir que service_role tem todas as permissões no schema public
GRANT ALL ON SCHEMA public TO service_role;

-- Garantir que service_role pode fazer tudo nas tabelas
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Para futuras tabelas também
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
