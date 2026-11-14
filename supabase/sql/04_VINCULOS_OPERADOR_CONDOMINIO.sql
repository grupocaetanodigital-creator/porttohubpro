-- ============================================================================
-- PORTTOHUB PRO — 04_VINCULOS_OPERADOR_CONDOMINIO.sql (TABELA OFICIAL DE VINCULOS)
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Cria a tabela oficial public.operador_condominios que define quais
--   condomínios cada Supervisor (ou operador multi-condomínio) tem permissão
--   explícita para acessar, e importa com segurança o condominio_id principal
--   já cadastrado em public.operadores.
--
-- OBSERVACAO SOBRE TIPOS (UUID vs TEXT):
--   Usa condominio_id e operador_id como UUID se compatível; após revisar o
--   diagnóstico 01_DIAGNOSTICO_DESTINO.sql, adicionaremos a FK exata caso a
--   tabela condominios no destino utilize UUID.
--
-- ONDE EXECUTAR:
--   Supabase Dashboard do DESTINO -> SQL Editor -> New query -> Run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.operador_condominios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID NOT NULL REFERENCES public.operadores(id) ON DELETE CASCADE,
  condominio_id UUID NOT NULL REFERENCES public.condominios(id) ON DELETE CASCADE,
  papel TEXT DEFAULT 'autorizado',
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_operador_condominio UNIQUE (operador_id, condominio_id)
);

CREATE INDEX IF NOT EXISTS idx_op_condo_operador
  ON public.operador_condominios(operador_id, ativo);

CREATE INDEX IF NOT EXISTS idx_op_condo_condominio
  ON public.operador_condominios(condominio_id, ativo);

-- Migra de forma aditiva e idempotente o vínculo principal existente em operadores.condominio_id
-- Apenas quando condominio_id for um UUID válido presente em public.condominios
INSERT INTO public.operador_condominios (operador_id, condominio_id, papel, principal, ativo)
SELECT
  o.id,
  c.id,
  COALESCE(NULLIF(trim(o.funcao), ''), NULLIF(trim(o.perfil), ''), 'operador'),
  TRUE,
  COALESCE(o.ativo, TRUE)
FROM public.operadores o
JOIN public.condominios c
  ON c.id::text = trim(o.condominio_id::text)
WHERE o.condominio_id IS NOT NULL
  AND lower(trim(o.condominio_id::text)) NOT IN ('', 'todos', 'global')
ON CONFLICT (operador_id, condominio_id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
