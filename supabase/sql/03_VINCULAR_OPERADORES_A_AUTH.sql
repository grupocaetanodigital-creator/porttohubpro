-- ============================================================================
-- PORTTOHUB PRO — 03_VINCULAR_OPERADORES_A_AUTH.sql
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   1. Em bancos já populados: vincula automaticamente operadores existentes ao
--      auth.users correspondente pelo e-mail.
--   2. Em bancos NOVOS DO ZERO: cria (se ainda não houver) o 1º Condomínio, sua
--      configuração inicial e cadastra/promove o 1º Administrador Geral já
--      vinculado ao Supabase Auth e com acesso_global_condominios = TRUE.
--
-- PRE-REQUISITO OBRIGATORIO ANTES DE RODAR ESTE SCRIPT:
--   No painel do Supabase -> menu esquerdo "Authentication" -> "Users" ->
--   clique em "Add user" -> "Create new user":
--     - Informe o e-mail real do Administrador Geral e uma senha forte.
--     - Deixe marcada a opção "Auto Confirm User".
--   Depois, substitua 'SEU_EMAIL_ADMIN_REAL@DOMINIO.COM' logo abaixo antes de Run.
-- ============================================================================

BEGIN;

-- 1. Vínculo automático por e-mail para operadores que já existam na tabela
UPDATE public.operadores o
SET
  auth_user_id = u.id,
  email = lower(trim(u.email)),
  migrado_auth_em = COALESCE(o.migrado_auth_em, NOW()),
  updated_at = NOW()
FROM auth.users u
WHERE o.auth_user_id IS NULL
  AND lower(trim(u.email)) = lower(trim(COALESCE(NULLIF(o.email, ''), CASE WHEN o.login LIKE '%@%' THEN o.login ELSE NULL END)));

-- 2. Bootstrap explícito do 1º Condomínio + 1º Administrador Geral
DO $$
DECLARE
  -- >>> EDITE ESTES 3 CAMPOS ANTES DE EXECUTAR <<<
  v_email_admin TEXT := 'SEU_EMAIL_ADMIN_REAL@DOMINIO.COM';
  v_nome_admin TEXT := 'Administrador Geral';
  v_nome_condominio TEXT := 'Condomínio Principal';

  v_email_norm TEXT := lower(trim(v_email_admin));
  v_auth_id UUID;
  v_condo_id UUID;
  v_operador_id UUID;
BEGIN
  IF v_email_norm = '' OR v_email_norm = 'seu_email_admin_real@dominio.com' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.operadores
      WHERE auth_user_id IS NOT NULL
        AND COALESCE(acesso_global_condominios, FALSE) = TRUE
        AND COALESCE(ativo, TRUE) = TRUE
    ) THEN
      RAISE EXCEPTION 'ACAO OBRIGATORIA: Crie o usuario do Administrador em Authentication -> Users e substitua SEU_EMAIL_ADMIN_REAL@DOMINIO.COM na variavel v_email_admin antes de executar o passo 03.';
    END IF;
    RETURN;
  END IF;

  SELECT id
  INTO v_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_email_norm
  LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Usuario "%" nao encontrado em auth.users. Acesse Authentication -> Users -> Add user, crie o usuario com este e-mail (Auto Confirm User marcado) e rode este script novamente.', v_email_norm;
  END IF;

  -- Garante ao menos 1 condomínio inicial se o banco estiver zerado
  SELECT id
  INTO v_condo_id
  FROM public.condominios
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_condo_id IS NULL THEN
    INSERT INTO public.condominios (nome, tipo_estrutura, ativo)
    VALUES (COALESCE(NULLIF(trim(v_nome_condominio), ''), 'Condomínio Principal'), 'Blocos e Apartamentos', TRUE)
    RETURNING id INTO v_condo_id;
  END IF;

  -- Garante configuração padrão para o 1º condomínio
  IF NOT EXISTS (SELECT 1 FROM public.configuracoes WHERE condominio_id = v_condo_id) THEN
    INSERT INTO public.configuracoes (condominio_id)
    VALUES (v_condo_id);
  END IF;

  -- Localiza operador existente pelo auth_user_id, email ou login
  SELECT id
  INTO v_operador_id
  FROM public.operadores
  WHERE auth_user_id = v_auth_id
     OR lower(trim(COALESCE(email, ''))) = v_email_norm
     OR lower(trim(COALESCE(login, ''))) = v_email_norm
  LIMIT 1;

  IF v_operador_id IS NULL THEN
    INSERT INTO public.operadores (
      condominio_id,
      auth_user_id,
      nome,
      login,
      email,
      funcao,
      cargo,
      perfil,
      nivel_acesso,
      nivel_acesso_custom_id,
      acesso_global_condominios,
      exigir_troca_senha,
      migrado_auth_em,
      ativo
    )
    VALUES (
      v_condo_id,
      v_auth_id,
      COALESCE(NULLIF(trim(v_nome_admin), ''), 'Administrador Geral'),
      v_email_norm,
      v_email_norm,
      'Administrador Geral',
      'Administrador Geral',
      'admin_geral',
      0,
      'nivel_0',
      TRUE,
      FALSE,
      NOW(),
      TRUE
    );
  ELSE
    UPDATE public.operadores
    SET
      condominio_id = COALESCE(condominio_id, v_condo_id),
      auth_user_id = v_auth_id,
      email = v_email_norm,
      acesso_global_condominios = TRUE,
      ativo = TRUE,
      migrado_auth_em = COALESCE(migrado_auth_em, NOW()),
      updated_at = NOW()
    WHERE id = v_operador_id;
  END IF;
END $$;

COMMIT;

-- 3. Conferência final (somente leitura)
SELECT
  o.id AS operador_id,
  o.nome,
  o.email,
  o.perfil,
  o.nivel_acesso,
  o.acesso_global_condominios,
  o.condominio_id,
  o.auth_user_id,
  o.ativo
FROM public.operadores o
ORDER BY o.acesso_global_condominios DESC, o.nome;
