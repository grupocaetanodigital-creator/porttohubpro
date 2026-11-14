/**
 * Manipuladores Web-Standard compartilhados para todas as rotas /api/* do PorttoHub.
 * Compatível com Cloudflare Workers (src/worker.ts) e Express Node.js (server.ts).
 */

import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  authenticateRequest,
  getSupabaseServerConfig,
  isCondominioAutorizado,
  isValidUuid,
  podeGerenciarOperadores
} from './authMiddleware';
import { buildTenantCacheKey, createUpstashCache, type RuntimeEnv } from './upstashClient';

const ALLOWED_OCR_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_OCR_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowlist explícita de tabelas que podem ser consultadas via proxy cache
const ALLOWED_CACHE_TABLES = new Set([
  'condominios',
  'operadores',
  'moradores',
  'encomendas_itens',
  'custodia',
  'chaves',
  'bancada_volumes',
  'registros_acesso',
  'entregadores',
  'materiais_posto',
  'rondas_pontos',
  'rondas',
  'ocorrencias',
  'prestadores',
  'configuracoes',
  'niveis_acesso',
  'reservas_areas',
  'areas_comuns',
  'manutencoes',
  'lembretes_portaria'
]);

const GLOBAL_TABLE_WITHOUT_CONDO_ID = new Set(['condominios']);

// Rate limit simples em memória por usuário (30 requisições / 60s)
const ocrRateMap = new Map<string, { count: number; resetAt: number }>();

function checkOcrRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = ocrRateMap.get(userId);
  if (!entry || now > entry.resetAt) {
    ocrRateMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

async function readJsonBody(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Cache em memória para versão do repositório (15 minutos)
let cachedVersaoData: any = null;
let cachedVersaoTimestamp = 0;
const VERSAO_CACHE_TTL_MS = 15 * 60 * 1000;

export async function handleHealth(env: RuntimeEnv, runtimeName: 'node' | 'cloudflare-worker'): Promise<Response> {
  const sb = getSupabaseServerConfig(env);
  const cache = createUpstashCache(env);

  return jsonResponse({
    ok: true,
    service: 'porttohub-api',
    runtime: runtimeName,
    timestamp: new Date().toISOString(),
    configured: {
      supabase: sb.configured,
      supabaseAdmin: Boolean(sb.configured && sb.serviceRoleKey),
      upstashRedis: cache.isConfigured(),
      geminiOcr: Boolean(env.GEMINI_API_KEY)
    }
  });
}

export async function handleGithubVersao(env: RuntimeEnv, localGitInfo?: {
  sha?: string;
  mensagem?: string;
  autor?: string;
  dataIso?: string;
}): Promise<Response> {
  try {
    const agora = Date.now();
    if (cachedVersaoData && agora - cachedVersaoTimestamp < VERSAO_CACHE_TTL_MS) {
      return jsonResponse(cachedVersaoData);
    }

    let remoteCommit: any = null;
    try {
      const token = String(env.GITHUB_TOKEN || '').trim();
      const headers: Record<string, string> = {
        'User-Agent': 'PorttoHub-App',
        Accept: 'application/vnd.github.v3+json'
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 2500);
      const ghRes = await fetch('https://api.github.com/repos/grupocaetanodigital-creator/PorttoHubPro/commits/main', {
        headers,
        signal: controller.signal
      });
      clearTimeout(fetchTimeout);
      if (ghRes.ok) {
        remoteCommit = await ghRes.json();
      }
    } catch {}

    const sha = remoteCommit ? String(remoteCommit.sha).slice(0, 7) : localGitInfo?.sha || 'main';
    const rawDate = remoteCommit ? remoteCommit.commit?.committer?.date : localGitInfo?.dataIso || new Date().toISOString();
    const mensagem = remoteCommit ? remoteCommit.commit?.message : localGitInfo?.mensagem || 'PorttoHub Pro';
    const autor = remoteCommit ? remoteCommit.commit?.author?.name : localGitInfo?.autor || 'PorttoHub';

    const dataObj = new Date(rawDate);
    const dataBrasilia = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(dataObj);

    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(dataObj);
    const mapa: Record<string, string> = {};
    for (const p of partes) mapa[p.type] = p.value;
    const versaoCalculada = `${mapa.day || '01'}${mapa.month || '01'}${(mapa.year || '26').slice(-2)}${mapa.hour || '00'}${mapa.minute || '00'}`;

    const payload = {
      sucesso: true,
      repositorio: 'grupocaetanodigital-creator/PorttoHubPro',
      branch: 'main',
      sha,
      mensagem,
      autor,
      dataIso: rawDate,
      dataBrasilia: `${dataBrasilia} (Horário de Brasília - BRT)`,
      versaoCalculada,
      horarioConsulta: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    };

    cachedVersaoData = payload;
    cachedVersaoTimestamp = agora;
    return jsonResponse(payload);
  } catch (err: any) {
    if (cachedVersaoData) return jsonResponse(cachedVersaoData);
    return jsonResponse({ sucesso: false, erro: err?.message || 'Erro ao consultar versão' }, 500);
  }
}

/**
 * OCR EXCLUSIVO de Etiquetas de Encomendas (< 5s).
 * Exige JWT válido, aplica rate limit, valida MIME/tamanho e nunca extrai DANFE de 44 dígitos.
 */
export async function handleOcrEtiqueta(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error }, auth.status);
  }

  if (!checkOcrRateLimit(auth.context.authUser.id)) {
    return jsonResponse({ erro: 'Limite de leituras de etiquetas atingido. Aguarde alguns segundos.' }, 429);
  }

  const body = await readJsonBody(request);
  const imagemBase64 = body?.imagemBase64;
  if (!imagemBase64 || typeof imagemBase64 !== 'string') {
    return jsonResponse({ erro: 'Imagem não fornecida.' }, 400);
  }

  const mimeMatch = imagemBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  const mimeTypeRaw = (mimeMatch?.[1] || 'image/jpeg').toLowerCase();
  if (!ALLOWED_OCR_MIME_TYPES.has(mimeTypeRaw)) {
    return jsonResponse({ erro: 'Formato de imagem não permitido. Use JPEG, PNG ou WEBP.' }, 400);
  }

  const base64Data = mimeMatch ? mimeMatch[2] : imagemBase64.replace(/^data:image\/\w+;base64,/, '');
  const approxBytes = Math.ceil((base64Data.length * 3) / 4);
  if (approxBytes > MAX_OCR_IMAGE_BYTES) {
    return jsonResponse({ erro: 'Imagem excede o limite de 5MB.' }, 413);
  }

  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse({ erro: 'Chave GEMINI_API_KEY não configurada no servidor.' }, 503);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelName = String(env.GEMINI_OCR_MODEL || 'gemini-4-hydrogen').trim();

    const systemInstruction = `Você é um leitor óptico ultra-rápido de etiquetas de logística brasileira (Correios, Mercado Livre, Shopee, Amazon, Jadlog, Loggi).
RESPONDA EM MENOS DE 2 SEGUNDOS.

REGRAS RÍGIDAS:
1. "codigoRastreio": Código de rastreamento principal (ex: Correios "NL123456789BR", Mercado Livre "MLB...", Shopee "BR24...", Amazon "TBA...").
2. "numeroNF": Número da NOTA FISCAL impresso na etiqueta (ex: "NF 123456", "NF-e: 001.234.567"). Retorne apenas o número curto.
3. PROIBIDO EXTRAIR CHAVE DE ACESSO DANFE: NUNCA retorne a chave de acesso de 44 dígitos da NF-e.
4. "destinatario": Nome da pessoa destinatária se legível.
5. "unidade": Número do apartamento ou casa.
6. "bloco": Bloco ou torre se legível.
7. "transportadora": Nome da empresa (Correios, Mercado Livre, Shopee, Amazon, Jadlog, etc.).
8. "outroCodigo": Apenas 1 outro código curto alternativo caso exista.`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 4500);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeTypeRaw === 'image/jpg' ? 'image/jpeg' : mimeTypeRaw
              }
            },
            {
              text: 'Extraia rapidamente o código de rastreio e o número da Nota Fiscal (NF). NÃO extraia chave de 44 dígitos da DANFE.'
            }
          ]
        }
      ],
      config: {
        systemInstruction,
        abortSignal: abortController.signal,
        responseMimeType: 'application/json',
        maxOutputTokens: 250,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW
        },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            codigoRastreio: { type: Type.STRING },
            numeroNF: { type: Type.STRING },
            destinatario: { type: Type.STRING },
            unidade: { type: Type.STRING },
            bloco: { type: Type.STRING },
            transportadora: { type: Type.STRING },
            outroCodigo: { type: Type.STRING }
          }
        }
      }
    });

    clearTimeout(timeoutId);

    const parsed = JSON.parse(response.text || '{}');
    const sugestoes: Array<{ tipo: 'rastreio' | 'nf' | 'outro'; label: string; valor: string; destaque?: boolean }> = [];
    const ehChaveDanfe = (cod: string) => cod.replace(/\D/g, '').length >= 35;

    const codRastreio = (parsed.codigoRastreio || '').trim();
    if (codRastreio && !ehChaveDanfe(codRastreio) && codRastreio !== 'null' && codRastreio !== 'undefined') {
      sugestoes.push({
        tipo: 'rastreio',
        label: `Rastreio (${parsed.transportadora || 'Pacote'})`,
        valor: codRastreio,
        destaque: true
      });
    }

    const numNF = (parsed.numeroNF || '').trim();
    if (numNF && !ehChaveDanfe(numNF) && numNF !== 'null' && numNF !== 'undefined' && numNF !== codRastreio) {
      sugestoes.push({
        tipo: 'nf',
        label: 'Nota Fiscal (NF)',
        valor: numNF,
        destaque: true
      });
    }

    const outroCod = (parsed.outroCodigo || '').trim();
    if (
      outroCod &&
      !ehChaveDanfe(outroCod) &&
      outroCod !== 'null' &&
      outroCod !== 'undefined' &&
      outroCod !== codRastreio &&
      outroCod !== numNF &&
      sugestoes.length < 3
    ) {
      sugestoes.push({
        tipo: 'outro',
        label: 'Cód. Alternativo',
        valor: outroCod
      });
    }

    return jsonResponse({
      codigoRastreio: codRastreio,
      numeroNF: numNF,
      destinatario: (parsed.destinatario || '').trim(),
      unidade: (parsed.unidade || '').trim(),
      bloco: (parsed.bloco || '').trim(),
      transportadora: (parsed.transportadora || '').trim(),
      sugestoes: sugestoes.slice(0, 3),
      confianca: 99,
      metodoUtilizado: 'IA_GEMINI_FAST'
    });
  } catch (err: any) {
    console.error('[API OCR Etiqueta] Erro:', err?.message || err);
    return jsonResponse({ erro: err?.message || 'Falha no processamento OCR da etiqueta.' }, 500);
  }
}

/**
 * Provisionamento seguro de credenciais de operadores no Supabase Auth (server-only Service Role).
 */
export async function handleAdminProvisionarOperador(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  const cfg = getSupabaseServerConfig(env);
  if (!cfg.configured || !cfg.serviceRoleKey) {
    return jsonResponse(
      { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Configure nos Secrets do servidor.' },
      503
    );
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const operadorIdAlvo = body.operador_id ? String(body.operador_id).trim() : '';
  const authUserIdInformado = body.auth_user_id ? String(body.auth_user_id).trim() : '';
  const email = String(body.email || '').trim().toLowerCase();
  const password = body.password ? String(body.password) : '';
  const nome = String(body.nome || '').trim();
  const targetCondominioId = body.condominio_id ? String(body.condominio_id).trim() : '';

  if (!auth.context.eAdminGlobal) {
    if (!podeGerenciarOperadores(auth.context, targetCondominioId)) {
      return jsonResponse({ error: 'Sem permissão para provisionar operadores neste condomínio.' }, 403);
    }
  }

  const adminHeaders = {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  // Se operador_id foi informado e solicitante não é admin global, garante que o alvo pertence ao condomínio autorizado
  let authUserIdExistente = authUserIdInformado;
  if (operadorIdAlvo) {
    const opRes = await fetch(
      `${cfg.url}/rest/v1/operadores?select=id,condominio_id,auth_user_id,acesso_global_condominios&id=eq.${encodeURIComponent(operadorIdAlvo)}&limit=1`,
      { headers: adminHeaders }
    );
    if (opRes.ok) {
      const opRows: any[] = await opRes.json();
      const opTarget = opRows?.[0];
      if (opTarget) {
        if (!auth.context.eAdminGlobal) {
          if (opTarget.acesso_global_condominios === true || !isCondominioAutorizado(auth.context, opTarget.condominio_id)) {
            return jsonResponse({ error: 'Não autorizado a alterar credenciais de operador de outro condomínio ou global.' }, 403);
          }
        }
        if (!authUserIdExistente && opTarget.auth_user_id) {
          authUserIdExistente = String(opTarget.auth_user_id);
        }
      }
    }
  }

  if (!email && !authUserIdExistente) {
    return jsonResponse({ error: 'Informe um e-mail válido para criar o acesso Auth.' }, 400);
  }
  if (email && !email.includes('@')) {
    return jsonResponse({ error: 'Formato de e-mail inválido.' }, 400);
  }
  if (password && password.length < 6) {
    return jsonResponse({ error: 'A senha deve possuir ao menos 6 caracteres.' }, 400);
  }

  try {
    // 1. Atualização de usuário Auth existente
    if (authUserIdExistente && isValidUuid(authUserIdExistente)) {
      const updatePayload: any = { email_confirm: true };
      if (email) updatePayload.email = email;
      if (password) updatePayload.password = password;
      if (nome) updatePayload.user_metadata = { nome };

      const updRes = await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(authUserIdExistente)}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify(updatePayload)
      });
      const updJson: any = await updRes.json().catch(() => ({}));
      if (!updRes.ok) {
        return jsonResponse({ error: updJson?.msg || updJson?.message || 'Erro ao atualizar usuário no Supabase Auth.' }, updRes.status);
      }
      return jsonResponse({
        sucesso: true,
        auth_user_id: updJson?.id || authUserIdExistente,
        acao: 'atualizado'
      });
    }

    // 2. Criação de novo usuário Auth (com fallback se e-mail já existir)
    if (!password) {
      return jsonResponse({ error: 'Informe uma senha inicial de acesso (mínimo 6 caracteres).' }, 400);
    }

    const createRes = await fetch(`${cfg.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: nome ? { nome } : undefined
      })
    });
    const createJson: any = await createRes.json().catch(() => ({}));

    if (createRes.ok && createJson?.id) {
      return jsonResponse({
        sucesso: true,
        auth_user_id: createJson.id,
        acao: 'criado'
      });
    }

    // Se já existe conta com esse e-mail no Auth, localiza e sincroniza senha/confirmação
    const listRes = await fetch(
      `${cfg.url}/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(email)}`,
      { headers: adminHeaders }
    );
    if (listRes.ok) {
      const listJson: any = await listRes.json();
      const users = Array.isArray(listJson?.users) ? listJson.users : [];
      const found = users.find((u: any) => String(u.email || '').toLowerCase() === email);
      if (found?.id) {
        const syncRes = await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(found.id)}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({
            password,
            email_confirm: true,
            user_metadata: nome ? { nome } : undefined
          })
        });
        if (syncRes.ok) {
          return jsonResponse({
            sucesso: true,
            auth_user_id: found.id,
            acao: 'vinculado_e_atualizado'
          });
        }
      }
    }

    return jsonResponse(
      { error: createJson?.msg || createJson?.message || 'Erro ao criar conta no Supabase Auth.' },
      createRes.status || 400
    );
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Erro interno no provisionamento Auth.' }, 500);
  }
}

export async function handleCacheQuery(request: Request, env: RuntimeEnv): Promise<Response> {
  const start = Date.now();
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error, data: [] }, auth.status);
  }

  const body = await readJsonBody(request);
  const {
    table,
    select = '*',
    filters = [],
    orderBy,
    limit,
    ttlSeconds = 180,
    forceRefresh = false,
    condominioId: rawCondoId
  } = body || {};

  if (!table || typeof table !== 'string' || !ALLOWED_CACHE_TABLES.has(table)) {
    return jsonResponse({ erro: 'Tabela não informada ou não permitida neste endpoint.', data: [] }, 400);
  }

  const filtersList = Array.isArray(filters) ? [...filters] : [];
  const condoIdFromFilters = filtersList.find(
    f => f.field === 'condominio_id' && f.value && f.value !== 'todos' && f.value !== 'global'
  )?.value;
  const headerCondo = request.headers.get('x-condominio-id') || '';
  const candidateCondoId =
    (rawCondoId && rawCondoId !== 'todos' && rawCondoId !== 'global' ? String(rawCondoId) : '') ||
    (condoIdFromFilters ? String(condoIdFromFilters) : '') ||
    (headerCondo && headerCondo !== 'todos' && headerCondo !== 'global' ? headerCondo : '');

  const isGlobalTable = GLOBAL_TABLE_WITHOUT_CONDO_ID.has(table);

  if (!isGlobalTable) {
    if (!isValidUuid(candidateCondoId)) {
      return jsonResponse(
        { erro: `Isolamento Multi-Tenant Obrigatório: condominioId UUID válido é obrigatório para "${table}".`, data: [] },
        400
      );
    }
    if (!isCondominioAutorizado(auth.context, candidateCondoId)) {
      return jsonResponse({ erro: 'Acesso negado a este condomínio.', data: [] }, 403);
    }

    const semCondo = filtersList.filter(f => f.field !== 'condominio_id');
    semCondo.push({ field: 'condominio_id', op: 'eq', value: candidateCondoId });
    filtersList.length = 0;
    filtersList.push(...semCondo);
  }

  const cache = createUpstashCache(env);
  const cacheKey = buildTenantCacheKey({
    table,
    condominioId: isGlobalTable ? undefined : candidateCondoId,
    operadorScope: isGlobalTable ? auth.context.operador.id : undefined,
    select,
    filters: filtersList,
    orderBy,
    limit
  });

  const tags = [`table:${table}`];
  if (!isGlobalTable && candidateCondoId) tags.push(`condominio:${candidateCondoId}`);
  if (isGlobalTable) tags.push(`op:${auth.context.operador.id}`);

  if (!forceRefresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      try {
        const parsedData = JSON.parse(cached);
        const latencyMs = Date.now() - start;
        return jsonResponse(
          {
            sucesso: true,
            cached: true,
            origem: cache.isConfigured() ? 'upstash-redis' : 'memory',
            latencyMs,
            total: Array.isArray(parsedData) ? parsedData.length : 1,
            data: parsedData
          },
          200,
          { 'X-Cache': 'HIT', 'X-Response-Time': `${latencyMs}ms` }
        );
      } catch {
        // Segue para consulta ao Supabase
      }
    }
  }

  const cfg = getSupabaseServerConfig(env);
  const queryParams = new URLSearchParams();

  // Nunca permite ler colunas sensíveis de operadores caso tabela operadores seja consultada
  let safeSelect = String(select || '*');
  if (table === 'operadores' && safeSelect.trim() === '*') {
    safeSelect = 'id,condominio_id,nome,login,email,auth_user_id,nivel_acesso,nivel_acesso_custom_id,perfil,funcao,cargo,foto_url,acesso_global_condominios,permissoes,unidade,ativo,created_at';
  }
  queryParams.set('select', safeSelect);

  for (const f of filtersList) {
    if (!f?.field || f.value === undefined) continue;
    const op = f.op || 'eq';
    if (op === 'eq') queryParams.append(f.field, `eq.${f.value}`);
    else if (op === 'neq') queryParams.append(f.field, `neq.${f.value}`);
    else if (op === 'in') queryParams.append(f.field, `in.(${Array.isArray(f.value) ? f.value.join(',') : f.value})`);
    else if (op === 'gte') queryParams.append(f.field, `gte.${f.value}`);
    else if (op === 'lte') queryParams.append(f.field, `lte.${f.value}`);
    else if (op === 'ilike') queryParams.append(f.field, `ilike.%${f.value}%`);
  }

  if (orderBy?.field) {
    queryParams.set('order', `${orderBy.field}.${orderBy.ascending ? 'asc' : 'desc'}`);
  }
  if (limit && Number(limit) > 0) {
    queryParams.set('limit', String(Math.min(Number(limit), 2000)));
  }

  const restUrl = `${cfg.url}/rest/v1/${table}?${queryParams.toString()}`;
  const supabaseRes = await fetch(restUrl, {
    method: 'GET',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${auth.context.jwt}`,
      'Content-Type': 'application/json'
    }
  });

  if (!supabaseRes.ok) {
    const errText = await supabaseRes.text();
    return jsonResponse({ erro: `Erro no Supabase: ${errText}` }, supabaseRes.status);
  }

  let data = await supabaseRes.json();

  // Filtro adicional de segurança para tabela condominios quando não for Admin Geral explícito
  if (isGlobalTable && Array.isArray(data) && !auth.context.eAdminGlobal) {
    data = data.filter((c: any) => auth.context.allowedCondominioIds.has(String(c?.id || '')));
  }

  const ttlFinal = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : 180;
  await cache.set(cacheKey, JSON.stringify(data), ttlFinal, tags);

  const latencyMs = Date.now() - start;
  return jsonResponse(
    {
      sucesso: true,
      cached: false,
      origem: 'supabase',
      latencyMs,
      total: Array.isArray(data) ? data.length : 1,
      data
    },
    200,
    { 'X-Cache': 'MISS', 'X-Response-Time': `${latencyMs}ms` }
  );
}

export async function handleCacheInvalidate(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error }, auth.status);
  }

  const body = await readJsonBody(request);
  const { table, tag, condominioId } = body || {};

  if (condominioId && !isCondominioAutorizado(auth.context, String(condominioId))) {
    return jsonResponse({ erro: 'Não autorizado a invalidar cache deste condomínio.' }, 403);
  }
  if (!condominioId && !auth.context.eAdminGlobal && !table) {
    return jsonResponse({ erro: 'Informe condominioId autorizado para invalidar cache.' }, 400);
  }

  const cache = createUpstashCache(env);
  let removidos = 0;

  if (condominioId) {
    if (table) {
      removidos += await cache.invalidateByPattern(`porttohub:v1:condo:${condominioId}:${table}:*`);
    } else {
      removidos += await cache.invalidateByTag(`condominio:${condominioId}`);
      removidos += await cache.invalidateByPattern(`porttohub:v1:condo:${condominioId}:*`);
    }
  } else if (auth.context.eAdminGlobal) {
    if (table) {
      removidos += await cache.invalidateByTag(`table:${table}`);
    }
    if (tag) {
      removidos += await cache.invalidateByTag(String(tag));
    }
  } else if (table) {
    for (const allowedCondo of auth.context.allowedCondominioIds) {
      removidos += await cache.invalidateByPattern(`porttohub:v1:condo:${allowedCondo}:${table}:*`);
    }
  }

  return jsonResponse({
    sucesso: true,
    removidos,
    mensagem: `${removidos} entrada(s) de cache invalidada(s).`
  });
}

export async function handleCacheStats(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error }, auth.status);
  }

  const cache = createUpstashCache(env);
  const stats = await cache.getStats();

  return jsonResponse({
    sucesso: true,
    ...stats,
    horarioServidor: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  });
}

export async function handleCacheClear(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error }, auth.status);
  }

  const cache = createUpstashCache(env);
  if (auth.context.eAdminGlobal) {
    await cache.flush();
    return jsonResponse({ sucesso: true, mensagem: 'Cache global limpo com sucesso.' });
  }

  let removidos = 0;
  for (const condoId of auth.context.allowedCondominioIds) {
    removidos += await cache.invalidateByPattern(`porttohub:v1:condo:${condoId}:*`);
  }
  return jsonResponse({
    sucesso: true,
    removidos,
    mensagem: 'Cache dos condomínios autorizados limpo com sucesso.'
  });
}

export async function handleCacheWarmup(request: Request, env: RuntimeEnv): Promise<Response> {
  const start = Date.now();
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error }, auth.status);
  }

  const body = await readJsonBody(request);
  const condominioId = body?.condominioId ? String(body.condominioId).trim() : '';

  if (!isValidUuid(condominioId) || !isCondominioAutorizado(auth.context, condominioId)) {
    return jsonResponse({ erro: 'Condomínio inválido ou não autorizado para aquecimento de cache.' }, 403);
  }

  const cfg = getSupabaseServerConfig(env);
  const cache = createUpstashCache(env);

  const tabelasParaAquecer = [
    { table: 'chaves', ttl: 180, select: 'id,condominio_id,codigo_chave,nome_chave,status,localizacao' },
    { table: 'moradores', ttl: 300, select: 'id,condominio_id,nome,bloco,unidade,telefone,status_acesso,tag_rfid,veiculo_placa,veiculo_modelo' },
    { table: 'entregadores', ttl: 300, select: '*' },
    { table: 'bancada_volumes', ttl: 60, select: '*' }
  ];

  const resultados: any[] = [];
  for (const item of tabelasParaAquecer) {
    try {
      const restUrl = `${cfg.url}/rest/v1/${item.table}?select=${encodeURIComponent(item.select)}&condominio_id=eq.${encodeURIComponent(condominioId)}`;
      const resp = await fetch(restUrl, {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${auth.context.jwt}`
        }
      });
      if (resp.ok) {
        const dados = await resp.json();
        const key = buildTenantCacheKey({
          table: item.table,
          condominioId,
          select: item.select,
          filters: [{ field: 'condominio_id', op: 'eq', value: condominioId }]
        });
        await cache.set(key, JSON.stringify(dados), item.ttl, [`table:${item.table}`, `condominio:${condominioId}`]);
        resultados.push({ table: item.table, registros: Array.isArray(dados) ? dados.length : 0, status: 'ok' });
      }
    } catch (itemErr: any) {
      resultados.push({ table: item.table, status: 'erro', erro: itemErr?.message || 'Erro' });
    }
  }

  return jsonResponse({
    sucesso: true,
    tempoTotalMs: Date.now() - start,
    tabelasAquecidas: resultados
  });
}

export async function handleCacheBenchmark(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ erro: auth.error }, auth.status);
  }

  const cfg = getSupabaseServerConfig(env);
  const cache = createUpstashCache(env);

  try {
    const t0 = Date.now();
    const supRes = await fetch(`${cfg.url}/rest/v1/condominios?select=id,nome&limit=20`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${auth.context.jwt}`
      }
    });
    const supData = await supRes.json();
    const latenciaSupabaseMs = Date.now() - t0;

    const testKey = `porttohub:v1:op:${auth.context.operador.id}:benchmark`;
    await cache.set(testKey, JSON.stringify(supData), 60);

    const t1 = Date.now();
    await cache.get(testKey);
    const latenciaRedisMs = Date.now() - t1;

    const ganhoDesempenho =
      latenciaRedisMs > 0
        ? `${(latenciaSupabaseMs / latenciaRedisMs).toFixed(1)}x mais rápido`
        : 'Instantâneo (< 1ms)';

    return jsonResponse({
      sucesso: true,
      latenciaSupabaseMs,
      latenciaRedisMs: Math.max(latenciaRedisMs, 0.5),
      ganhoDesempenho,
      reducaoLatenciaPercentual: `${(((latenciaSupabaseMs - latenciaRedisMs) / Math.max(latenciaSupabaseMs, 1)) * 100).toFixed(1)}%`,
      itensRetornados: Array.isArray(supData) ? supData.length : 0,
      provider: cache.isConfigured() ? 'upstash-redis-rest' : 'in-memory-fallback'
    });
  } catch (err: any) {
    return jsonResponse({ erro: err?.message || 'Erro ao executar benchmark.' }, 500);
  }
}
