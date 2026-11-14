-- ============================================================================
-- PORTTOHUB PRO — 09_VALIDACAO_SEGURANCA.sql (100% SOMENTE LEITURA)
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Audita o banco de DESTINO após a aplicação dos scripts 02 a 08 para provar
--   que não restou nenhuma política permissiva USING (true), nenhum bucket
--   público indevido, nenhum acesso anônimo aberto e nenhum operador sem vínculo.
--
-- ONDE EXECUTAR:
--   Supabase Dashboard do DESTINO -> SQL Editor -> New query -> Run.
-- ============================================================================

-- 1. GARANTE QUE NAO EXISTA NENHUMA POLITICA USING (true) / WITH CHECK (true)
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (
    COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
  )
ORDER BY schemaname, tablename;

-- 2. GARANTE QUE TODAS AS TABELAS PUBLIC ESTAO COM RLS ATIVO
SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_ativo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = FALSE
ORDER BY c.relname;

-- 3. GARANTE QUE O ROLE anon NAO POSSUI MAIS SELECT/INSERT/UPDATE/DELETE INDEVIDO
SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;

-- 4. CONFERE QUE O BUCKET 'encomendas' ESTA PRIVADO (bucket_publico = false)
SELECT id, name, public AS bucket_publico, file_size_limit
FROM storage.buckets
WHERE id = 'encomendas';

-- 5. CONFERE QUEM POSSUI acesso_global_condominios = TRUE
SELECT id, nome, login, email, nivel_acesso, perfil, acesso_global_condominios, ativo
FROM public.operadores
WHERE acesso_global_condominios = TRUE;

-- 6. CONFERE OPERADORES AINDA SEM auth_user_id (devem ser 0 antes do go-live final)
SELECT id, nome, login, email, condominio_id, ativo
FROM public.operadores
WHERE auth_user_id IS NULL AND COALESCE(ativo, TRUE) = TRUE;
