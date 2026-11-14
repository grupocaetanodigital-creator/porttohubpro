import { createClient } from '@supabase/supabase-js';
import { cachedQuery } from './redisCacheService';

export const DEFAULT_STORAGE_BUCKET = 'encomendas';

const PLACEHOLDER_URL = 'https://configuracao-pendente.supabase.co';
const PLACEHOLDER_KEY = 'configuracao-pendente-anon-key';

// Acesso estático literal exigido pelo Vite para substituição em build de produção
const VITE_SUPABASE_URL_STATIC: unknown =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_SUPABASE_URL
    : undefined;

const VITE_SUPABASE_ANON_KEY_STATIC: unknown =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_SUPABASE_ANON_KEY
    : undefined;

function limparValorEnv(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

function lerProcessEnv(nome: 'VITE_SUPABASE_URL' | 'SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'SUPABASE_ANON_KEY'): string {
  if (typeof process !== 'undefined' && process.env && typeof process.env[nome] === 'string') {
    return process.env[nome]!.trim();
  }
  return '';
}

function mascararChaveAnon(chave: string): string {
  if (!chave) return '(não definida)';
  if (chave.length <= 16) return '*** (inválida / curta demais)';
  return `${chave.slice(0, 12)}...${chave.slice(-6)} (${chave.length} caracteres)`;
}

/**
 * Resolve a URL do Supabase exclusivamente via variáveis de ambiente.
 * Prioriza acesso estático a import.meta.env.VITE_SUPABASE_URL.
 */
export function obterSupabaseUrl(): string {
  const envUrl =
    limparValorEnv(VITE_SUPABASE_URL_STATIC) ||
    lerProcessEnv('VITE_SUPABASE_URL') ||
    lerProcessEnv('SUPABASE_URL');
  if (envUrl && envUrl.startsWith('http') && !envUrl.includes('configuracao-pendente')) {
    return envUrl.replace(/\/+$/, '');
  }
  return '';
}

/**
 * Resolve a Chave Pública (anon/publishable) do Supabase exclusivamente via variáveis de ambiente.
 * Prioriza acesso estático a import.meta.env.VITE_SUPABASE_ANON_KEY.
 */
export function obterSupabaseKey(): string {
  const envKey =
    limparValorEnv(VITE_SUPABASE_ANON_KEY_STATIC) ||
    lerProcessEnv('VITE_SUPABASE_ANON_KEY') ||
    lerProcessEnv('SUPABASE_ANON_KEY');
  if (envKey && envKey.length > 20 && !envKey.includes('configuracao-pendente')) {
    return envKey;
  }
  return '';
}

export function isSupabaseConfigurado(): boolean {
  return Boolean(obterSupabaseUrl() && obterSupabaseKey());
}

export function obterErroConfiguracaoSupabase(): string | null {
  if (!obterSupabaseUrl()) {
    return 'Variável VITE_SUPABASE_URL não configurada ou inválida neste ambiente.';
  }
  if (!obterSupabaseKey()) {
    return 'Variável VITE_SUPABASE_ANON_KEY não configurada ou inválida neste ambiente.';
  }
  return null;
}

/**
 * Formata erros de Auth, PostgREST (RLS/SQL) e rede do Supabase preservando
 * código, status HTTP e mensagem exata retornada pelo Supabase.
 */
export function formatarErroDetalhadoSupabase(err: any, contexto?: string): string {
  const prefixo = contexto ? `${contexto}: ` : '';
  if (!err) return `${prefixo}Erro desconhecido retornado pelo Supabase.`;

  const msg = String(err.message || err.error_description || err.error || err.msg || '').trim();
  const code = err.code ? String(err.code) : '';
  const status = err.status !== undefined && err.status !== null ? Number(err.status) : null;
  const details = err.details ? String(err.details).trim() : '';
  const hint = err.hint ? String(err.hint).trim() : '';

  const lower = msg.toLowerCase();
  const detalheTecnico = [
    status ? `HTTP ${status}` : '',
    code ? `Código: ${code}` : '',
    msg || 'Sem mensagem',
    details ? `Detalhes: ${details}` : '',
    hint ? `Dica: ${hint}` : ''
  ]
    .filter(Boolean)
    .join(' | ');

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('fetch') && lower.includes('error')
  ) {
    return `${prefixo}Erro de rede ao conectar no Supabase (${obterSupabaseUrl() || 'URL ausente'}). Detalhe exato: ${detalheTecnico}`;
  }

  if (lower.includes('invalid api key') || lower.includes('no api key found') || lower.includes('apikey')) {
    return `${prefixo}Chave anon do Supabase inválida ou ausente (VITE_SUPABASE_ANON_KEY). Detalhe exato: ${detalheTecnico}`;
  }

  if (lower.includes('email not confirmed')) {
    return `${prefixo}E-mail ainda não confirmado no Supabase Auth (Authentication -> Users). Detalhe exato: ${detalheTecnico}`;
  }

  if (
    code === '42501' ||
    code === 'PGRST301' ||
    lower.includes('row-level security') ||
    lower.includes('permission denied')
  ) {
    return `${prefixo}Acesso bloqueado por política RLS ou permissão do banco. Detalhe exato: ${detalheTecnico}`;
  }

  if (code === '42P01' || code === 'PGRST205' || lower.includes('does not exist') || lower.includes('schema cache')) {
    return `${prefixo}Tabela ou coluna ausente no banco Supabase (execute os scripts SQL na ordem). Detalhe exato: ${detalheTecnico}`;
  }

  if (lower.includes('invalid login credentials')) {
    return `${prefixo}Credenciais rejeitadas pelo Supabase Auth. Detalhe exato: ${detalheTecnico}`;
  }

  return `${prefixo}${detalheTecnico}`;
}

export function obterStorageBucket(): string {
  return DEFAULT_STORAGE_BUCKET;
}

export function obterConfiguracaoPooler() {
  const url = obterSupabaseUrl();
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match ? match[1] : 'nao-configurado';

  return {
    projectRef,
    portaPoolerTransacao: 6543,
    portaPoolerSessao: 5432,
    hostPoolerPadrao: `aws-0-sa-east-1.pooler.supabase.com`,
    parametroPgBouncer: '?pgbouncer=true',
    modoRecomendado: 'Transaction Mode (Port 6543)'
  };
}

const urlResolvida = obterSupabaseUrl();
const keyResolvida = obterSupabaseKey();
const urlInicial = urlResolvida || PLACEHOLDER_URL;
const keyInicial = keyResolvida || PLACEHOLDER_KEY;

// Log de depuração na inicialização para confirmar carregamento de VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
if (typeof window !== 'undefined') {
  console.log('[PorttoHub][Supabase Init] Diagnóstico de inicialização:', {
    viteSupabaseUrlCarregada: Boolean(urlResolvida),
    supabaseUrl: urlResolvida || '(NÃO CONFIGURADA — usando placeholder)',
    viteSupabaseAnonKeyCarregada: Boolean(keyResolvida),
    supabaseAnonKeyPreview: mascararChaveAnon(keyResolvida),
    origemUrl: limparValorEnv(VITE_SUPABASE_URL_STATIC)
      ? 'import.meta.env.VITE_SUPABASE_URL'
      : lerProcessEnv('VITE_SUPABASE_URL') || lerProcessEnv('SUPABASE_URL')
        ? 'process.env'
        : 'ausente',
    origemKey: limparValorEnv(VITE_SUPABASE_ANON_KEY_STATIC)
      ? 'import.meta.env.VITE_SUPABASE_ANON_KEY'
      : lerProcessEnv('VITE_SUPABASE_ANON_KEY') || lerProcessEnv('SUPABASE_ANON_KEY')
        ? 'process.env'
        : 'ausente',
    clientePronto: Boolean(urlResolvida && keyResolvida)
  });

  if (!urlResolvida || !keyResolvida) {
    console.error(
      '[PorttoHub][Supabase Init] ATENÇÃO: Variáveis VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não foram carregadas corretamente no build/ambiente.'
    );
  }
}

/**
 * Cliente Oficial Dedicado do Supabase para Banco de Dados, Auth, Storage e Realtime
 */
export const supabase = createClient(urlInicial, keyInicial, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'porttohub-localfirst-pwa'
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

/**
 * Cliente Storage compartilha a sessão autenticada do usuário para operar
 * com segurança em buckets privados via RLS e URLs assinadas.
 */
export const supabaseStorage = supabase;

export function obterStatusConexaoBanco() {
  const urlAtual = obterSupabaseUrl();
  const match = urlAtual.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectId = match ? match[1] : 'nao-configurado';
  return {
    url: urlAtual,
    tipo: 'supabase' as const,
    projectId,
    configurado: isSupabaseConfigurado(),
    customizado: false
  };
}

export function limparConfiguracaoOCI(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('porttohub_supabase_url');
    window.localStorage.removeItem('porttohub_supabase_key');
    window.localStorage.removeItem('porttohub_supabase_bucket');
  }
}

export function resolveApiUrl(): string { return obterSupabaseUrl(); }
export function resolveApiKey(): string { return obterSupabaseKey(); }

/**
 * Retorna o access_token JWT atual do Supabase Auth para autenticar chamadas ao backend.
 */
export async function obterAccessTokenAtual(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Cliente Inteligente com Suporte a Cache Remoto para Aceleração de Consultas
 */
export const supabaseCached = {
  from: (table: string) => {
    let selectFields = '*';
    const filters: Array<{ field: string; op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'ilike'; value: any }> = [];
    let orderByOpt: { field: string; ascending?: boolean } | undefined;
    let limitCount: number | undefined;
    let ttlSecs = 180;
    let condoId: string | undefined;

    const builder = {
      select: (fields: string = '*') => {
        selectFields = fields;
        return builder;
      },
      eq: (field: string, value: any) => {
        filters.push({ field, op: 'eq', value });
        if (field === 'condominio_id') condoId = String(value);
        return builder;
      },
      neq: (field: string, value: any) => {
        filters.push({ field, op: 'neq', value });
        return builder;
      },
      in: (field: string, values: any[]) => {
        filters.push({ field, op: 'in', value: values });
        return builder;
      },
      order: (field: string, opts?: { ascending?: boolean }) => {
        orderByOpt = { field, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit: (count: number) => {
        limitCount = count;
        return builder;
      },
      ttl: (seconds: number) => {
        ttlSecs = seconds;
        return builder;
      },
      async execute<T = any[]>(): Promise<{ data: T | null; error: any }> {
        try {
          const data = await cachedQuery<T>({
            table,
            select: selectFields,
            filters,
            orderBy: orderByOpt,
            limit: limitCount,
            ttlSeconds: ttlSecs,
            condominioId: condoId
          });
          return { data, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      }
    };

    return builder;
  }
};
