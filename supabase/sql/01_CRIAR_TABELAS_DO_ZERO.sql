-- ============================================================================
-- PORTTOHUB PRO — 01_CRIAR_TABELAS_DO_ZERO.sql
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ:
--   Cria do zero TODAS as 35 tabelas canônicas do PorttoHub Pro no Supabase,
--   extensões necessárias (uuid-ossp, pgcrypto), índices base e publicação
--   supabase_realtime.
--
-- SEGURANCA & IDEMPOTENCIA:
--   - 100% seguro para banco NOVO/VAZIO (0 tabelas) e para banco já existente.
--   - ZERO comandos destrutivos (sem DROP TABLE, sem TRUNCATE).
--   - ZERO políticas permissivas USING (true) e ZERO permissões para anon.
--     (O isolamento multi-tenant / RLS e Storage privado serão aplicados nos
--      passos 05, 06 e 07 após a criação do 1º Admin Geral no passo 03.)
--
-- ONDE EXECUTAR:
--   Supabase Dashboard -> SQL Editor -> + New query -> Colar tudo -> Run.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. condominios
CREATE TABLE IF NOT EXISTS public.condominios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT,
  cnpj TEXT,
  cidade TEXT DEFAULT 'São Paulo',
  uf TEXT DEFAULT 'SP',
  telefone_portaria TEXT,
  sindico_nome TEXT,
  sindico_whatsapp TEXT,
  whatsapp_grupo_url TEXT,
  whatsapp_grupo_portaria TEXT,
  escala_plantao TEXT DEFAULT '06_18',
  horario_diurno_inicio TEXT DEFAULT '06:00',
  horario_noturno_inicio TEXT DEFAULT '18:00',
  intervalo_ronda INTEGER DEFAULT 15,
  tipo_estrutura TEXT DEFAULT 'casas',
  tipo TEXT DEFAULT 'residencial',
  qtd_blocos INTEGER DEFAULT 1,
  unidades_por_bloco INTEGER DEFAULT 117,
  nomes_blocos TEXT,
  zeros_esquerda BOOLEAN DEFAULT TRUE,
  locais_armazenamento JSONB DEFAULT '["Bancada Principal", "Chão / Caixas Grandes"]'::jsonb,
  turnos_plantao JSONB DEFAULT '{}'::jsonb,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. configuracoes
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  niveis_acesso JSONB DEFAULT '[]'::jsonb,
  feature_flags JSONB DEFAULT '{}'::jsonb,
  whatsapp_modulos JSONB DEFAULT '{}'::jsonb,
  locais_armazenamento JSONB DEFAULT '["Bancada Principal", "Chão / Caixas Grandes"]'::jsonb,
  setores_ronda JSONB DEFAULT '[]'::jsonb,
  turnos_plantao JSONB DEFAULT '{}'::jsonb,
  dados_tenant JSONB DEFAULT '{}'::jsonb,
  mod01_cadastros_base BOOLEAN DEFAULT TRUE,
  mod02_gestao_encomendas BOOLEAN DEFAULT TRUE,
  mod03_custodia_itens BOOLEAN DEFAULT TRUE,
  mod04_materiais_posto BOOLEAN DEFAULT TRUE,
  mod05_quadro_chaves BOOLEAN DEFAULT TRUE,
  mod06_gestao_manutencao BOOLEAN DEFAULT TRUE,
  mod07_gestao_ronda BOOLEAN DEFAULT TRUE,
  mod08_livro_ocorrencias BOOLEAN DEFAULT TRUE,
  mod09_passagem_posto BOOLEAN DEFAULT TRUE,
  mod10_prestadores_servico BOOLEAN DEFAULT TRUE,
  mod11_bancada_conferencia BOOLEAN DEFAULT TRUE,
  mod12_historico_absoluto BOOLEAN DEFAULT TRUE,
  mod_portal_sindico BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. operadores
CREATE TABLE IF NOT EXISTS public.operadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  auth_user_id UUID,
  nome TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  email TEXT,
  senha TEXT,
  funcao TEXT DEFAULT 'Porteiro',
  cargo TEXT DEFAULT 'Porteiro',
  perfil TEXT DEFAULT 'operador',
  telefone TEXT,
  unidade TEXT,
  turno TEXT DEFAULT 'Diurno',
  turno_padrao TEXT DEFAULT 'Diurno',
  nivel_acesso INTEGER DEFAULT 3,
  nivel_acesso_custom_id TEXT DEFAULT 'nivel_3',
  permissoes JSONB DEFAULT '{}'::jsonb,
  foto_url TEXT,
  acesso_global_condominios BOOLEAN NOT NULL DEFAULT FALSE,
  exigir_troca_senha BOOLEAN NOT NULL DEFAULT FALSE,
  migrado_auth_em TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operadores_permissoes ON public.operadores USING gin (permissoes);

-- 4. operador_condominios (vínculos explícitos multi-condomínio)
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

-- 5. moradores
CREATE TABLE IF NOT EXISTS public.moradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT NOT NULL,
  bloco TEXT,
  unidade TEXT NOT NULL DEFAULT '',
  telefone TEXT,
  email TEXT,
  cpf TEXT,
  rg TEXT,
  documento TEXT,
  tipo TEXT DEFAULT 'Morador',
  foto_url TEXT,
  foto TEXT,
  tag_rfid TEXT,
  codigo_acesso TEXT,
  status_acesso TEXT DEFAULT 'liberado',
  veiculo_placa TEXT,
  veiculo_modelo TEXT,
  veiculo_cor TEXT,
  contato_emergencia TEXT,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moradores_condo_unid ON public.moradores(condominio_id, unidade, bloco);
CREATE INDEX IF NOT EXISTS idx_moradores_cpf ON public.moradores(cpf);
CREATE INDEX IF NOT EXISTS idx_moradores_tag_rfid ON public.moradores(tag_rfid);
CREATE INDEX IF NOT EXISTS idx_moradores_veiculo_placa ON public.moradores(veiculo_placa);

-- 6. entregadores
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT NOT NULL,
  documento TEXT,
  empresa TEXT,
  telefone TEXT,
  foto_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. lotes_re
CREATE TABLE IF NOT EXISTS public.lotes_re (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_re TEXT NOT NULL,
  condominio_id UUID,
  entregador_id UUID,
  qtd_declarada INTEGER DEFAULT 1,
  qtd_triada INTEGER DEFAULT 0,
  status TEXT DEFAULT 'aguardando_triagem',
  operador_id TEXT,
  operador_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lotes_re_condo_codigo ON public.lotes_re(condominio_id, codigo_re);

-- 8. encomendas_itens
CREATE TABLE IF NOT EXISTS public.encomendas_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_re_id UUID,
  condominio_id UUID,
  bloco TEXT,
  unidade TEXT NOT NULL DEFAULT '',
  morador_id UUID,
  destinatario TEXT,
  codigo_barras TEXT,
  codigo_rastreio TEXT,
  foto_etiqueta TEXT,
  foto_etiqueta_url TEXT,
  observacoes TEXT,
  local_armazenamento TEXT DEFAULT 'Bancada Principal',
  status TEXT DEFAULT 'retido',
  retirado_por TEXT,
  documento_retirante TEXT,
  parentesco_vinculo TEXT,
  foto_retirada_url TEXT,
  foto_comprovante_url TEXT,
  assinatura_url TEXT,
  data_recebimento TIMESTAMPTZ DEFAULT NOW(),
  data_retirada TIMESTAMPTZ,
  data_hora_retirada TIMESTAMPTZ,
  operador_entrada TEXT,
  operador_baixa TEXT,
  operador_baixa_id TEXT,
  operador_baixa_nome TEXT,
  operation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encomendas_itens_status ON public.encomendas_itens(condominio_id, status);
CREATE INDEX IF NOT EXISTS idx_encomendas_itens_unidade ON public.encomendas_itens(condominio_id, unidade);
CREATE INDEX IF NOT EXISTS idx_encomendas_itens_codigo ON public.encomendas_itens(codigo_barras);

-- 9. locais_armazenamento
CREATE TABLE IF NOT EXISTS public.locais_armazenamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT NOT NULL,
  codigo TEXT,
  categoria TEXT,
  capacidade INTEGER,
  descricao TEXT,
  observacao TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. custodia
CREATE TABLE IF NOT EXISTS public.custodia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  codigo TEXT,
  codigo_custodia TEXT,
  descricao TEXT,
  item_descricao TEXT,
  categoria TEXT,
  fluxo TEXT DEFAULT 'ENTRADA',
  unidade TEXT,
  bloco TEXT,
  morador_id UUID,
  origem TEXT,
  origem_tipo TEXT DEFAULT 'Morador',
  origem_unidade TEXT,
  origem_bloco TEXT,
  origem_nome_doc TEXT,
  origem_whats TEXT,
  destino TEXT,
  destino_tipo TEXT DEFAULT 'Morador',
  destino_unidade TEXT,
  destino_bloco TEXT,
  destino_nome_doc TEXT,
  destino_whats TEXT,
  deixado_por TEXT,
  depositante_nome TEXT,
  documento_depositante TEXT,
  telefone_depositante TEXT,
  recebedor_nome TEXT,
  recebedor_doc TEXT,
  retirado_por TEXT,
  local_armazenamento TEXT DEFAULT 'Bancada Principal',
  foto_entrada_url TEXT,
  foto_saida_url TEXT,
  foto_url TEXT,
  status TEXT DEFAULT 'Retido',
  operador_entrada TEXT,
  operador_saida TEXT,
  recebido_por_operador_id TEXT,
  recebido_por_operador_nome TEXT,
  entregue_por_operador_id TEXT,
  entregue_por_operador_nome TEXT,
  tipo_baixa TEXT DEFAULT 'destinatario',
  assinatura_url TEXT,
  data_recebimento TIMESTAMPTZ DEFAULT NOW(),
  data_retirada TIMESTAMPTZ,
  data_hora_entrada TIMESTAMPTZ DEFAULT NOW(),
  data_hora_saida TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custodia_condo_status_created ON public.custodia(condominio_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custodia_codigo ON public.custodia(codigo_custodia);

-- 11. materiais_posto
CREATE TABLE IF NOT EXISTS public.materiais_posto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT,
  item TEXT,
  categoria TEXT DEFAULT 'Equipamentos',
  codigo_patrimonio TEXT,
  estado TEXT DEFAULT 'Perfeito',
  estado_conservacao TEXT DEFAULT 'Perfeito',
  quantidade_total INTEGER DEFAULT 1,
  quantidade_disponivel INTEGER DEFAULT 1,
  localizacao TEXT,
  observacao TEXT,
  observacoes TEXT,
  observacao_avaria TEXT,
  foto_url TEXT,
  foto_avaria_url TEXT,
  operador_atualizacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. chaves
CREATE TABLE IF NOT EXISTS public.chaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  codigo_chave TEXT,
  nome_chave TEXT,
  numero TEXT,
  identificacao TEXT,
  identificacao_sala TEXT,
  setor TEXT,
  localizacao TEXT,
  bloco TEXT,
  unidade TEXT,
  tempo_limite_horas INTEGER DEFAULT 2,
  status TEXT DEFAULT 'Disponível',
  responsavel_atual TEXT,
  telefone_responsavel TEXT,
  retirada_em TIMESTAMPTZ,
  posse_atual TEXT,
  contato_posse TEXT,
  retirado_as TIMESTAMPTZ,
  quantidade INTEGER DEFAULT 1,
  qr_code TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. movimentacao_chaves
CREATE TABLE IF NOT EXISTS public.movimentacao_chaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  chave_id UUID,
  retirante_nome TEXT,
  nome_retirante TEXT,
  retirado_por TEXT,
  retirante_doc TEXT,
  documento_retirante TEXT,
  retirante_telefone TEXT,
  telefone_retirante TEXT,
  retirante_tipo TEXT DEFAULT 'Morador',
  tipo_retirante TEXT DEFAULT 'Morador',
  empresa_ou_apto TEXT,
  empresa_retirante TEXT,
  empresa TEXT,
  unidade_retirante TEXT,
  bloco_retirante TEXT,
  motivo TEXT,
  foto_retirada_url TEXT,
  foto_devolucao_url TEXT,
  data_hora_retirada TIMESTAMPTZ DEFAULT NOW(),
  data_saida TIMESTAMPTZ DEFAULT NOW(),
  previsao_devolucao TIMESTAMPTZ,
  data_hora_devolucao TIMESTAMPTZ,
  data_devolucao TIMESTAMPTZ,
  status TEXT DEFAULT 'Em Andamento',
  operador_retirada TEXT,
  operador_retirada_id TEXT,
  operador_retirada_nome TEXT,
  operador_saida_id TEXT,
  operador_saida_nome TEXT,
  operador_devolucao TEXT,
  operador_devolucao_id TEXT,
  operador_devolucao_nome TEXT,
  observacoes TEXT,
  observacoes_retirada TEXT,
  observacoes_devolucao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. checklist_manutencao
CREATE TABLE IF NOT EXISTS public.checklist_manutencao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  titulo TEXT NOT NULL,
  item_rotina TEXT,
  descricao TEXT,
  frequencia TEXT DEFAULT 'Diário',
  periodicidade TEXT DEFAULT 'Diário',
  categoria TEXT DEFAULT 'Geral',
  setor TEXT,
  prioridade TEXT DEFAULT 'Média',
  localizacao TEXT,
  status TEXT DEFAULT 'Pendente',
  itens_snapshot JSONB DEFAULT '[]'::jsonb,
  observacao_execucao TEXT,
  observacoes TEXT,
  foto_url TEXT,
  foto_antes_url TEXT,
  operador_id TEXT,
  operador_nome TEXT,
  operador_criacao TEXT,
  operador_conclusao TEXT,
  data_execucao TIMESTAMPTZ,
  data_conclusao TIMESTAMPTZ,
  ultima_verificacao TIMESTAMPTZ,
  proxima_verificacao TIMESTAMPTZ,
  responsavel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. chamados_manutencao
CREATE TABLE IF NOT EXISTS public.chamados_manutencao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT DEFAULT 'Geral',
  setor TEXT,
  prioridade TEXT DEFAULT 'Média',
  local TEXT,
  localizacao TEXT,
  local_especifico TEXT,
  bloco TEXT,
  unidade TEXT,
  status TEXT DEFAULT 'Aberto',
  solicitante TEXT,
  solicitante_nome TEXT,
  solicitante_tipo TEXT,
  foto_antes_url TEXT,
  foto_depois_url TEXT,
  observacoes TEXT,
  observacao_conclusao TEXT,
  observacoes_conclusao TEXT,
  custo_estimado NUMERIC(10,2),
  custo_real NUMERIC(10,2),
  operador_abertura TEXT,
  operador_abertura_id TEXT,
  operador_abertura_nome TEXT,
  operador_conclusao TEXT,
  operador_conclusao_id TEXT,
  operador_conclusao_nome TEXT,
  data_abertura TIMESTAMPTZ DEFAULT NOW(),
  data_conclusao TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. rondas_setores
CREATE TABLE IF NOT EXISTS public.rondas_setores (
  id TEXT PRIMARY KEY,
  condominio_id UUID,
  codigo TEXT,
  nome TEXT,
  titulo TEXT,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  itens JSONB DEFAULT '[]'::jsonb,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. rondas_pontos
CREATE TABLE IF NOT EXISTS public.rondas_pontos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT,
  nome_ponto TEXT,
  codigo_tag TEXT,
  codigo_qr TEXT,
  codigo_qrcode TEXT,
  setor TEXT,
  setor_id TEXT DEFAULT 'SETOR_A',
  ordem INTEGER DEFAULT 0,
  localizacao TEXT,
  localizacao_descricao TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  toleranciaraio NUMERIC DEFAULT 50,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. rondas_execucao
CREATE TABLE IF NOT EXISTS public.rondas_execucao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  operador_id TEXT,
  operador_nome TEXT,
  turno TEXT,
  status TEXT DEFAULT 'Em Andamento',
  data_inicio TIMESTAMPTZ DEFAULT NOW(),
  data_fim TIMESTAMPTZ,
  duracao_segundos INTEGER,
  total_pontos INTEGER DEFAULT 0,
  pontos_totais INTEGER DEFAULT 0,
  pontos_conferidos INTEGER DEFAULT 0,
  pontos_lidos INTEGER DEFAULT 0,
  resumo_detalhado JSONB,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. rondas_registros
CREATE TABLE IF NOT EXISTS public.rondas_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  ronda_id UUID,
  ronda_execucao_id UUID,
  ponto_id UUID,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  latitude NUMERIC,
  longitude NUMERIC,
  foto_url TEXT,
  foto_evidencia_url TEXT,
  observacao TEXT,
  status TEXT DEFAULT 'conforme',
  status_ponto TEXT DEFAULT 'conforme',
  checklist_respostas JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. ocorrencias
CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT DEFAULT 'Geral',
  gravidade TEXT DEFAULT 'Média',
  prioridade TEXT DEFAULT 'Média',
  status TEXT DEFAULT 'Aberta',
  bloco TEXT,
  unidade TEXT,
  unidade_bloco TEXT,
  foto_url TEXT,
  fotos JSONB DEFAULT '[]'::jsonb,
  operador_id TEXT,
  operador_nome TEXT,
  operador_login TEXT,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  resolucao TEXT,
  data_resolucao TIMESTAMPTZ,
  operador_resolucao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. passagens_posto
CREATE TABLE IF NOT EXISTS public.passagens_posto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  condominio_nome TEXT,
  codigo TEXT,
  operador_sainte_id TEXT,
  operador_sainte_nome TEXT,
  operador_entrante_id TEXT,
  operador_entrante_nome TEXT,
  operador_sai_id TEXT,
  operador_sai_nome TEXT,
  operador_entra_id TEXT,
  operador_entra_nome TEXT,
  turno_sai TEXT,
  turno_entra TEXT,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  observacoes TEXT,
  divergencia TEXT,
  pendencias TEXT,
  relatorio_texto TEXT,
  checklist_resumo JSONB DEFAULT '{}'::jsonb,
  materiais_conferidos JSONB DEFAULT '[]'::jsonb,
  encomendas_pendentes JSONB DEFAULT '[]'::jsonb,
  chaves_pendentes JSONB DEFAULT '[]'::jsonb,
  ocorrencias_plantao TEXT,
  ocorrencias_resumo TEXT,
  assinatura_sainte TEXT,
  assinatura_entrante TEXT,
  status TEXT DEFAULT 'Finalizada',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. prestadores
CREATE TABLE IF NOT EXISTS public.prestadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome TEXT,
  nome_profissional TEXT,
  nome_completo TEXT,
  documento TEXT,
  tipo_documento TEXT DEFAULT 'RG',
  empresa TEXT,
  funcao TEXT,
  telefone TEXT,
  placa_veiculo TEXT,
  modelo_veiculo TEXT,
  foto_rosto TEXT,
  foto_url TEXT,
  foto_documento TEXT,
  tipo_servico TEXT,
  atende_condominio BOOLEAN DEFAULT FALSE,
  bloco TEXT,
  unidade TEXT,
  perfil_acesso TEXT DEFAULT 'prestador_unidade',
  parentesco_vinculo TEXT,
  tipo_validade TEXT DEFAULT 'hoje',
  data_validade_inicio TIMESTAMPTZ DEFAULT NOW(),
  data_validade_fim TIMESTAMPTZ,
  tempo_maximo_minutos INTEGER DEFAULT 240,
  limite_permanencia_ate TIMESTAMPTZ,
  cracha TEXT,
  cracha_atribuido TEXT,
  status_acesso TEXT DEFAULT 'FORA',
  operador_entrada_nome TEXT,
  operador_saida_nome TEXT,
  data_hora_entrada TIMESTAMPTZ,
  data_hora_saida TIMESTAMPTZ,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. prestadores_acessos
CREATE TABLE IF NOT EXISTS public.prestadores_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  prestador_id UUID,
  perfil_acesso TEXT NOT NULL DEFAULT 'prestador_unidade',
  nome_completo TEXT NOT NULL DEFAULT '',
  documento TEXT,
  empresa TEXT,
  parentesco_vinculo TEXT,
  unidade TEXT,
  bloco TEXT,
  foto_rosto TEXT,
  foto_url TEXT,
  foto_documento TEXT,
  cracha TEXT,
  placa_veiculo TEXT,
  modelo_veiculo TEXT,
  data_hora_entrada TIMESTAMPTZ DEFAULT NOW(),
  tempo_maximo_minutos INTEGER DEFAULT 240,
  limite_permanencia_ate TIMESTAMPTZ,
  data_hora_saida TIMESTAMPTZ,
  status_acesso TEXT DEFAULT 'DENTRO',
  operador_entrada_nome TEXT,
  operador_saida_nome TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. lembretes_portaria
CREATE TABLE IF NOT EXISTS public.lembretes_portaria (
  id TEXT PRIMARY KEY,
  condominio_id UUID,
  unidade_bloco TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Aviso Geral',
  mensagem TEXT NOT NULL,
  remetente_tipo TEXT NOT NULL DEFAULT 'morador',
  remetente_nome TEXT,
  lido BOOLEAN NOT NULL DEFAULT FALSE,
  lido_em TIMESTAMPTZ,
  lido_por_nome TEXT,
  lido_por_id TEXT,
  prioridade TEXT DEFAULT 'normal',
  finalizado BOOLEAN DEFAULT FALSE,
  finalizado_em TIMESTAMPTZ,
  finalizado_por_nome TEXT,
  finalizado_por_id TEXT,
  eh_adm BOOLEAN DEFAULT FALSE,
  data_limite TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. bancada_volumes
CREATE TABLE IF NOT EXISTS public.bancada_volumes (
  id TEXT PRIMARY KEY,
  condominio_id UUID,
  estrutura TEXT DEFAULT '',
  unidade TEXT DEFAULT '',
  volumes INTEGER DEFAULT 1,
  observacao TEXT,
  tipo_volume TEXT DEFAULT 'normal',
  codigo_volume TEXT,
  tipo TEXT,
  local TEXT,
  operador_entrada TEXT,
  morador_identificacao TEXT,
  operador_nome TEXT,
  operador_id TEXT,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 26. bancada_conferencias
CREATE TABLE IF NOT EXISTS public.bancada_conferencias (
  id TEXT PRIMARY KEY,
  condominio_id UUID,
  operador_id TEXT,
  operador_nome TEXT NOT NULL DEFAULT 'Portaria',
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  total_volumes INTEGER DEFAULT 0,
  total_unidades INTEGER DEFAULT 0,
  estruturas_resumo JSONB DEFAULT '{}'::jsonb,
  itens JSONB DEFAULT '[]'::jsonb,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. historico_absoluto
CREATE TABLE IF NOT EXISTS public.historico_absoluto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  descricao TEXT NOT NULL,
  detalhes JSONB,
  operador_id TEXT,
  operador_nome TEXT,
  operador_login TEXT,
  ip TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_condo_data ON public.historico_absoluto(condominio_id, data_hora DESC);

-- 28. templates_whatsapp
CREATE TABLE IF NOT EXISTS public.templates_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  codigo_evento TEXT,
  canal_destino TEXT,
  corpo_texto TEXT,
  tipo TEXT NOT NULL DEFAULT 'geral',
  titulo TEXT,
  conteudo TEXT NOT NULL DEFAULT '',
  variaveis JSONB DEFAULT '[]'::jsonb,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 29. agenda_emergencia
CREATE TABLE IF NOT EXISTS public.agenda_emergencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID,
  nome_descricao TEXT NOT NULL,
  categoria TEXT DEFAULT 'Geral',
  telefone_principal TEXT NOT NULL,
  telefone_whatsapp TEXT,
  exibir_menu_flutuante BOOLEAN DEFAULT TRUE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 30. areas_comuns
CREATE TABLE IF NOT EXISTS public.areas_comuns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  capacidade_maxima INTEGER DEFAULT 50,
  taxa_reserva NUMERIC(10,2) DEFAULT 0,
  taxa_limpeza NUMERIC(10,2) DEFAULT 0,
  valor_caucao NUMERIC(10,2) DEFAULT 0,
  antecedencia_minima_dias INTEGER DEFAULT 1,
  antecedencia_maxima_dias INTEGER DEFAULT 90,
  horario_inicio TEXT DEFAULT '08:00',
  horario_fim TEXT DEFAULT '22:00',
  duracao_slot_minutos INTEGER DEFAULT 60,
  tipo_area TEXT DEFAULT 'churrasqueira',
  intervalo_limpeza_horas INTEGER DEFAULT 2,
  turnos_disponiveis JSONB DEFAULT '["manha", "tarde", "noite", "dia_todo"]'::jsonb,
  dias_funcionamento JSONB DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
  regras TEXT,
  regras_termo TEXT,
  requer_aprovacao BOOLEAN DEFAULT FALSE,
  exige_aprovacao_sindico BOOLEAN DEFAULT FALSE,
  foto_url TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_areas_comuns_condo ON public.areas_comuns(condominio_id);

-- 31. reservas_areas_comuns
CREATE TABLE IF NOT EXISTS public.reservas_areas_comuns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
  area_id UUID REFERENCES public.areas_comuns(id) ON DELETE SET NULL,
  area_nome TEXT,
  morador_id UUID REFERENCES public.moradores(id) ON DELETE SET NULL,
  morador_nome TEXT NOT NULL,
  morador_telefone TEXT,
  unidade TEXT,
  bloco TEXT,
  unidade_bloco TEXT NOT NULL DEFAULT '',
  data_reserva DATE NOT NULL,
  turno TEXT DEFAULT 'dia_todo',
  horario_inicio TEXT,
  horario_fim TEXT,
  tipo_evento TEXT DEFAULT 'Confraternização Familiar',
  qtd_convidados_estimada INTEGER DEFAULT 10,
  status TEXT DEFAULT 'pendente',
  valor_total NUMERIC(10,2) DEFAULT 0,
  pago BOOLEAN DEFAULT FALSE,
  termo_aceito BOOLEAN DEFAULT TRUE,
  data_aceite_termo TIMESTAMPTZ DEFAULT NOW(),
  observacoes TEXT,
  observacoes_solicitante TEXT,
  motivo_recusa TEXT,
  aprovado_por TEXT,
  aprovado_por_nome TEXT,
  aprovado_em TIMESTAMPTZ,
  data_aprovacao TIMESTAMPTZ,
  vistoria_entrada JSONB DEFAULT '{}'::jsonb,
  vistoria_saida JSONB DEFAULT '{}'::jsonb,
  lista_convidados JSONB DEFAULT '[]'::jsonb,
  convidados_lista JSONB DEFAULT '[]'::jsonb,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservas_condo_data ON public.reservas_areas_comuns(condominio_id, data_reserva);

-- 32. pontos_acesso
CREATE TABLE IF NOT EXISTS public.pontos_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'misto',
  direcao TEXT,
  ip_leitora TEXT,
  localizacao TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 33. registros_acesso
CREATE TABLE IF NOT EXISTS public.registros_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'visitante',
  tipo_pessoa TEXT,
  pessoa_id UUID,
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT,
  empresa TEXT,
  unidade TEXT,
  bloco TEXT,
  unidade_bloco TEXT NOT NULL DEFAULT '',
  morador_responsavel TEXT,
  ponto_acesso_id UUID,
  ponto_acesso_nome TEXT,
  ponto_acesso_entrada TEXT DEFAULT 'Portaria Principal (Pedestres)',
  ponto_acesso_saida TEXT,
  direcao TEXT,
  tipo_acesso TEXT,
  credencial_utilizada TEXT,
  veiculo_placa TEXT,
  veiculo_modelo TEXT,
  veiculo_cor TEXT,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  data_hora_entrada TIMESTAMPTZ DEFAULT NOW(),
  data_hora_saida TIMESTAMPTZ,
  status TEXT DEFAULT 'presente',
  foto_registro_url TEXT,
  foto_entrada_url TEXT,
  foto_saida_url TEXT,
  operador_entrada_nome TEXT,
  operador_saida_nome TEXT,
  observacoes TEXT,
  cracha_ou_tag TEXT,
  reserva_area_id UUID,
  passe_qr_id UUID,
  motivo_bloqueio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registros_acesso_condo_status ON public.registros_acesso(condominio_id, status);

-- 34. passes_virtuais_qr
CREATE TABLE IF NOT EXISTS public.passes_virtuais_qr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  token_hash TEXT,
  morador_id UUID,
  morador_nome TEXT NOT NULL,
  morador_telefone TEXT,
  unidade TEXT,
  bloco TEXT,
  unidade_bloco TEXT NOT NULL DEFAULT '',
  visitante_nome TEXT NOT NULL,
  visitante_doc TEXT,
  visitante_documento TEXT,
  tipo TEXT DEFAULT 'visitante',
  data_inicio DATE,
  data_fim DATE,
  data_validade DATE NOT NULL,
  hora_inicio TEXT DEFAULT '08:00',
  hora_fim TEXT DEFAULT '22:00',
  limite_usos INTEGER DEFAULT 1,
  max_usos INTEGER DEFAULT 1,
  usos_realizados INTEGER DEFAULT 0,
  status TEXT DEFAULT 'valido',
  observacoes TEXT,
  compartilhado_via TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passes_token ON public.passes_virtuais_qr(token);

-- 35. blacklist_bloqueios
CREATE TABLE IF NOT EXISTS public.blacklist_bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id UUID REFERENCES public.condominios(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'pessoa',
  nome_completo TEXT,
  nome_ou_placa TEXT NOT NULL DEFAULT '',
  cpf TEXT,
  rg TEXT,
  documento TEXT,
  motivo TEXT NOT NULL,
  gravidade TEXT DEFAULT 'alerta',
  grau_risco TEXT DEFAULT 'alerta',
  bloqueado_por_id TEXT,
  bloqueado_por_nome TEXT,
  registrado_por TEXT,
  foto_url TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_condo ON public.blacklist_bloqueios(condominio_id, ativo);

-- Publicações Supabase Realtime
DO $$
DECLARE
  tbl_rt TEXT;
  tabelas_realtime TEXT[] := ARRAY[
    'historico_absoluto',
    'lembretes_portaria',
    'encomendas_itens',
    'ocorrencias',
    'bancada_volumes',
    'chaves',
    'movimentacao_chaves',
    'prestadores_acessos',
    'passagens_posto',
    'reservas_areas_comuns',
    'registros_acesso'
  ];
BEGIN
  FOREACH tbl_rt IN ARRAY tabelas_realtime LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl_rt
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl_rt);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
