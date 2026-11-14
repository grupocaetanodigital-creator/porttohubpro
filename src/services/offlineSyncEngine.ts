/**
 * INFPORT / PorttoHub — Motor de Trabalho Offline e Sincronização Automática Segura
 *
 * Garante operação contínua offline com:
 * - Chave de idempotência (`operation_id`) para evitar duplicações em retries
 * - Vínculo obrigatório de `condominio_id` e `operador_id` em cada ação enfileirada
 * - Espelhamento persistente na store `offline_queue` do IndexedDB (resiste limpeza de cache de leitura)
 * - Validação estrita de sessão autenticada, operador e tenant antes de sincronizar cada item
 * - Marcação automática de conflito caso o operador/condomínio ativo não corresponda ao item da fila
 */

import { supabase } from './supabase';
import {
  isUUID,
  getCondominioConfigLocal,
  isEstruturaNumeralDireto,
  saoUnidadesEquivalentes,
  saoBlocosEquivalentes
} from './condominioService';
import { invalidarCacheTabela } from './redisCacheService';
import { isCondominioIdValido, temAcessoGlobalExplicito } from './autorizacaoService';
import { salvarFilaOfflineIndexedDb, lerFilaOfflineIndexedDb } from './porttoHubDb';

export type EstadoAcaoOffline = 'pendente' | 'sincronizando' | 'conflito' | 'erro';

export interface AcaoOffline {
  id: string;
  operation_id: string;
  condominio_id?: string;
  operador_id?: string;
  estado: EstadoAcaoOffline;
  motivoConflito?: string;
  tabela: string;
  tipo: 'INSERT' | 'UPDATE' | 'DELETE';
  dados: any;
  criadoEm: string;
  tentativas: number;
  descricaoAmigavel: string;
}

const CHAVE_FILA_OFFLINE = 'infport_fila_acoes_offline_v1';
const CHAVE_STATUS_CACHE = 'infport_cache_autonomia_3h_v1';

function gerarOperationIdLocal(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `op_${crypto.randomUUID()}`;
    }
  } catch {
    // Fallback abaixo
  }
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function obterOperadorAtivoMemoria(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any).__operadorAtivo || null;
}

function obterCondominioAtivoMemoria(): string {
  if (typeof window === 'undefined') return '';
  const winId = (window as any).idCondominioAtivo;
  if (isCondominioIdValido(winId)) return String(winId).trim();
  try {
    const lsId = localStorage.getItem('infport_condominio_ativo_id');
    if (isCondominioIdValido(lsId)) return String(lsId).trim();
  } catch {}
  return '';
}

function persistirFilaEspelhada(fila: AcaoOffline[]): void {
  try {
    localStorage.setItem(CHAVE_FILA_OFFLINE, JSON.stringify(fila));
  } catch (err) {
    console.warn('[OfflineSyncEngine] Erro ao persistir fila no localStorage:', err);
  }
  salvarFilaOfflineIndexedDb(fila).catch(() => {});
}

async function validarEncomendaParaSyncSupabase(
  payload: any,
  tipoOperacao: 'INSERT' | 'UPDATE'
): Promise<{ valido: boolean; erro?: string; payloadSaneado?: any }> {
  const condominioId = String(payload?.condominio_id || '').trim();
  const unidade = String(payload?.unidade || '').trim();
  const bloco = String(payload?.bloco || '').trim();
  const moradorId = payload?.morador_id ? String(payload.morador_id).trim() : '';

  if (tipoOperacao === 'UPDATE' && !unidade && !('morador_id' in (payload || {}))) {
    return { valido: true, payloadSaneado: payload };
  }

  if (!condominioId || !isUUID(condominioId) || !unidade) {
    return { valido: false, erro: 'Condomínio ou unidade ausente na encomenda offline.' };
  }

  let tipoEstrutura = getCondominioConfigLocal(condominioId)?.tipo_estrutura;
  if (!tipoEstrutura) {
    try {
      const { data: condoData } = await supabase
        .from('condominios')
        .select('tipo_estrutura')
        .eq('id', condominioId)
        .maybeSingle();
      if (condoData?.tipo_estrutura) tipoEstrutura = condoData.tipo_estrutura;
    } catch {}
  }

  const eCasas = Boolean(tipoEstrutura && tipoEstrutura.toLowerCase().includes('casa'));
  const eNumeral = Boolean(tipoEstrutura && isEstruturaNumeralDireto(tipoEstrutura));
  if (!eCasas && !eNumeral && !bloco) {
    return { valido: false, erro: 'Bloco/Torre ausente na encomenda offline.' };
  }

  if (moradorId) {
    const { data: mor, error } = await supabase
      .from('moradores')
      .select('id, condominio_id, nome, bloco, unidade')
      .eq('id', moradorId)
      .eq('condominio_id', condominioId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao validar morador no servidor: ${error.message}`);
    }
    if (!mor) {
      return { valido: false, erro: 'Morador vinculado não existe neste condomínio.' };
    }
    if (!saoUnidadesEquivalentes(mor.unidade, unidade) || !saoBlocosEquivalentes(mor.bloco, eCasas ? (bloco || 'Casa') : bloco, tipoEstrutura)) {
      return {
        valido: false,
        erro: `Inconsistência: morador "${mor.nome}" não pertence à unidade ${bloco ? bloco + ' - ' : ''}${unidade}.`
      };
    }

    return {
      valido: true,
      payloadSaneado: {
        ...payload,
        morador_id: mor.id,
        destinatario: mor.nome
      }
    };
  }

  const { data: moradoresCondo, error: errMor } = await supabase
    .from('moradores')
    .select('id, condominio_id, nome, bloco, unidade')
    .eq('condominio_id', condominioId);

  if (errMor) {
    throw new Error(`Erro ao consultar moradores da unidade: ${errMor.message}`);
  }

  const daUnidade = (moradoresCondo || []).filter(
    (m: any) =>
      saoUnidadesEquivalentes(m.unidade, unidade) &&
      saoBlocosEquivalentes(m.bloco, eCasas ? (bloco || 'Casa') : bloco, tipoEstrutura)
  );

  if (daUnidade.length > 1) {
    return {
      valido: false,
      erro: `Unidade ${unidade} possui ${daUnidade.length} moradores; destinatário não especificado.`
    };
  }

  if (daUnidade.length === 1) {
    return {
      valido: true,
      payloadSaneado: {
        ...payload,
        morador_id: daUnidade[0].id,
        destinatario: daUnidade[0].nome
      }
    };
  }

  return {
    valido: true,
    payloadSaneado: {
      ...payload,
      morador_id: null,
      destinatario: null
    }
  };
}

/**
 * Registra uma ação executada em modo offline ou após falha de rede
 */
export function enfileirarAcaoOffline(
  tabela: string,
  tipo: 'INSERT' | 'UPDATE' | 'DELETE',
  dados: any,
  descricaoAmigavel: string = 'Operação da Portaria'
): AcaoOffline {
  const opAtivo = obterOperadorAtivoMemoria();
  const condoResolvido = isCondominioIdValido(dados?.condominio_id)
    ? String(dados.condominio_id).trim()
    : obterCondominioAtivoMemoria();
  const operationId = String(dados?.operation_id || gerarOperationIdLocal());

  const acao: AcaoOffline = {
    id: 'offline_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    operation_id: operationId,
    condominio_id: condoResolvido || undefined,
    operador_id: opAtivo?.id ? String(opAtivo.id) : undefined,
    estado: 'pendente',
    tabela,
    tipo,
    dados: typeof dados === 'object' && dados !== null ? { ...dados, condominio_id: dados.condominio_id || condoResolvido } : dados,
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    descricaoAmigavel
  };

  try {
    const filaAtual = obterFilaOffline();
    const duplicada = filaAtual.some(a => a.operation_id === operationId);
    if (!duplicada) {
      filaAtual.push(acao);
      persistirFilaEspelhada(filaAtual);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('infport_fila_atualizada', { detail: { total: filaAtual.length, novaAcao: acao } }));
    }
    console.log(`[OfflineSyncEngine] Ação salva localmente (${filaAtual.length} pendente(s)): ${descricaoAmigavel}`);
  } catch (err) {
    console.warn('[OfflineSyncEngine] Erro ao persistir ação offline:', err);
  }

  return acao;
}

/**
 * Hidrata a fila offline do IndexedDB (`offline_queue`) caso localStorage tenha sido limpo
 */
export async function hidratarFilaOfflineDeIndexedDb(): Promise<AcaoOffline[]> {
  try {
    const doIdb = await lerFilaOfflineIndexedDb();
    const doLs = obterFilaOffline();

    const mapa = new Map<string, AcaoOffline>();
    for (const item of [...doIdb, ...doLs]) {
      const opId = item?.operation_id || item?.id;
      if (!opId) continue;
      mapa.set(opId, {
        ...item,
        operation_id: opId,
        estado: item.estado || 'pendente'
      });
    }

    const consolidada = Array.from(mapa.values());
    if (consolidada.length !== doLs.length) {
      persistirFilaEspelhada(consolidada);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('infport_fila_atualizada', { detail: { total: consolidada.length } }));
      }
    }
    return consolidada;
  } catch {
    return obterFilaOffline();
  }
}

/**
 * Retorna todas as ações pendentes na fila offline (com normalização para registros legados)
 */
export function obterFilaOffline(): AcaoOffline[] {
  try {
    const raw = localStorage.getItem(CHAVE_FILA_OFFLINE);
    if (raw) {
      const lista = JSON.parse(raw);
      if (Array.isArray(lista)) {
        return lista.map((item: any) => ({
          ...item,
          operation_id: item.operation_id || item.id,
          condominio_id: item.condominio_id || item.dados?.condominio_id,
          estado: item.estado || 'pendente'
        }));
      }
    }
  } catch (err) {
    console.warn('[OfflineSyncEngine] Erro ao ler fila offline:', err);
  }
  return [];
}

/**
 * Remove uma ação da fila offline por ID ou operation_id
 */
export function removerAcaoFila(idOuOperationId: string): void {
  try {
    const filaAtual = obterFilaOffline().filter(
      a => a.id !== idOuOperationId && a.operation_id !== idOuOperationId
    );
    persistirFilaEspelhada(filaAtual);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('infport_fila_atualizada', { detail: { total: filaAtual.length } }));
    }
  } catch (err) {
    console.warn('[OfflineSyncEngine] Erro ao remover ação da fila:', err);
  }
}

/**
 * Limpa toda a fila offline
 */
export function limparFilaOffline(): void {
  try {
    localStorage.removeItem(CHAVE_FILA_OFFLINE);
  } catch {}
  salvarFilaOfflineIndexedDb([]).catch(() => {});
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('infport_fila_atualizada', { detail: { total: 0 } }));
  }
}

/**
 * Sincroniza ações pendentes da fila offline com o Supabase validando sessão, operador e condomínio
 */
export async function sincronizarFilaComSupabase(): Promise<{
  sucessos: number;
  falhas: number;
  conflitos: number;
  restantes: number;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { sucessos: 0, falhas: 0, conflitos: 0, restantes: obterFilaOffline().length };
  }

  await hidratarFilaOfflineDeIndexedDb();
  const fila = obterFilaOffline();
  if (fila.length === 0) {
    return { sucessos: 0, falhas: 0, conflitos: 0, restantes: 0 };
  }

  // Valida sessão Supabase Auth antes de tentar gravar qualquer item
  let sessaoAtiva: any = null;
  try {
    const { data } = await supabase.auth.getSession();
    sessaoAtiva = data?.session || null;
  } catch {}

  if (!sessaoAtiva?.user) {
    console.warn('[OfflineSyncEngine] Sessão autenticada ausente. Sincronização adiada até novo login.');
    return { sucessos: 0, falhas: 0, conflitos: 0, restantes: fila.length };
  }

  const operadorAtivo = obterOperadorAtivoMemoria();
  const condoAtivo = obterCondominioAtivoMemoria();
  const eGlobalAtivo = temAcessoGlobalExplicito(operadorAtivo);

  console.log(`[OfflineSyncEngine] Iniciando sincronização de ${fila.length} ação(ões) com o Supabase...`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('infport_sincronizacao_iniciada', { detail: { total: fila.length } }));
  }

  let sucessos = 0;
  let falhas = 0;
  let conflitos = 0;
  const acoesRestantes: AcaoOffline[] = [];

  for (const acaoOriginal of fila) {
    const acao: AcaoOffline = { ...acaoOriginal };
    const condoAcao = String(acao.condominio_id || acao.dados?.condominio_id || '').trim();

    // 1. Guarda de isolamento multi-tenant: exige condominio_id UUID válido
    if (!isCondominioIdValido(condoAcao) || !isUUID(condoAcao)) {
      acao.estado = 'conflito';
      acao.motivoConflito = 'Ação offline sem condomínio válido identificado.';
      conflitos++;
      acoesRestantes.push(acao);
      continue;
    }

    // 2. Guarda de troca de condomínio: não envia ação de outro condomínio sem contexto autorizado
    if (condoAtivo && condoAcao !== condoAtivo && !eGlobalAtivo) {
      acao.estado = 'conflito';
      acao.motivoConflito = `Condomínio ativo (${condoAtivo}) difere do condomínio da operação offline (${condoAcao}).`;
      conflitos++;
      acoesRestantes.push(acao);
      continue;
    }

    // 3. Guarda de troca de operador: evita atribuir operação offline a outro operador logado
    if (acao.operador_id && operadorAtivo?.id && String(acao.operador_id) !== String(operadorAtivo.id)) {
      acao.estado = 'conflito';
      acao.motivoConflito = 'Operação offline criada por outro operador. Faça login com o operador original para concluir o envio.';
      conflitos++;
      acoesRestantes.push(acao);
      continue;
    }

    try {
      acao.estado = 'sincronizando';
      acao.tentativas += 1;
      let resError: any = null;

      if (acao.tipo === 'INSERT') {
        let payload = { ...acao.dados, condominio_id: condoAcao };
        if (typeof payload.id === 'string' && payload.id.startsWith('offline_')) {
          delete payload.id;
        }

        if (acao.tabela === 'encomendas_itens') {
          if (!payload.operation_id && acao.operation_id) {
            payload.operation_id = acao.operation_id;
          }
          const validacao = await validarEncomendaParaSyncSupabase(payload, 'INSERT');
          if (!validacao.valido) {
            acao.estado = 'conflito';
            acao.motivoConflito = validacao.erro || 'Destinatário inconsistente';
            conflitos++;
            acoesRestantes.push(acao);
            continue;
          }
          payload = validacao.payloadSaneado || payload;

          let { error } = await supabase
            .from('encomendas_itens')
            .upsert([payload], { onConflict: 'operation_id', ignoreDuplicates: true });

          if (
            error &&
            (error.message?.includes('operation_id') ||
              error.message?.includes('on conflict') ||
              (error as any).code === '42703' ||
              (error as any).code === '42P10')
          ) {
            const { operation_id, ...semOpId } = payload;
            const retry = await supabase.from('encomendas_itens').insert([semOpId]);
            error = retry.error;
          }
          resError = error;
          if (!resError) {
            invalidarCacheTabela('encomendas_itens', condoAcao).catch(() => {});
          }
        } else {
          const { error } = await supabase.from(acao.tabela).insert([payload]);
          resError = error;
        }
      } else if (acao.tipo === 'UPDATE') {
        const idAlvo = acao.dados?.id;
        let payload = { ...acao.dados };
        delete payload.id;
        delete payload.condominio_id;

        if (acao.tabela === 'encomendas_itens') {
          const validacao = await validarEncomendaParaSyncSupabase({ ...payload, condominio_id: condoAcao }, 'UPDATE');
          if (!validacao.valido) {
            acao.estado = 'conflito';
            acao.motivoConflito = validacao.erro || 'Atualização inconsistente';
            conflitos++;
            acoesRestantes.push(acao);
            continue;
          }
          payload = validacao.payloadSaneado || payload;
          delete payload.condominio_id;
        }

        if (idAlvo) {
          const { error } = await supabase
            .from(acao.tabela)
            .update(payload)
            .eq('id', idAlvo)
            .eq('condominio_id', condoAcao);
          resError = error;
          if (!error && acao.tabela === 'encomendas_itens') {
            invalidarCacheTabela('encomendas_itens', condoAcao).catch(() => {});
          }
        }
      } else if (acao.tipo === 'DELETE') {
        const idAlvo = acao.dados?.id || acao.dados;
        if (idAlvo) {
          const { error } = await supabase
            .from(acao.tabela)
            .delete()
            .eq('id', idAlvo)
            .eq('condominio_id', condoAcao);
          resError = error;
        }
      }

      if (resError) {
        console.warn(`[OfflineSyncEngine] Erro ao sincronizar ${acao.descricaoAmigavel}:`, resError.message);
        acao.estado = 'erro';
        acao.motivoConflito = resError.message;
        falhas++;
        acoesRestantes.push(acao);
      } else {
        sucessos++;
        console.log(`[OfflineSyncEngine] Sincronizado com sucesso: ${acao.descricaoAmigavel}`);
      }
    } catch (err: any) {
      console.warn(`[OfflineSyncEngine] Exceção na sincronização de ${acao.descricaoAmigavel}:`, err.message);
      acao.estado = 'erro';
      acao.motivoConflito = err.message;
      falhas++;
      acoesRestantes.push(acao);
    }
  }

  persistirFilaEspelhada(acoesRestantes);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('infport_fila_atualizada', { detail: { total: acoesRestantes.length } }));
    window.dispatchEvent(new CustomEvent('infport_sincronizacao_concluida', {
      detail: { sucessos, falhas, conflitos, restantes: acoesRestantes.length }
    }));
  }

  return {
    sucessos,
    falhas,
    conflitos,
    restantes: acoesRestantes.length
  };
}

/**
 * Pré-carrega e mantém em cache local todos os dados essenciais para 3+ horas de autonomia
 */
export async function atualizarCacheAutonomia3Horas(condominioId: string, forcar: boolean = false): Promise<boolean> {
  if (!condominioId || condominioId === 'todos' || condominioId === 'global' || !isUUID(condominioId) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return false;
  }

  if (!forcar) {
    try {
      const statusRaw = localStorage.getItem(CHAVE_STATUS_CACHE);
      if (statusRaw) {
        const status = JSON.parse(statusRaw);
        if (status.condominioId === condominioId && status.atualizadoEm) {
          const decorridoMs = Date.now() - new Date(status.atualizadoEm).getTime();
          if (decorridoMs < 3 * 60 * 60 * 1000) {
            return true;
          }
        }
      }
    } catch {}
  }

  try {
    const [moradoresRes, chavesRes, pontosRes, materiaisRes, custodiaRes] = await Promise.all([
      supabase.from('moradores').select('id, condominio_id, nome, bloco, unidade, telefone, status_acesso, tag_rfid, veiculo_placa, veiculo_modelo').eq('condominio_id', condominioId).order('nome'),
      supabase.from('chaves').select('id, condominio_id, codigo_chave, nome_chave, status, localizacao').eq('condominio_id', condominioId).order('codigo_chave'),
      supabase.from('rondas_pontos').select('id, condominio_id, nome_ponto, ordem, qr_code, nfc_tag, ativo').eq('condominio_id', condominioId).order('nome_ponto'),
      supabase.from('materiais_posto').select('id, condominio_id, nome, quantidade, status, categoria').eq('condominio_id', condominioId).order('nome'),
      supabase.from('custodia').select('id, condominio_id, codigo_custodia, codigo, descricao, fluxo, origem_tipo, origem_unidade, origem_bloco, origem_nome_doc, origem_whats, destino_tipo, destino_unidade, destino_bloco, destino_nome_doc, destino_whats, local_armazenamento, foto_entrada_url, foto_url, status, operador_entrada, created_at, data_hora_entrada').eq('condominio_id', condominioId).in('status', ['Aguardando Retirada', 'Retido', 'Guardado', 'Pendente']).order('created_at', { ascending: false })
    ]);

    const timestamp = new Date().toISOString();

    if (moradoresRes.data) {
      localStorage.setItem(`infport_offline_cache_moradores_${condominioId}`, JSON.stringify({
        timestamp,
        dados: moradoresRes.data
      }));
    }

    if (chavesRes.data) {
      localStorage.setItem(`infport_offline_cache_chaves_${condominioId}`, JSON.stringify({
        timestamp,
        dados: chavesRes.data
      }));
    }

    if (pontosRes.data) {
      localStorage.setItem(`infport_offline_cache_pontos_${condominioId}`, JSON.stringify({
        timestamp,
        dados: pontosRes.data
      }));
    }

    if (materiaisRes.data) {
      localStorage.setItem(`infport_offline_cache_materiais_${condominioId}`, JSON.stringify({
        timestamp,
        dados: materiaisRes.data
      }));
    }

    if (custodiaRes.data) {
      localStorage.setItem(`infport_offline_cache_custodia_ativa_${condominioId}`, JSON.stringify({
        timestamp,
        dados: custodiaRes.data
      }));
    }

    localStorage.setItem(CHAVE_STATUS_CACHE, JSON.stringify({
      condominioId,
      atualizadoEm: timestamp,
      validadeHoras: 3,
      totalMoradores: moradoresRes.data?.length || 0,
      totalChaves: chavesRes.data?.length || 0,
      totalCustodia: custodiaRes.data?.length || 0,
      totalPontos: pontosRes.data?.length || 0
    }));

    return true;
  } catch (err) {
    console.warn('[OfflineSyncEngine] Erro ao renovar cache de 3 horas:', err);
    return false;
  }
}

/**
 * Retorna os metadados do cache de 3 horas
 */
export function obterStatusCacheAutonomia(): {
  atualizadoEm: string | null;
  valido: boolean;
  minutosDesdeAtualizacao: number;
} {
  try {
    const raw = localStorage.getItem(CHAVE_STATUS_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.atualizadoEm) {
        const diffMs = Date.now() - new Date(parsed.atualizadoEm).getTime();
        const minutos = Math.floor(diffMs / 60000);
        return {
          atualizadoEm: parsed.atualizadoEm,
          valido: minutos < 180,
          minutosDesdeAtualizacao: minutos
        };
      }
    }
  } catch {}

  return { atualizadoEm: null, valido: false, minutosDesdeAtualizacao: 999 };
}

/**
 * Inicializador automático do motor de sincronização em segundo plano
 */
let motorInicializado = false;
export function inicializarMotorSincronizacaoOffline(): void {
  if (motorInicializado || typeof window === 'undefined') return;
  motorInicializado = true;

  hidratarFilaOfflineDeIndexedDb().catch(() => {});

  window.addEventListener('online', () => {
    console.log('[OfflineSyncEngine] Conexão detectada! Disparando sincronização automática com Supabase...');
    setTimeout(() => {
      sincronizarFilaComSupabase();
    }, 1500);
  });

  setInterval(() => {
    if (navigator.onLine && obterFilaOffline().length > 0) {
      sincronizarFilaComSupabase();
    }
  }, 30000);
}
