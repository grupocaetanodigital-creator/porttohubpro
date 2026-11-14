/**
 * PorttoHub — Bridge de Compatibilidade
 * Redireciona chamadas para o cliente oficial Supabase configurado via ambiente.
 */
export * from './supabase';
export { supabase as firebaseDb } from './supabase';
