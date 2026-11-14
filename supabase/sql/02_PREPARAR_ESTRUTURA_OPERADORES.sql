-- ============================================================================
-- PORTTOHUB PRO — 02_PREPARAR_ESTRUTURA_OPERADORES.sql (ADITIVO / NAO DESTRUTIVO)
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Prepara a tabela public.operadores para autenticação real com Supabase Auth
--   e controle explícito de acesso global a condomínios, SEM apagar dados,
--   SEM remover colunas antigas e SEM quebrar registros já existentes.
--
-- PRE-REQUISITO OBRIGATORIO:
--   Execute primeiro 01_CRIAR_TABELAS_DO_ZERO.sql (em banco novo/vazio) ou
--   confira a estrutura existente com 00B_DIAGNOSTICO_DESTINO.sql.
--
-- ONDE EXECUTAR:
--   Supabase Dashboard do DESTINO -> SQL Editor -> New query -> Run.
-- ============================================================================

BEGIN;

-- Adiciona colunas necessárias para Auth real e controle explícito de acesso global
ALTER TABLE public.operadores
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS acesso_global_condominios BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exigir_troca_senha BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS migrado_auth_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Garante que NINGUEM receba acesso_global_condominios automaticamente por
-- nome de login ('admin'), nivel_acesso ou condominio_id = 'todos'/'global'.
-- O campo inicia FALSE para todos; a concessão deve ser explícita no passo 03.
UPDATE public.operadores
SET acesso_global_condominios = FALSE
WHERE acesso_global_condominios IS NULL;

-- Normaliza emails válidos já preenchidos na coluna email (quando houver)
UPDATE public.operadores
SET email = lower(trim(email))
WHERE email IS NOT NULL AND email <> lower(trim(email));

-- Se o campo login já for um e-mail válido e email estiver vazio, copia para email
UPDATE public.operadores
SET email = lower(trim(login))
WHERE (email IS NULL OR trim(email) = '')
  AND login IS NOT NULL
  AND login ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';

-- Índices únicos parciais seguros (não falham em linhas sem vínculo ainda)
CREATE UNIQUE INDEX IF NOT EXISTS ux_operadores_auth_user_id
  ON public.operadores(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_operadores_email_lower
  ON public.operadores(lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_operadores_condominio_ativo
  ON public.operadores(condominio_id, ativo);

COMMIT;

NOTIFY pgrst, 'reload schema';
