-- ============================================================================
-- PORTTOHUB PRO — 01_DIAGNOSTICO_DESTINO.sql (100% SOMENTE LEITURA)
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Inspeciona o banco de dados Supabase de DESTINO (onde o PorttoHub Pro vai
--   operar em produção) para verificar quais tabelas já existem, tipos exatos
--   de colunas, políticas RLS atuais, buckets do Storage, usuários Auth e
--   possíveis dados/inconsistências antes de aplicar qualquer migração.
--
-- SEGURANÇA:
--   Este script contém APENAS consultas SELECT (somente leitura).
--   Ele NÃO altera, NÃO apaga e NÃO cria nada no banco.
--
-- ONDE EXECUTAR:
--   1. Acesse o painel do Supabase do projeto de DESTINO (novo/oficial).
--   2. No menu esquerdo, clique em "SQL Editor".
--   3. Clique em "+ New query".
--   4. Cole TODO este script e clique em "Run".
--   5. Envie o resultado antes de executar os scripts de alteração final de FK/RLS.
-- ============================================================================

-- 1. TABELAS EXISTENTES NO SCHEMA PUBLIC, RLS E VOLUME ESTIMADO
SELECT
  n.nspname AS schema_nome,
  c.relname AS tabela_nome,
  c.relrowsecurity AS rls_habilitado,
  c.relforcerowsecurity AS rls_forcado,
  GREATEST(c.reltuples::bigint, 0) AS linhas_estimadas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 2. COLUNAS E TIPOS EXATOS NO DESTINO (ESSENCIAL PARA CONFIRMAR UUID vs TEXT)
SELECT
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

-- 3. CONFERENCIA DA COLUNA condominio_id E DE TABELAS DE AUTORIZACAO
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

-- 4. CONFERIR SE TABELAS NOVAS DE SEGURANCA JA EXISTEM (operador_condominios, etc.)
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('operadores', 'operador_condominios', 'condominios', 'encomendas_itens', 'moradores')
ORDER BY tablename;

-- 5. VERIFICAR COLUNAS CRITICAS NA TABELA operadores (auth_user_id, email, acesso_global_condominios)
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'operadores'
ORDER BY ordinal_position;

-- 6. CHAVES PRIMARIAS E ESTRANGEIRAS NO DESTINO
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS tabela_referenciada,
  ccu.column_name AS coluna_referenciada
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 7. INDICES NO DESTINO
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 8. POLITICAS RLS EXISTENTES NO DESTINO (PUBLIC E STORAGE)
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
    ELSE 'RESTRITIVA_OU_PERSONALIZADA'
  END AS diagnostico_seguranca
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 9. BUCKETS E OBJETOS NO STORAGE DO DESTINO
SELECT
  id,
  name,
  public AS bucket_publico,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
ORDER BY name;

SELECT
  bucket_id,
  COUNT(*) AS total_arquivos,
  COUNT(*) FILTER (WHERE name LIKE 'condominios/%') AS arquivos_padrao_novo,
  COUNT(*) FILTER (WHERE name NOT LIKE 'condominios/%') AS arquivos_padrao_antigo
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

-- 10. GRANTS / PERMISSOES NO DESTINO PARA anon / authenticated / service_role
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 11. TRIGGERS E FUNCOES NO DESTINO
SELECT
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
  action_timing AS momento
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 12. USUARIOS DO SUPABASE AUTH vs OPERADORES NO DESTINO (SEM EXPOR SENHAS)
SELECT
  id AS auth_user_id,
  email,
  created_at,
  last_sign_in_at,
  email_confirmed_at IS NOT NULL AS email_confirmado
FROM auth.users
ORDER BY created_at DESC;

SELECT
  id,
  nome,
  login,
  funcao,
  perfil,
  nivel_acesso,
  condominio_id,
  ativo,
  created_at
FROM public.operadores
ORDER BY nome;

-- 13. CONDOMINIOS NO DESTINO E CONFERENCIA DE INTEGRIDADE DE ENCOMENDAS/MORADORES
SELECT id, nome, ativo, created_at FROM public.condominios ORDER BY nome;

SELECT
  'moradores_sem_condominio_valido' AS verificacao,
  COUNT(*) AS quantidade
FROM public.moradores m
LEFT JOIN public.condominios c ON c.id::text = m.condominio_id::text
WHERE m.condominio_id IS NULL OR c.id IS NULL
UNION ALL
SELECT
  'encomendas_sem_condominio_valido',
  COUNT(*)
FROM public.encomendas_itens e
LEFT JOIN public.condominios c ON c.id::text = e.condominio_id::text
WHERE e.condominio_id IS NULL OR c.id IS NULL;
