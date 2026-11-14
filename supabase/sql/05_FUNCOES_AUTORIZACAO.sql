-- ============================================================================
-- PORTTOHUB PRO — 05_FUNCOES_AUTORIZACAO.sql
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Cria funções PostgreSQL seguras (SECURITY DEFINER + search_path fixo) usadas
--   pelas políticas de RLS e pelo Storage para verificar quem é o operador
--   autenticado, se ele tem acesso global explícito, e se pode acessar um
--   determinado condominio_id.
--
-- REGRA CENTRAL DE SEGURANCA:
--   - Nunca verifica login = 'admin', 'master' ou nivel_acesso <= 1 para dar
--     acesso global.
--   - Acesso global depende EXCLUSIVAMENTE de acesso_global_condominios = TRUE
--     em um operador ativo vinculado ao auth.uid() real.
--   - Acesso a um condomínio depende de:
--       (a) acesso_global_condominios = TRUE, OU
--       (b) vínculo ativo em public.operador_condominios, OU
--       (c) condominio_id principal em public.operadores (para operador de 1 condomínio).
--
-- ONDE EXECUTAR:
--   Supabase Dashboard do DESTINO -> SQL Editor -> New query -> Run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.operador_atual_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT o.id
  FROM public.operadores o
  WHERE o.auth_user_id = auth.uid()
    AND COALESCE(o.ativo, TRUE) = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.operador_tem_acesso_global()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.operadores o
    WHERE o.auth_user_id = auth.uid()
      AND COALESCE(o.ativo, TRUE) = TRUE
      AND COALESCE(o.acesso_global_condominios, FALSE) = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.operador_pode_gerenciar_operadores()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.operadores o
    WHERE o.auth_user_id = auth.uid()
      AND COALESCE(o.ativo, TRUE) = TRUE
      AND (
        COALESCE(o.acesso_global_condominios, FALSE) = TRUE
        OR COALESCE(o.nivel_acesso, 99) IN (0, 1)
        OR lower(COALESCE(o.perfil, '')) IN ('admin', 'admin_geral', 'sindico', 'master')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.operador_pode_acessar_condominio(p_condominio_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_condominio_id IS NOT NULL
    AND trim(p_condominio_id) <> ''
    AND lower(trim(p_condominio_id)) NOT IN ('todos', 'global')
    AND EXISTS (
      SELECT 1
      FROM public.operadores o
      WHERE o.auth_user_id = auth.uid()
        AND COALESCE(o.ativo, TRUE) = TRUE
        AND (
          COALESCE(o.acesso_global_condominios, FALSE) = TRUE
          OR o.condominio_id::text = trim(p_condominio_id)
          OR EXISTS (
            SELECT 1
            FROM public.operador_condominios oc
            WHERE oc.operador_id = o.id
              AND COALESCE(oc.ativo, TRUE) = TRUE
              AND oc.condominio_id::text = trim(p_condominio_id)
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.operador_pode_acessar_condominio(p_condominio_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.operador_pode_acessar_condominio(p_condominio_id::text);
$$;

-- Revoga execução pública irrestrita e libera apenas para authenticated / service_role
REVOKE ALL ON FUNCTION public.operador_atual_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operador_tem_acesso_global() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operador_pode_gerenciar_operadores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operador_pode_acessar_condominio(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operador_pode_acessar_condominio(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.operador_atual_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operador_tem_acesso_global() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operador_pode_gerenciar_operadores() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operador_pode_acessar_condominio(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operador_pode_acessar_condominio(UUID) TO authenticated, service_role;

COMMIT;
