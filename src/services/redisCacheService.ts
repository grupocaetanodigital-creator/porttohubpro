import { supabase, obterAccessTokenAtual } from './supabase';
import { isCondominioIdValido } from './autorizacaoService';

export interface QueryFilter {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'ilike';
  value: any;
}

export interface CachedQueryOptions {
  table: string;
  select?: string;
  filters?: QueryFilter[];
  orderBy?: { field: string; ascending?: boolean };
  limit?: number;
  ttlSeconds?: number;
  forceRefresh?: boolean;
  condominioId?: string;
}

export interface CachedQueryResult<T = any> {
  data: T;
  cached: boolean;
  origem: 'client-memory' | 'upstash-redis' | 'redis' | 'memory' | 'supabase';
  latencyMs: number;
  total: number;
}

export interface CacheTelemetry {
  provider: 'upstash-redis-rest' | 'in-memory-fallback' | 'redis-server' | 'in-memory-redis';
  configured?: boolean;
  connected: boolean;
  totalKeys: number;
  hitCount: number;
  missCount: number;
  hitRatio: string;
  totalRequests: number;
  avgLatencyMs: number;
  keysSummary: Record<string, number>;
  horarioServidor?: string;
}

interface ClientMemoryEntry {
  data: any;
  timestamp: number;
  ttlMs: number;
}
const clientMemoryCache = new Map<string, ClientMemoryEntry>();
const inflightQueries = new Map<string, Promise<any>>();

function resolverCondoDeOpcoes(options: CachedQueryOptions): string {
  const filterCondo = (options.filters || []).find(f => f.field === 'condominio_id' && f.op === 'eq')?.value;
  const candidate = options.condominioId || (filterCondo ? String(filterCondo) : '');
  return isCondominioIdValido(candidate) ? String(candidate).trim() : '';
}

function buildClientKey(options: CachedQueryOptions): string {
  const normSelect = (options.select || '*').replace(/\s+/g, '');
  const normFilters = (options.filters || [])
    .map(f => `${f.field}:${f.op}:${f.value}`)
    .sort()
    .join('|');
  const normOrder = options.orderBy ? `${options.orderBy.field}:${options.orderBy.ascending ? 'asc' : 'desc'}` : '';
  const normLimit = options.limit ? `limit:${options.limit}` : '';
  const resolvedCondoId = resolverCondoDeOpcoes(options);
  const condoPart = resolvedCondoId ? `condo:${resolvedCondoId}` : 'global';
  return `l1:${options.table}:${condoPart}:${normSelect}:${normFilters}:${normOrder}:${normLimit}`;
}

async function getAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string> | null> {
  const token = await obterAccessTokenAtual();
  if (!token) return null;
  return {
    ...extra,
    Authorization: `Bearer ${token}`
  };
}

/**
 * Consulta Otimizada com Camadas Multi-Tier de Cache autenticadas com JWT:
 * L1: Memória RAM do Navegador (0ms)
 * L2: Backend Upstash Redis REST (/api/cache/query com Bearer JWT)
 * L3: Supabase PostgREST direto via sessão do usuário (RLS aplicado)
 */
export async function cachedQuery<T = any[]>(options: CachedQueryOptions): Promise<T> {
  const resolvedCondo = resolverCondoDeOpcoes(options);
  if (options.table !== 'condominios' && !resolvedCondo) {
    throw new Error(`Consulta bloqueada: condominioId válido é obrigatório para "${options.table}".`);
  }

  const clientKey = buildClientKey(options);
  const ttlMs = (options.ttlSeconds || 180) * 1000;

  if (!options.forceRefresh) {
    const mem = clientMemoryCache.get(clientKey);
    if (mem && Date.now() - mem.timestamp < mem.ttlMs) {
      return mem.data as T;
    }
  }

  if (inflightQueries.has(clientKey)) {
    return inflightQueries.get(clientKey) as Promise<T>;
  }

  const queryPromise = (async () => {
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      if (headers) {
        const response = await fetch('/api/cache/query', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...options, condominioId: resolvedCondo || undefined })
        });

        if (response.ok) {
          const result: CachedQueryResult<T> = await response.json();
          if (result && result.data !== undefined) {
            clientMemoryCache.set(clientKey, {
              data: result.data,
              timestamp: Date.now(),
              ttlMs
            });
            return result.data;
          }
        }
      }
    } catch (apiErr) {
      console.warn('[Cache] Falha ao comunicar com /api/cache/query, executando fallback Supabase:', apiErr);
    }

    // Fallback L3 direto no Supabase com RLS da sessão atual
    let q = supabase.from(options.table).select(options.select || '*');
    if (options.filters) {
      for (const f of options.filters) {
        if (!f.field || f.value === undefined) continue;
        if (f.op === 'eq') q = q.eq(f.field, f.value);
        else if (f.op === 'neq') q = q.neq(f.field, f.value);
        else if (f.op === 'in') q = q.in(f.field, Array.isArray(f.value) ? f.value : [f.value]);
        else if (f.op === 'gte') q = q.gte(f.field, f.value);
        else if (f.op === 'lte') q = q.lte(f.field, f.value);
        else if (f.op === 'ilike') q = q.ilike(f.field, `%${f.value}%`);
      }
    }
    if (options.table !== 'condominios' && resolvedCondo && !(options.filters || []).some(f => f.field === 'condominio_id')) {
      q = q.eq('condominio_id', resolvedCondo);
    }
    if (options.orderBy) {
      q = q.order(options.orderBy.field, { ascending: options.orderBy.ascending ?? true });
    }
    if (options.limit) {
      q = q.limit(options.limit);
    }

    const { data, error } = await q;
    if (error) throw error;

    const dadosFinais = (data || []) as T;
    clientMemoryCache.set(clientKey, {
      data: dadosFinais,
      timestamp: Date.now(),
      ttlMs
    });
    return dadosFinais;
  })();

  inflightQueries.set(clientKey, queryPromise);
  try {
    return await queryPromise;
  } finally {
    inflightQueries.delete(clientKey);
  }
}

export async function invalidarCacheTabela(table: string, condominioId?: string): Promise<void> {
  const condoValido = isCondominioIdValido(condominioId) ? String(condominioId).trim() : undefined;

  for (const k of Array.from(clientMemoryCache.keys())) {
    if (k.startsWith(`l1:${table}:`)) {
      if (!condoValido || k.includes(`:condo:${condoValido}:`) || !k.includes(':condo:')) {
        clientMemoryCache.delete(k);
      }
    }
  }
  for (const k of Array.from(inflightQueries.keys())) {
    if (k.startsWith(`l1:${table}:`)) {
      if (!condoValido || k.includes(`:condo:${condoValido}:`) || !k.includes(':condo:')) {
        inflightQueries.delete(k);
      }
    }
  }

  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    if (!headers) return;
    await fetch('/api/cache/invalidate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ table, condominioId: condoValido })
    });
  } catch (err) {
    console.warn('[Cache Invalidate] Aviso ao invalidar no backend:', err);
  }
}

export async function invalidarCacheCondominio(condominioId: string): Promise<void> {
  clientMemoryCache.clear();
  inflightQueries.clear();
  if (!isCondominioIdValido(condominioId)) return;

  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    if (!headers) return;
    await fetch('/api/cache/invalidate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ condominioId })
    });
  } catch {}
}

export async function limparTodoCache(): Promise<void> {
  clientMemoryCache.clear();
  inflightQueries.clear();
  try {
    const headers = await getAuthHeaders();
    if (!headers) return;
    await fetch('/api/cache/clear', { method: 'POST', headers });
  } catch {}
}

export async function aquecerCacheCondominio(condominioId?: string): Promise<any> {
  if (!isCondominioIdValido(condominioId)) {
    return { sucesso: false, erro: 'Condomínio válido obrigatório para pré-aquecimento.' };
  }
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    if (!headers) return { sucesso: false, erro: 'Sessão não autenticada.' };
    const res = await fetch('/api/cache/warmup', {
      method: 'POST',
      headers,
      body: JSON.stringify({ condominioId })
    });
    return await res.json();
  } catch (e: any) {
    return { sucesso: false, erro: e.message };
  }
}

export async function obterEstatisticasCache(): Promise<CacheTelemetry | null> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) return null;
    const res = await fetch('/api/cache/stats', { headers });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}

export async function executarBenchmarkVelocidade(): Promise<{
  latenciaSupabaseMs: number;
  latenciaRedisMs: number;
  ganhoDesempenho: string;
  reducaoLatenciaPercentual: string;
  itensRetornados: number;
  provider?: string;
}> {
  const headers = await getAuthHeaders();
  if (!headers) {
    throw new Error('Autenticação obrigatória para executar o benchmark.');
  }
  const res = await fetch('/api/cache/benchmark', { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.erro || 'Falha ao executar benchmark no servidor.');
  }
  return json;
}
