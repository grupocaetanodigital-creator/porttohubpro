import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolverContextoCondominiosOperador,
  temAcessoGlobalExplicito,
  isCondominioIdValido
} from '../src/services/autorizacaoService.ts';
import {
  buscarMoradoresDaUnidadeExata,
  validarDestinatarioAntesGravacao,
  enriquecerEncomendaComMorador
} from '../src/services/encomendasService.ts';
import {
  extrairCaminhoStorageSupabase,
  formatarUrlFoto
} from '../src/services/imageUtils.ts';
import { PORTTOHUB_DB_VERSION } from '../src/services/porttoHubDb.ts';
import { formatarErroDetalhadoSupabase } from '../src/services/supabase.ts';
import { buildTenantCacheKey } from '../src/server/upstashClient.ts';
import {
  handleHealth,
  handleOcrEtiqueta,
  handleAdminProvisionarOperador,
  handleCacheQuery,
  handleCacheStats,
  handleCacheClear
} from '../src/server/apiHandlers.ts';

const CONDO_A = '11111111-1111-4111-8111-111111111111';
const CONDO_B = '22222222-2222-4222-8222-222222222222';
const CONDO_C = '33333333-3333-4333-8333-333333333333';

const CONDOS = [
  { id: CONDO_A, nome: 'Residencial Alpha', tipo_estrutura: 'Blocos e Apartamentos' },
  { id: CONDO_B, nome: 'Condomínio Beta', tipo_estrutura: 'Casas' },
  { id: CONDO_C, nome: 'Torres Gamma', tipo_estrutura: 'Torres e Apartamentos' }
];

test('Regra A: Porteiro com 1 condomínio entra direto sem seletor', () => {
  const res = resolverContextoCondominiosOperador({
    operador: { id: 'op-1', perfil: 'operador', nivel_acesso: 3, condominio_id: CONDO_A, acesso_global_condominios: false },
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [CONDO_A],
    tabelaVinculosDisponivel: true
  });

  assert.equal(res.bloqueado, false);
  assert.equal(res.ePorteiro, true);
  assert.equal(res.mostrarSeletor, false);
  assert.equal(res.podeTrocarCondominio, false);
  assert.equal(res.condominioInicialId, CONDO_A);
  assert.equal(res.condominiosPermitidos.length, 1);
});

test('Regra A: Porteiro sem condomínio ou com "todos" é bloqueado', () => {
  const res = resolverContextoCondominiosOperador({
    operador: { id: 'op-sem', perfil: 'operador', nivel_acesso: 3, condominio_id: 'todos', acesso_global_condominios: false },
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [],
    tabelaVinculosDisponivel: true
  });

  assert.equal(res.bloqueado, true);
  assert.equal(res.condominiosPermitidos.length, 0);
});

test('Regra B: Supervisor com 0, 1 e 2+ condomínios vinculados', () => {
  const supZero = resolverContextoCondominiosOperador({
    operador: { id: 'sup-0', perfil: 'supervisor', nivel_acesso: 2, condominio_id: CONDO_A, acesso_global_condominios: false },
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [],
    tabelaVinculosDisponivel: true
  });
  assert.equal(supZero.bloqueado, true);

  const supUm = resolverContextoCondominiosOperador({
    operador: { id: 'sup-1', perfil: 'supervisor', nivel_acesso: 2, condominio_id: CONDO_A, acesso_global_condominios: false },
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [CONDO_B],
    tabelaVinculosDisponivel: true
  });
  assert.equal(supUm.bloqueado, false);
  assert.equal(supUm.mostrarSeletor, false);
  assert.equal(supUm.condominioInicialId, CONDO_B);

  const supDois = resolverContextoCondominiosOperador({
    operador: { id: 'sup-2', perfil: 'supervisor', nivel_acesso: 2, condominio_id: CONDO_A, acesso_global_condominios: false },
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [CONDO_A, CONDO_C],
    tabelaVinculosDisponivel: true
  });
  assert.equal(supDois.bloqueado, false);
  assert.equal(supDois.mostrarSeletor, true);
  assert.deepEqual(supDois.condominiosPermitidos.map(c => c.id), [CONDO_A, CONDO_C]);
});

test('Regra C: Login "admin", perfil "master" ou nivel_acesso <= 1 SEM flag explícito NÃO ganham acesso global', () => {
  const adminSemFlag = {
    id: 'fake-global',
    login: 'admin',
    perfil: 'master',
    nivel_acesso: 1,
    condominio_id: 'todos',
    acesso_global_condominios: false
  };
  assert.equal(temAcessoGlobalExplicito(adminSemFlag), false);

  const resSemVinculo = resolverContextoCondominiosOperador({
    operador: adminSemFlag,
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [],
    tabelaVinculosDisponivel: true
  });
  assert.equal(resSemVinculo.eAdminGeral, false);
  assert.equal(resSemVinculo.bloqueado, true);

  const adminComFlag = { ...adminSemFlag, acesso_global_condominios: true };
  assert.equal(temAcessoGlobalExplicito(adminComFlag), true);
  const resComFlag = resolverContextoCondominiosOperador({
    operador: adminComFlag,
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [],
    tabelaVinculosDisponivel: true
  });
  assert.equal(resComFlag.bloqueado, false);
  assert.equal(resComFlag.eAdminGeral, true);
  assert.equal(resComFlag.condominiosPermitidos.length, 3);
});

test('Regra D: Síndico fica restrito ao seu condomínio', () => {
  const res = resolverContextoCondominiosOperador({
    operador: { id: 'sind-1', perfil: 'sindico', nivel_acesso: 4, condominio_id: CONDO_B, acesso_global_condominios: false },
    condominiosDisponiveis: CONDOS,
    vinculosExplicitosIds: [CONDO_B, CONDO_C],
    tabelaVinculosDisponivel: true
  });
  assert.equal(res.bloqueado, false);
  assert.equal(res.eSindico, true);
  assert.equal(res.mostrarSeletor, false);
  assert.equal(res.condominioInicialId, CONDO_B);
});

test('Encomendas: unidade com 1 morador vs múltiplos moradores vs isolamento entre condomínios', async () => {
  const moradores = [
    { id: 'm1', condominio_id: CONDO_A, nome: 'Carlos Souza', bloco: 'A', unidade: '101' },
    { id: 'm2', condominio_id: CONDO_A, nome: 'Ana Souza', bloco: 'A', unidade: '101' },
    { id: 'm3', condominio_id: CONDO_A, nome: 'Bruno Lima', bloco: 'A', unidade: '102' },
    { id: 'm4', condominio_id: CONDO_B, nome: 'Outro Condomínio', bloco: 'A', unidade: '101' }
  ];

  // 1. Unidade exata retorna apenas os do CONDO_A
  const da101 = buscarMoradoresDaUnidadeExata(moradores, CONDO_A, 'A', '101', 'Blocos e Apartamentos');
  assert.equal(da101.length, 2);

  // 2. Unidade com 2 moradores SEM moradorId deve falhar
  const semEscolha = await validarDestinatarioAntesGravacao({
    condominioId: CONDO_A,
    bloco: 'A',
    unidade: '101',
    moradoresCondominio: moradores,
    tipoEstrutura: 'Blocos e Apartamentos',
    consultarSupabaseSeOnline: false
  });
  assert.equal(semEscolha.valido, false);

  // 3. Unidade com 2 moradores COM moradorId válido deve passar
  const comEscolha = await validarDestinatarioAntesGravacao({
    condominioId: CONDO_A,
    bloco: 'A',
    unidade: '101',
    moradorId: 'm2',
    moradoresCondominio: moradores,
    tipoEstrutura: 'Blocos e Apartamentos',
    consultarSupabaseSeOnline: false
  });
  assert.equal(comEscolha.valido, true);
  assert.equal(comEscolha.moradorId, 'm2');

  // 4. Morador de outro condomínio (m4) deve ser rejeitado
  const outroCondo = await validarDestinatarioAntesGravacao({
    condominioId: CONDO_A,
    bloco: 'A',
    unidade: '101',
    moradorId: 'm4',
    moradoresCondominio: moradores,
    tipoEstrutura: 'Blocos e Apartamentos',
    consultarSupabaseSeOnline: false
  });
  assert.equal(outroCondo.valido, false);

  // 5. Unidade com 1 morador vincula automaticamente o morador único
  const unico = await validarDestinatarioAntesGravacao({
    condominioId: CONDO_A,
    bloco: 'A',
    unidade: '102',
    moradoresCondominio: moradores,
    tipoEstrutura: 'Blocos e Apartamentos',
    consultarSupabaseSeOnline: false
  });
  assert.equal(unico.valido, true);
  assert.equal(unico.moradorId, 'm3');

  // 6. Enriquecimento nunca associa outro morador se morador_id for nulo
  const itemSemMorador = enriquecerEncomendaComMorador(
    { id: 'enc-1', condominio_id: CONDO_A, bloco: 'A', unidade: '102', morador_id: null },
    moradores,
    [],
    'Blocos e Apartamentos'
  );
  assert.equal(itemSemMorador.morador_id, null);
  assert.equal(itemSemMorador.moradores, null);
});

test('Storage privado e extração de caminhos por condomínio', () => {
  const pathRel = extrairCaminhoStorageSupabase(`condominios/${CONDO_A}/encomendas/foto.jpg`);
  assert.deepEqual(pathRel, { bucket: 'encomendas', path: `condominios/${CONDO_A}/encomendas/foto.jpg` });

  const pathPublic = extrairCaminhoStorageSupabase(
    `https://abc.supabase.co/storage/v1/object/public/encomendas/condominios/${CONDO_A}/custodia/x.jpg`
  );
  assert.deepEqual(pathPublic, { bucket: 'encomendas', path: `condominios/${CONDO_A}/custodia/x.jpg` });

  const pathSign = extrairCaminhoStorageSupabase(
    `https://abc.supabase.co/storage/v1/object/sign/encomendas/condominios/${CONDO_A}/rondas/y.jpg?token=secret`
  );
  assert.deepEqual(pathSign, { bucket: 'encomendas', path: `condominios/${CONDO_A}/rondas/y.jpg` });

  assert.equal(formatarUrlFoto('data:image/jpeg;base64,abc'), 'data:image/jpeg;base64,abc');
  assert.equal(isCondominioIdValido('todos'), false);
  assert.equal(isCondominioIdValido('global'), false);
  assert.equal(isCondominioIdValido(CONDO_A), true);
});

test('Backend API: rotas protegidas exigem Bearer JWT e chaves Redis são isoladas por condomínio', async () => {
  const mockEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_ANON_KEY: 'mock_anon_key_12345678901234567890'
  };

  const healthRes = await handleHealth(mockEnv, 'node');
  assert.equal(healthRes.status, 200);
  const healthJson: any = await healthRes.json();
  assert.equal(healthJson.ok, true);
  assert.equal('SUPABASE_SERVICE_ROLE_KEY' in healthJson, false);

  const reqSemToken = (url: string, method = 'POST', body?: any) =>
    new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });

  assert.equal((await handleOcrEtiqueta(reqSemToken('http://localhost/api/ocr-etiqueta', 'POST', { imagemBase64: 'abc' }), mockEnv)).status, 401);
  assert.equal((await handleAdminProvisionarOperador(reqSemToken('http://localhost/api/admin/operadores/provisionar', 'POST', {}), mockEnv)).status, 401);
  assert.equal((await handleCacheQuery(reqSemToken('http://localhost/api/cache/query', 'POST', { table: 'moradores', condominioId: CONDO_A }), mockEnv)).status, 401);
  assert.equal((await handleCacheStats(reqSemToken('http://localhost/api/cache/stats', 'GET'), mockEnv)).status, 401);
  assert.equal((await handleCacheClear(reqSemToken('http://localhost/api/cache/clear', 'POST'), mockEnv)).status, 401);

  const keyA = buildTenantCacheKey({ table: 'moradores', condominioId: CONDO_A });
  const keyB = buildTenantCacheKey({ table: 'moradores', condominioId: CONDO_B });
  assert.ok(keyA.startsWith(`porttohub:v1:condo:${CONDO_A}:moradores:`));
  assert.ok(keyB.startsWith(`porttohub:v1:condo:${CONDO_B}:moradores:`));
  assert.notEqual(keyA, keyB);
});

test('Auditoria de segurança e remoção do OCR de documentos', () => {
  assert.equal(PORTTOHUB_DB_VERSION, 2);

  // Arquivos de Document AI OCR removidos
  assert.equal(fs.existsSync(path.resolve('src/services/documentOcrService.ts')), false);
  assert.equal(fs.existsSync(path.resolve('src/components/ModalLeitorDocumentoOCR.tsx')), false);
  assert.equal(fs.existsSync(path.resolve('src/components/AbaModelosDocumentosOCR.tsx')), false);

  const serverCode = fs.readFileSync(path.resolve('server.ts'), 'utf8');
  const workerCode = fs.readFileSync(path.resolve('src/worker.ts'), 'utf8');
  const appCode = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const supabaseCode = fs.readFileSync(path.resolve('src/services/supabase.ts'), 'utf8');

  assert.equal(serverCode.includes('/api/ocr-documento'), false);
  assert.equal(workerCode.includes('/api/ocr-documento'), false);
  assert.equal(serverCode.includes('kkeizhscivyfjgetnbke'), false);
  assert.equal(supabaseCode.includes('kkeizhscivyfjgetnbke'), false);
  assert.equal(appCode.includes("'2468'"), false);
  assert.equal(appCode.includes('"2468"'), false);

  // Nenhuma referência a service_role no código cliente src/services ou src/components ou src/pages
  for (const dir of ['src/services', 'src/components', 'src/pages']) {
    const absDir = path.resolve(dir);
    for (const file of fs.readdirSync(absDir)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const content = fs.readFileSync(path.join(absDir, file), 'utf8');
      assert.equal(content.includes('SUPABASE_SERVICE_ROLE_KEY'), false, `${dir}/${file} não pode referenciar SUPABASE_SERVICE_ROLE_KEY`);
    }
  }
});

test('Formatação detalhada de erros Supabase (rede, apikey, RLS e Auth)', () => {
  const errRede = formatarErroDetalhadoSupabase({ message: 'Failed to fetch' }, 'Auth');
  assert.ok(errRede.includes('Failed to fetch'));
  assert.ok(errRede.toLowerCase().includes('rede'));

  const errKey = formatarErroDetalhadoSupabase({ status: 401, message: 'Invalid API key' }, 'Auth');
  assert.ok(errKey.includes('HTTP 401'));
  assert.ok(errKey.includes('Invalid API key'));

  const errRls = formatarErroDetalhadoSupabase({ code: '42501', message: 'permission denied for table operadores' }, 'Operadores');
  assert.ok(errRls.includes('42501'));
  assert.ok(errRls.toLowerCase().includes('rls'));
});
