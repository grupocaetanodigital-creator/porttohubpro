-- ============================================================================
-- PORTTOHUB PRO — 06_RLS_TABELAS_MULTI_TENANT.sql
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Remove qualquer política permissiva USING (true) / WITH CHECK (true) e
--   ativa Row Level Security (RLS) real em todas as tabelas do sistema,
--   garantindo que:
--     1. Usuários anônimos (anon) NÃO tenham acesso a dados operacionais.
--     2. Cada operador autenticado só veja/edite registros dos condomínios
--        aos quais está explicitamente autorizado.
--     3. Apenas administradores com acesso_global_condominios = TRUE possam
--        alterar esse flag ou operar múltiplos condomínios globalmente.
--
-- PRE-REQUISITOS OBRIGATORIOS:
--   - Ter executado 01, 02, 03, 04 e 05.
--   - Ter criado o 1º Administrador Geral em auth.users e vinculado via passo 03.
--
-- ATENCAO: A aplicação faz o bloco abaixo de forma idempotente, ignorando
--   apenas tabelas opcionais que ainda não existam no projeto.
-- ============================================================================

BEGIN;

-- 1. BLOQUEIA ACESSO ANONIMO DIRETO NAS TABELAS MULTI-TENANT
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
  tabelas_multi_tenant TEXT[] := ARRAY[
    'configuracoes', 'moradores', 'entregadores', 'lotes_re',
    'encomendas_itens', 'locais_armazenamento', 'custodia', 'materiais_posto',
    'chaves', 'movimentacao_chaves', 'checklist_manutencao',
    'chamados_manutencao', 'rondas_pontos', 'rondas_execucao',
    'rondas_registros', 'rondas_setores', 'ocorrencias', 'passagens_posto',
    'prestadores', 'prestadores_acessos', 'lembretes_portaria',
    'bancada_volumes', 'bancada_conferencias', 'historico_absoluto',
    'templates_whatsapp', 'agenda_emergencia', 'areas_comuns',
    'reservas_areas_comuns', 'pontos_acesso', 'registros_acesso',
    'passes_virtuais_qr', 'blacklist_bloqueios'
  ];
BEGIN
  FOREACH tbl IN ARRAY tabelas_multi_tenant LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', tbl);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

      FOR pol IN
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl);
      END LOOP;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'condominio_id'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (public.operador_pode_acessar_condominio(condominio_id::text))
           WITH CHECK (public.operador_pode_acessar_condominio(condominio_id::text));',
          'rls_tenant_' || tbl,
          tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- 2. RLS NA TABELA condominios (somente condomínios autorizados ao operador)
DO $$
DECLARE pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'condominios') THEN
    REVOKE ALL ON TABLE public.condominios FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.condominios TO authenticated;
    ALTER TABLE public.condominios ENABLE ROW LEVEL SECURITY;

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'condominios' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.condominios;', pol.policyname);
    END LOOP;

    CREATE POLICY rls_condominios_select ON public.condominios
      FOR SELECT TO authenticated
      USING (public.operador_pode_acessar_condominio(id::text));

    CREATE POLICY rls_condominios_insert ON public.condominios
      FOR INSERT TO authenticated
      WITH CHECK (public.operador_tem_acesso_global());

    CREATE POLICY rls_condominios_update ON public.condominios
      FOR UPDATE TO authenticated
      USING (public.operador_tem_acesso_global() OR public.operador_pode_acessar_condominio(id::text))
      WITH CHECK (public.operador_tem_acesso_global() OR public.operador_pode_acessar_condominio(id::text));

    CREATE POLICY rls_condominios_delete ON public.condominios
      FOR DELETE TO authenticated
      USING (public.operador_tem_acesso_global());
  END IF;
END $$;

-- 3. RLS NA TABELA operadores (o operador lê seu próprio registro; gestão respeita condomínio e proíbe auto-escalação)
DO $$
DECLARE pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operadores') THEN
    REVOKE ALL ON TABLE public.operadores FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operadores TO authenticated;
    ALTER TABLE public.operadores ENABLE ROW LEVEL SECURITY;

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operadores' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.operadores;', pol.policyname);
    END LOOP;

    CREATE POLICY rls_operadores_select ON public.operadores
      FOR SELECT TO authenticated
      USING (
        auth_user_id = auth.uid()
        OR public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND condominio_id IS NOT NULL
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      );

    CREATE POLICY rls_operadores_insert ON public.operadores
      FOR INSERT TO authenticated
      WITH CHECK (
        public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND COALESCE(acesso_global_condominios, FALSE) = FALSE
          AND condominio_id IS NOT NULL
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      );

    CREATE POLICY rls_operadores_update ON public.operadores
      FOR UPDATE TO authenticated
      USING (
        auth_user_id = auth.uid()
        OR public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND condominio_id IS NOT NULL
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      )
      WITH CHECK (
        public.operador_tem_acesso_global()
        OR (
          COALESCE(acesso_global_condominios, FALSE) = FALSE
          AND (
            auth_user_id = auth.uid()
            OR (
              public.operador_pode_gerenciar_operadores()
              AND condominio_id IS NOT NULL
              AND public.operador_pode_acessar_condominio(condominio_id::text)
            )
          )
        )
      );

    CREATE POLICY rls_operadores_delete ON public.operadores
      FOR DELETE TO authenticated
      USING (
        public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND COALESCE(acesso_global_condominios, FALSE) = FALSE
          AND auth_user_id IS DISTINCT FROM auth.uid()
          AND condominio_id IS NOT NULL
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      );
  END IF;
END $$;

-- 4. RLS NA TABELA operador_condominios
DO $$
DECLARE pol RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operador_condominios') THEN
    REVOKE ALL ON TABLE public.operador_condominios FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operador_condominios TO authenticated;
    ALTER TABLE public.operador_condominios ENABLE ROW LEVEL SECURITY;

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'operador_condominios' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.operador_condominios;', pol.policyname);
    END LOOP;

    CREATE POLICY rls_op_condo_select ON public.operador_condominios
      FOR SELECT TO authenticated
      USING (
        operador_id = public.operador_atual_id()
        OR public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      );

    CREATE POLICY rls_op_condo_manage ON public.operador_condominios
      FOR ALL TO authenticated
      USING (
        public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      )
      WITH CHECK (
        public.operador_tem_acesso_global()
        OR (
          public.operador_pode_gerenciar_operadores()
          AND public.operador_pode_acessar_condominio(condominio_id::text)
        )
      );
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
