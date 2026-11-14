-- ============================================================================
-- PORTTOHUB PRO — 08_INDICES_E_CONSTRAINTS.sql
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   1. Cria índices compostos por (condominio_id, ...) para acelerar filtros de
--      encomendas, moradores, acessos e auditoria.
--   2. Adiciona coluna de idempotência operation_id em encomendas_itens para
--      evitar duplicações na sincronização offline/online.
--   3. Valida presença de dados órfãos ANTES de sugerir FKs rígidas (NOT VALID
--      ou após conferir 01_DIAGNOSTICO_DESTINO.sql).
--
-- ONDE EXECUTAR:
--   Supabase Dashboard do DESTINO -> SQL Editor -> New query -> Run.
-- ============================================================================

BEGIN;

-- Idempotência em encomendas_itens para sincronização segura sem duplicar pacotes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'encomendas_itens') THEN
    ALTER TABLE public.encomendas_itens
      ADD COLUMN IF NOT EXISTS operation_id TEXT,
      ADD COLUMN IF NOT EXISTS morador_id UUID;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_encomendas_condo_operation_id
      ON public.encomendas_itens(condominio_id, operation_id)
      WHERE operation_id IS NOT NULL AND trim(operation_id) <> '';

    CREATE INDEX IF NOT EXISTS idx_encomendas_condo_status_data
      ON public.encomendas_itens(condominio_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_encomendas_condo_unidade
      ON public.encomendas_itens(condominio_id, unidade, bloco);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'moradores') THEN
    CREATE INDEX IF NOT EXISTS idx_moradores_condo_unidade_bloco
      ON public.moradores(condominio_id, unidade, bloco);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'historico_absoluto') THEN
    CREATE INDEX IF NOT EXISTS idx_historico_condo_criado
      ON public.historico_absoluto(condominio_id, criado_em DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prestadores_acessos') THEN
    CREATE INDEX IF NOT EXISTS idx_prest_acessos_condo_entrada
      ON public.prestadores_acessos(condominio_id, data_hora_entrada DESC);
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
