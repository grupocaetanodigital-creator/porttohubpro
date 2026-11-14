/**
 * Cliente Redis REST compatível com Cloudflare Workers (Web fetch) e Node.js (server.ts).
 * Usa Upstash Redis REST API quando `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
 * estão configurados; caso contrário opera com cache LRU em memória local e reporta
 * `configured: false` e `connected: false` de forma honesta.
 */

export interface RuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_OCR_MODEL?: string;
  GITHUB_TOKEN?: string;
  APP_URL?: string;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  [key: string]: any;
}

export interface UpstashCacheStats {
  provider: 'upstash-redis-rest' | 'in-memory-fallback';
  configured: boolean;
  connected: boolean;
  totalKeys: number;
  hitCount: number;
  missCount: number;
  hitRatio: string;
  totalRequests: number;
  avgLatencyMs: number;
  lastConnectedAt?: string;
  keysSummary: Record<string, number>;
}

class BoundedMemoryStore {
  private store = new Map<string, { value: string; expiresAt?: number; tags?: string[] }>();
  private tagIndex = new Map<string, Set<string>>();
  private readonly maxCapacity: number;

  constructor(maxCapacity: number = 2500) {
    this.maxCapacity = maxCapacity;
  }

  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.del(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number, tags: string[] = []): void {
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined;
    if (this.store.size >= this.maxCapacity && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.del(oldest);
    }
    this.store.delete(key);
    this.store.set(key, { value, expiresAt, tags });

    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(key);
    }
  }

  del(key: string): number {
    const entry = this.store.get(key);
    if (entry?.tags) {
      for (const tag of entry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }
    return this.store.delete(key) ? 1 : 0;
  }

  delByTag(tag: string): number {
    const set = this.tagIndex.get(tag);
    if (!set || set.size === 0) return 0;
    let count = 0;
    for (const k of Array.from(set)) {
      if (this.del(k)) count++;
    }
    this.tagIndex.delete(tag);
    return count;
  }

  keys(pattern: string): string[] {
    const now = Date.now();
    const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const out: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.del(key);
        continue;
      }
      if (regex.test(key)) out.push(key);
    }
    return out;
  }

  flush(): void {
    this.store.clear();
    this.tagIndex.clear();
  }

  size(): number {
    return this.store.size;
  }
}

const memoryStore = new BoundedMemoryStore();
let metricHits = 0;
let metricMisses = 0;
let metricRequests = 0;
let metricLatencyTotalMs = 0;
let lastUpstashOkAt: string | undefined;

function getUpstashCreds(env: RuntimeEnv): { url: string; token: string; configured: boolean } {
  const url = String(env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return {
    url,
    token,
    configured: Boolean(url && token && url.startsWith('http'))
  };
}

async function execUpstashCommand(
  env: RuntimeEnv,
  command: Array<string | number>
): Promise<{ ok: boolean; result: any }> {
  const { url, token, configured } = getUpstashCreds(env);
  if (!configured) return { ok: false, result: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command),
      signal: controller.signal
    });
    if (!resp.ok) return { ok: false, result: null };
    const json: any = await resp.json();
    lastUpstashOkAt = new Date().toISOString();
    return { ok: true, result: json?.result ?? null };
  } catch {
    return { ok: false, result: null };
  } finally {
    clearTimeout(timer);
  }
}

async function execUpstashPipeline(
  env: RuntimeEnv,
  commands: Array<Array<string | number>>
): Promise<{ ok: boolean; results: any[] }> {
  const { url, token, configured } = getUpstashCreds(env);
  if (!configured || commands.length === 0) return { ok: false, results: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands),
      signal: controller.signal
    });
    if (!resp.ok) return { ok: false, results: [] };
    const json: any = await resp.json();
    lastUpstashOkAt = new Date().toISOString();
    return { ok: true, results: Array.isArray(json) ? json.map((x: any) => x?.result) : [] };
  } catch {
    return { ok: false, results: [] };
  } finally {
    clearTimeout(timer);
  }
}

export function buildTenantCacheKey(params: {
  table: string;
  condominioId?: string;
  operadorScope?: string;
  select?: string;
  filters?: any[];
  orderBy?: any;
  limit?: number;
}): string {
  const normSelect = (params.select || '*').replace(/\s+/g, '');
  const normFilters = (params.filters || [])
    .map(f => `${f.field}:${f.op}:${Array.isArray(f.value) ? f.value.join(',') : f.value}`)
    .sort()
    .join('|');
  const normOrder = params.orderBy ? `${params.orderBy.field}:${params.orderBy.ascending ? 'asc' : 'desc'}` : '';
  const normLimit = params.limit ? `limit:${params.limit}` : '';
  const raw = `${params.table}__${normSelect}__${normFilters}__${normOrder}__${normLimit}`;

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const hashStr = Math.abs(hash).toString(36);

  if (params.condominioId) {
    return `porttohub:v1:condo:${params.condominioId}:${params.table}:${hashStr}`;
  }
  if (params.operadorScope) {
    return `porttohub:v1:op:${params.operadorScope}:${params.table}:${hashStr}`;
  }
  return `porttohub:v1:global:${params.table}:${hashStr}`;
}

export function createUpstashCache(env: RuntimeEnv) {
  const creds = getUpstashCreds(env);

  return {
    isConfigured(): boolean {
      return creds.configured;
    },

    async get(key: string): Promise<string | null> {
      const start = Date.now();
      metricRequests++;

      if (creds.configured) {
        const res = await execUpstashCommand(env, ['GET', key]);
        const elapsed = Date.now() - start;
        metricLatencyTotalMs += elapsed;
        if (res.ok && typeof res.result === 'string') {
          metricHits++;
          return res.result;
        }
        if (res.ok) {
          metricMisses++;
          return null;
        }
      }

      const memVal = memoryStore.get(key);
      metricLatencyTotalMs += Date.now() - start;
      if (memVal !== null) {
        metricHits++;
      } else {
        metricMisses++;
      }
      return memVal;
    },

    async set(key: string, value: string, ttlSeconds: number = 180, tags: string[] = []): Promise<void> {
      const ttl = ttlSeconds > 0 ? Math.min(ttlSeconds, 3600) : 180;
      memoryStore.set(key, value, ttl, tags);

      if (creds.configured) {
        const cmds: Array<Array<string | number>> = [['SET', key, value, 'EX', ttl]];
        for (const tag of tags) {
          const tagKey = `porttohub:v1:tag:${tag}`;
          cmds.push(['SADD', tagKey, key]);
          cmds.push(['EXPIRE', tagKey, ttl + 60]);
        }
        await execUpstashPipeline(env, cmds);
      }
    },

    async invalidateByTag(tag: string): Promise<number> {
      let count = memoryStore.delByTag(tag);
      if (creds.configured) {
        const tagKey = `porttohub:v1:tag:${tag}`;
        const membersRes = await execUpstashCommand(env, ['SMEMBERS', tagKey]);
        const keys = Array.isArray(membersRes.result) ? membersRes.result : [];
        if (keys.length > 0) {
          const delRes = await execUpstashCommand(env, ['DEL', ...keys, tagKey]);
          count += Number(delRes.result || 0);
        } else {
          await execUpstashCommand(env, ['DEL', tagKey]);
        }
      }
      return count;
    },

    async invalidateByPattern(pattern: string): Promise<number> {
      let count = 0;
      for (const k of memoryStore.keys(pattern)) {
        count += memoryStore.del(k);
      }

      if (creds.configured) {
        let cursor = '0';
        let rounds = 0;
        do {
          const scanRes = await execUpstashCommand(env, ['SCAN', cursor, 'MATCH', pattern, 'COUNT', 100]);
          if (!scanRes.ok || !Array.isArray(scanRes.result)) break;
          cursor = String(scanRes.result[0] || '0');
          const keys = Array.isArray(scanRes.result[1]) ? scanRes.result[1] : [];
          if (keys.length > 0) {
            const delRes = await execUpstashCommand(env, ['DEL', ...keys]);
            count += Number(delRes.result || 0);
          }
          rounds++;
        } while (cursor !== '0' && rounds < 20);
      }
      return count;
    },

    async flush(): Promise<void> {
      memoryStore.flush();
      metricHits = 0;
      metricMisses = 0;
      metricRequests = 0;
      metricLatencyTotalMs = 0;

      if (creds.configured) {
        await this.invalidateByPattern('porttohub:*');
      }
    },

    async ping(): Promise<{ connected: boolean; latencyMs: number }> {
      if (!creds.configured) return { connected: false, latencyMs: 0 };
      const t0 = Date.now();
      const res = await execUpstashCommand(env, ['PING']);
      return {
        connected: Boolean(res.ok && res.result === 'PONG'),
        latencyMs: Date.now() - t0
      };
    },

    async getStats(): Promise<UpstashCacheStats> {
      let connected = false;
      let remoteKeysCount = 0;
      const summary: Record<string, number> = {};

      if (creds.configured) {
        const ping = await execUpstashCommand(env, ['PING']);
        connected = Boolean(ping.ok && ping.result === 'PONG');
        if (connected) {
          const scanRes = await execUpstashCommand(env, ['SCAN', '0', 'MATCH', 'porttohub:*', 'COUNT', 200]);
          if (scanRes.ok && Array.isArray(scanRes.result) && Array.isArray(scanRes.result[1])) {
            const keys: string[] = scanRes.result[1];
            remoteKeysCount = keys.length;
            for (const k of keys) {
              const parts = k.split(':');
              const cat = parts[4] || parts[2] || 'outros';
              summary[cat] = (summary[cat] || 0) + 1;
            }
          }
        }
      }

      if (!connected) {
        for (const k of memoryStore.keys('*')) {
          const parts = k.split(':');
          const cat = parts[4] || parts[2] || 'outros';
          summary[cat] = (summary[cat] || 0) + 1;
        }
      }

      const totalReq = metricRequests || (metricHits + metricMisses);
      const hitRatio = totalReq > 0 ? ((metricHits / totalReq) * 100).toFixed(1) + '%' : '0.0%';
      const avgLatencyMs = totalReq > 0 ? Number((metricLatencyTotalMs / totalReq).toFixed(2)) : 0;

      return {
        provider: creds.configured && connected ? 'upstash-redis-rest' : 'in-memory-fallback',
        configured: creds.configured,
        connected,
        totalKeys: connected ? remoteKeysCount : memoryStore.size(),
        hitCount: metricHits,
        missCount: metricMisses,
        hitRatio,
        totalRequests: totalReq,
        avgLatencyMs,
        lastConnectedAt: lastUpstashOkAt,
        keysSummary: summary
      };
    }
  };
}
