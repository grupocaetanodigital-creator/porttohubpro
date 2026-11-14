/**
 * PorttoHub — Módulo Oficial de Storage
 * Opera exclusivamente com variáveis de ambiente e sessão autenticada.
 */
export {
  DEFAULT_STORAGE_BUCKET,
  obterSupabaseUrl,
  obterSupabaseKey,
  obterStorageBucket,
  isSupabaseConfigurado,
  supabaseStorage
} from './supabase';
