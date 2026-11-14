-- ============================================================================
-- PORTTOHUB PRO — 00_DIAGNOSTICO_ORIGEM.sql (100% SOMENTE LEITURA)
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Inspeciona a estrutura completa do seu banco de dados Supabase de ORIGEM
--   (tabelas, colunas, chaves, RLS, políticas, permissões, buckets do Storage,
--   triggers, funções, volume aproximado de registros e integridade de vínculos).
--
-- SEGURANÇA:
--   Este script contém APENAS consultas SELECT (somente leitura).
--   Ele NÃO altera, NÃO apaga e NÃO modifica nenhum dado ou estrutura.
--
-- ONDE EXECUTAR:
--   1. Acesse o painel do Supabase do projeto de ORIGEM.
--   2. No menu esquerdo, clique em "SQL Editor".
--   3. Clique em "+ New query".
--   4. Cole TODO este script e clique no botão "Run" (ou Ctrl+Enter).
--   5. Copie/exporte os resultados de cada bloco e envie para análise antes da
--      migração final de chaves estrangeiras e RLS.
-- ============================================================================

-- 1. LISTA DE TABELAS NO SCHEMA PUBLIC E STATUS DE RLS
SELECT
  n.nspname AS schema_nome,
  c.relname AS tabela_nome,
  c.relrowsecurity AS rls_habilitado,
  c.relforcerowsecurity AS rls_forcado,
  GREATEST(c.reltuples::bigint, 0) AS linhas_estimadas,
  obj_description(c.oid, 'pg_class') AS comentario
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 2. COLUNAS DE TODAS AS TABELAS DO SCHEMA PUBLIC (NOME, TIPO, NULO, DEFAULT)
SELECT
  table_schema,
  table_name,
  ordinal_position AS pos,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. TABELAS COM vs SEM A COLUNA condominio_id (E QUAL O TIPO DELA)
SELECT
  t.table_name,
  CASE WHEN c.column_name IS NOT NULL THEN 'SIM' ELSE 'NAO' END AS possui_condominio_id,
  COALESCE(c.data_type || ' (' || c.udt_name || ')', '-') AS tipo_condominio_id,
  COALESCE(c.is_nullable, '-') AS aceita_nulo
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
  ON c.table_schema = t.table_schema
 AND c.table_name = t.table_name
 AND c.column_name = 'condominio_id'
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY possui_condominio_id DESC, t.table_name;

-- 4. CHAVES PRIMARIAS, ESTRANGEIRAS E CONSTRAINTS EXISTENTES
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS tabela_referenciada,
  ccu.column_name AS coluna_referenciada,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
 AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 5. INDICES EXISTENTES NO SCHEMA PUBLIC
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 6. POLITICAS RLS EXISTENTES (DESTAQUE PARA POLITICAS PERMISSIVAS)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS expressao_using,
  with_check AS expressao_with_check,
  CASE
    WHEN COALESCE(qual, '') IN ('true', '(true)')
      OR COALESCE(with_check, '') IN ('true', '(true)')
    THEN 'ALERTA_PERMISSIVA_TRUE'
    ELSE 'OK_OU_PERSONALIZADA'
  END AS diagnostico_seguranca
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 7. BUCKETS DO SUPABASE STORAGE (PUBLICO vs PRIVADO)
SELECT
  id,
  name,
  public AS bucket_publico,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
FROM storage.buckets
ORDER BY name;

-- 8. GRANTS / PERMISSOES EM TABELAS, SEQUENCES E FUNCOES PARA anon / authenticated
SELECT
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
GROUP BY table_schema, table_name, grantee
ORDER BY table_name, grantee;

-- 9. FUNCOES E TRIGGERS EXISTENTES RELACIONADOS A AUTH, OPERADORES OU CONDOMINIOS
SELECT
  n.nspname AS schema_nome,
  p.proname AS funcao_nome,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

SELECT
  event_object_schema AS schema_tabela,
  event_object_table AS tabela,
  trigger_name,
  event_manipulation AS evento,
  action_timing AS momento,
  action_statement AS acao
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 10. RESUMO DOS CONDOMINIOS E OPERADORES NA ORIGEM (SEM EXPOR SENHAS)
SELECT
  id,
  nome,
  ativo,
  created_at
FROM public.condominios
ORDER BY nome;

SELECT
  id,
  nome,
  login,
  email,
  funcao,
  perfil,
  nivel_acesso,
  condominio_id,
  ativo,
  CASE WHEN senha IS NOT NULL AND length(trim(senha)) > 0 THEN 'POSSUI_SENHA_LEGADA' ELSE 'SEM_SENHA_LEGADA' END AS status_senha_legada
FROM public.operadores
ORDER BY nivel_acesso NULLS LAST, nome;

-- 11. CONTAGEM DE USUARIOS NO SUPABASE AUTH (auth.users) vs OPERADORES
SELECT
  COUNT(*) AS total_auth_users,
  COUNT(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS email_confirmado
FROM auth.users;

-- 12. VERIFICACAO DE REGISTROS ORFAOS OU NULOS DE condominio_id EM TABELAS PRINCIPAIS
SELECT 'operadores' AS tabela, COUNT(*) AS total, COUNT(*) FILTER (WHERE condominio_id IS NULL OR trim(condominio_id::text) = '' OR lower(condominio_id::text) IN ('todos', 'global')) AS sem_condominio_unico FROM public.operadores
UNION ALL
SELECT 'moradores', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.moradores
UNION ALL
SELECT 'encomendas_itens', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.encomendas_itens
UNION ALL
SELECT 'lotes_re', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.lotes_re
UNION ALL
SELECT 'custodia', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.custodia
UNION ALL
SELECT 'chaves', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.chaves
UNION ALL
SELECT 'prestadores', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.prestadores
UNION ALL
SELECT 'prestadores_acessos', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.prestadores_acessos
UNION ALL
SELECT 'ocorrencias', COUNT(*), COUNT(*) FILTER (WHERE condominio_id IS NULL) FROM public.ocorrencias;
