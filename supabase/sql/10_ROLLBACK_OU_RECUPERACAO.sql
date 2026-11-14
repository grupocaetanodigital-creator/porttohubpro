-- ============================================================================
-- PORTTOHUB PRO — 10_ROLLBACK_OU_RECUPERACAO.sql
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Procedimento controlado de contingência caso um operador específico fique
--   temporariamente sem acesso após ativação do RLS, ou caso seja necessário
--   revisar vínculos rapidamente sem abrir o banco para USING (true).
--
-- REGRA DE OURO:
--   NUNCA restaure USING (true) nem reative login com senha em texto puro.
--   Use os comandos pontuais abaixo para diagnosticar e corrigir o vínculo do
--   operador específico.
-- ============================================================================

-- 1. DIAGNOSTICAR UM OPERADOR PELO E-MAIL
SELECT
  o.id AS operador_id,
  o.nome,
  o.email,
  o.auth_user_id,
  o.condominio_id,
  o.acesso_global_condominios,
  o.ativo,
  u.id AS auth_id_real,
  u.email_confirmed_at
FROM public.operadores o
LEFT JOIN auth.users u ON lower(u.email) = lower(o.email)
WHERE lower(o.email) = lower('EMAIL_DO_OPERADOR@DOMINIO.COM');

-- 2. CORRIGIR VINCULO auth_user_id CASO O USUARIO TENHA SIDO RECRIADO NO AUTH
-- UPDATE public.operadores o
-- SET auth_user_id = u.id, ativo = TRUE, updated_at = NOW()
-- FROM auth.users u
-- WHERE lower(o.email) = lower(u.email)
--   AND lower(u.email) = lower('EMAIL_DO_OPERADOR@DOMINIO.COM');

-- 3. CONCEDER CONDOMINIO A UM SUPERVISOR NA TABELA DE VINCULOS
-- INSERT INTO public.operador_condominios (operador_id, condominio_id, papel, principal, ativo)
-- VALUES ('UUID_DO_OPERADOR', 'UUID_DO_CONDOMINIO', 'supervisor', FALSE, TRUE)
-- ON CONFLICT (operador_id, condominio_id) DO UPDATE SET ativo = TRUE, updated_at = NOW();

-- 4. CONTINGENCIA PARA STORAGE (apenas se imagens antigas exigirem inspeção temporária
--    via Signed URLs — nunca reabra para anon; use createSignedUrl no aplicativo).
