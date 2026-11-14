/**
 * PorttoHub — Banco de Dados Local-First no Cliente (IndexedDB v2)
 *
 * ARQUITETURA MULTI-TENANT SEGURA:
 * - Stores operacionais usam chave primária composta ['condominio_id', 'id']
 *   para isolar fisicamente registros entre condomínios.
 * - Rejeita consultas sem condominio_id válido ('todos', 'global', vazio).
 * - Store dedicada `offline_queue` para persistir operações pendentes com
 *   idempotência (operation_id), operador_id e estado de sincronização.
 */

export const PORTTOHUB_DB_NAME = 'PorttoHub_LocalFirst_DB';
export const PORTTOHUB_DB_VERSION = 2;

export type NomeTabelaLocal =
  | 'encomendas_itens'
  | 'custodia'
  | 'moradores'
  | 'veiculos'
  | 'unidades'
  | 'regras_horarios'
  | 'bancada_volumes'
  | 'chaves'
  | 'registros_acesso'
  | 'sync_metadata'
  | 'offline_queue';

export interface SyncMetadataRecord {
  store_and_condo: string; // Chave primária: ex "${tabela}_${condominioId}"
  tabela: string;
  condominioId: string;
  lastSyncTimestamp: string;
  totalCount: number;
  lastFullSync: string;
}

const TENANT_COMPOSITE_STORES: ReadonlySet<NomeTabelaLocal> = new Set([
  'encomendas_itens',
  'custodia',
  'moradores',
  'veiculos',
  'unidades',
  'bancada_volumes',
  'chaves',
  'registros_acesso'
]);

function isCondominioIdDbValido(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  const limpo = id.trim().toLowerCase();
  return Boolean(limpo && limpo !== 'todos' && limpo !== 'global' && limpo !== 'null' && limpo !== 'undefined');
}

function criarStoreComIndices(db: IDBDatabase, storeName: NomeTabelaLocal): IDBObjectStore {
  if (storeName === 'regras_horarios') {
    const store = db.createObjectStore('regras_horarios', { keyPath: 'condominio_id' });
    store.createIndex('updated_at', 'updated_at', { unique: false });
    return store;
  }

  if (storeName === 'sync_metadata') {
    return db.createObjectStore('sync_metadata', { keyPath: 'store_and_condo' });
  }

  if (storeName === 'offline_queue') {
    const store = db.createObjectStore('offline_queue', { keyPath: 'operation_id' });
    store.createIndex('condominio_id', 'condominio_id', { unique: false });
    store.createIndex('operador_id', 'operador_id', { unique: false });
    store.createIndex('estado', 'estado', { unique: false });
    store.createIndex('criadoEm', 'criadoEm', { unique: false });
    return store;
  }

  // Stores multi-tenant usam chave primária composta ['condominio_id', 'id']
  const store = db.createObjectStore(storeName, { keyPath: ['condominio_id', 'id'] });
  store.createIndex('condominio_id', 'condominio_id', { unique: false });

  if (storeName === 'encomendas_itens') {
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('unidade_bloco', 'unidade_bloco', { unique: false });
    store.createIndex('created_at', 'created_at', { unique: false });
    store.createIndex('updated_at', 'updated_at', { unique: false });
    store.createIndex('condo_status', ['condominio_id', 'status'], { unique: false });
    store.createIndex('condo_updated', ['condominio_id', 'updated_at'], { unique: false });
  } else if (storeName === 'custodia') {
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('created_at', 'created_at', { unique: false });
    store.createIndex('updated_at', 'updated_at', { unique: false });
    store.createIndex('condo_status', ['condominio_id', 'status'], { unique: false });
    store.createIndex('condo_updated', ['condominio_id', 'updated_at'], { unique: false });
  } else if (storeName === 'moradores') {
    store.createIndex('unidade', 'unidade', { unique: false });
    store.createIndex('bloco', 'bloco', { unique: false });
    store.createIndex('veiculo_placa', 'veiculo_placa', { unique: false });
    store.createIndex('condo_unidade', ['condominio_id', 'unidade'], { unique: false });
    store.createIndex('condo_updated', ['condominio_id', 'updated_at'], { unique: false });
  } else if (storeName === 'veiculos') {
    store.createIndex('placa', 'placa', { unique: false });
    store.createIndex('unidade_bloco', 'unidade_bloco', { unique: false });
    store.createIndex('condo_placa', ['condominio_id', 'placa'], { unique: false });
  } else if (storeName === 'unidades') {
    store.createIndex('unidade', 'unidade', { unique: false });
    store.createIndex('bloco', 'bloco', { unique: false });
  } else if (storeName === 'bancada_volumes') {
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('condo_updated', ['condominio_id', 'updated_at'], { unique: false });
  } else if (storeName === 'chaves') {
    store.createIndex('numero', 'numero', { unique: false });
    store.createIndex('condo_updated', ['condominio_id', 'updated_at'], { unique: false });
  } else if (storeName === 'registros_acesso') {
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('data_hora_entrada', 'data_hora_entrada', { unique: false });
    store.createIndex('condo_updated', ['condominio_id', 'updated_at'], { unique: false });
  }

  return store;
}

let dbInstancia: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

// Fallback in-memory para ambientes onde IndexedDB estiver desabilitado
const memoriaFallback = new Map<string, any[]>();
const memoriaMetadataFallback = new Map<string, SyncMetadataRecord>();
let memoriaOfflineQueue: any[] = [];

/**
 * Abre e inicializa a conexão com o IndexedDB v2 do PorttoHub
 */
export function abrirPorttoHubDb(): Promise<IDBDatabase> {
  if (dbInstancia) {
    return Promise.resolve(dbInstancia);
  }
  if (dbPromise) {
    return dbPromise;
  }

  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB não suportado neste ambiente'));
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(PORTTOHUB_DB_NAME, PORTTOHUB_DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const req = event.target as IDBOpenDBRequest;
        const db = req.result;
        const tx = req.transaction;
        const oldVersion = event.oldVersion || 0;

        // Migra todas as stores multi-tenant para keyPath composto ['condominio_id', 'id'] na v2
        for (const storeName of TENANT_COMPOSITE_STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            criarStoreComIndices(db, storeName);
          } else if (oldVersion < 2 && tx) {
            try {
              const oldStore = tx.objectStore(storeName);
              const jaComposta = Array.isArray(oldStore.keyPath) &&
                oldStore.keyPath[0] === 'condominio_id' &&
                oldStore.keyPath[1] === 'id';

              if (!jaComposta) {
                const reqAll = oldStore.getAll();
                reqAll.onsuccess = () => {
                  const registrosAntigos = Array.isArray(reqAll.result) ? reqAll.result : [];
                  const validos = registrosAntigos.filter(
                    (it: any) =>
                      it &&
                      it.id !== undefined &&
                      it.id !== null &&
                      isCondominioIdDbValido(it.condominio_id)
                  );
                  db.deleteObjectStore(storeName);
                  const novaStore = criarStoreComIndices(db, storeName);
                  for (const item of validos) {
                    try {
                      novaStore.put(item);
                    } catch {
                      // Descarta registro incompatível na migração
                    }
                  }
                };
              }
            } catch {
              db.deleteObjectStore(storeName);
              criarStoreComIndices(db, storeName);
            }
          }
        }

        if (!db.objectStoreNames.contains('regras_horarios')) {
          criarStoreComIndices(db, 'regras_horarios');
        }
        if (!db.objectStoreNames.contains('sync_metadata')) {
          criarStoreComIndices(db, 'sync_metadata');
        }
        if (!db.objectStoreNames.contains('offline_queue')) {
          criarStoreComIndices(db, 'offline_queue');
        }
      };

      request.onsuccess = (event: Event) => {
        dbInstancia = (event.target as IDBOpenDBRequest).result;
        dbInstancia.onversionchange = () => {
          dbInstancia?.close();
          dbInstancia = null;
          dbPromise = null;
        };
        resolve(dbInstancia);
      };

      request.onerror = (event: Event) => {
        console.warn('[IndexedDB] Erro ao abrir banco de dados local:', (event.target as IDBOpenDBRequest).error);
        dbPromise = null;
        reject((event.target as IDBOpenDBRequest).error);
      };
    } catch (err) {
      console.warn('[IndexedDB] Exceção ao inicializar banco local:', err);
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Lê todos os registros de uma tabela local filtrados estritamente por condomínio
 */
export async function obterTodosItensLocal<T = any>(
  storeName: NomeTabelaLocal,
  condominioId: string
): Promise<T[]> {
  if (TENANT_COMPOSITE_STORES.has(storeName) && !isCondominioIdDbValido(condominioId)) {
    return [];
  }

  try {
    const db = await abrirPorttoHubDb();
    return new Promise<T[]>((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);

      if (store.indexNames.contains('condominio_id') && isCondominioIdDbValido(condominioId)) {
        const index = store.index('condominio_id');
        const req = index.getAll(IDBKeyRange.only(condominioId));
        req.onsuccess = () => {
          const lista = (req.result || []).filter((it: any) => String(it?.condominio_id || '') === String(condominioId));
          resolve(lista as T[]);
        };
        req.onerror = () => resolve([]);
      } else if (!TENANT_COMPOSITE_STORES.has(storeName)) {
        const req = store.getAll();
        req.onsuccess = () => {
          let lista = req.result || [];
          if (isCondominioIdDbValido(condominioId)) {
            lista = lista.filter((it: any) => String(it?.condominio_id || '') === String(condominioId));
          }
          resolve(lista as T[]);
        };
        req.onerror = () => resolve([]);
      } else {
        resolve([]);
      }
    });
  } catch {
    if (!isCondominioIdDbValido(condominioId)) return [];
    const chave = `${storeName}_${condominioId}`;
    return (memoriaFallback.get(chave) || []) as T[];
  }
}

/**
 * Lê um único registro por chave primária (composta por [condominioId, id] em stores multi-tenant)
 */
export async function obterItemPorIdLocal<T = any>(
  storeName: NomeTabelaLocal,
  id: string | number,
  condominioId?: string
): Promise<T | null> {
  if (TENANT_COMPOSITE_STORES.has(storeName) && !isCondominioIdDbValido(condominioId)) {
    return null;
  }

  try {
    const db = await abrirPorttoHubDb();
    return new Promise<T | null>((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const chave = TENANT_COMPOSITE_STORES.has(storeName)
        ? [String(condominioId).trim(), id]
        : id;
      const req = store.get(chave as IDBValidKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Salva um item individual no banco local respeitando isolamento multi-tenant
 */
export async function salvarItemLocal<T extends { id?: any; condominio_id?: string }>(
  storeName: NomeTabelaLocal,
  item: T
): Promise<void> {
  if (TENANT_COMPOSITE_STORES.has(storeName)) {
    if (!item || item.id === undefined || item.id === null || !isCondominioIdDbValido(item.condominio_id)) {
      return;
    }
  }

  try {
    const db = await abrirPorttoHubDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (isCondominioIdDbValido(item.condominio_id)) {
      const chave = `${storeName}_${item.condominio_id}`;
      const lista = memoriaFallback.get(chave) || [];
      const idx = lista.findIndex((it: any) => String(it.id) === String(item.id));
      if (idx >= 0) lista[idx] = item;
      else lista.push(item);
      memoriaFallback.set(chave, lista);
    }
  }
}

/**
 * Exclui um registro do banco local respeitando chave composta [condominio_id, id]
 */
export async function excluirItemLocal(
  storeName: NomeTabelaLocal,
  id: string | number,
  condominioId?: string
): Promise<void> {
  try {
    const db = await abrirPorttoHubDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      if (TENANT_COMPOSITE_STORES.has(storeName)) {
        if (isCondominioIdDbValido(condominioId)) {
          store.delete([String(condominioId).trim(), id]);
        } else {
          // Fallback seguro por cursor quando chamador legado não passou condominioId
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = (ev: any) => {
            const cursor = ev.target.result as IDBCursorWithValue | null;
            if (!cursor) return;
            if (String(cursor.value?.id) === String(id)) {
              cursor.delete();
            }
            cursor.continue();
          };
        }
      } else {
        store.delete(id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignorar fallback
  }
}

/**
 * Salva um lote inteiro de registros em uma única transação atômica isolada por condomínio
 */
export async function salvarLoteItensLocal<T = any>(
  storeName: NomeTabelaLocal,
  itens: T[],
  condominioId: string,
  cursorTimestamp?: string,
  substituirTodos: boolean = false
): Promise<void> {
  if (!itens || (itens.length === 0 && !substituirTodos)) return;
  if (TENANT_COMPOSITE_STORES.has(storeName) && !isCondominioIdDbValido(condominioId)) {
    return;
  }

  const itensValidos = (itens || [])
    .filter((it: any) => it && it.id !== undefined && it.id !== null)
    .map((it: any) => ({
      ...it,
      condominio_id: it.condominio_id || condominioId
    }))
    .filter((it: any) => String(it.condominio_id) === String(condominioId));

  if (itensValidos.length === 0 && !substituirTodos) return;

  try {
    const db = await abrirPorttoHubDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      if (substituirTodos && store.indexNames.contains('condominio_id')) {
        const index = store.index('condominio_id');
        const reqKeys = index.getAllKeys(IDBKeyRange.only(condominioId));
        reqKeys.onsuccess = () => {
          const keys = reqKeys.result || [];
          for (const k of keys) {
            store.delete(k);
          }
          for (const item of itensValidos) {
            store.put(item);
          }
        };
      } else {
        for (const item of itensValidos) {
          store.put(item);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (cursorTimestamp) {
      await salvarMetadataSyncLocal(storeName, condominioId, cursorTimestamp, itensValidos.length);
    }
  } catch (err) {
    console.warn(`[IndexedDB] Fallback para gravação de ${storeName}:`, err);
    const chave = `${storeName}_${condominioId}`;
    memoriaFallback.set(chave, itensValidos);
  }
}

/**
 * Obtém os metadados da última sincronização delta para uma tabela e condomínio
 */
export async function obterMetadataSyncLocal(
  tabela: string,
  condominioId: string
): Promise<SyncMetadataRecord | null> {
  const chave = `${tabela}_${condominioId}`;
  try {
    const db = await abrirPorttoHubDb();
    return new Promise<SyncMetadataRecord | null>((resolve) => {
      const tx = db.transaction('sync_metadata', 'readonly');
      const store = tx.objectStore('sync_metadata');
      const req = store.get(chave);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return memoriaMetadataFallback.get(chave) || null;
  }
}

/**
 * Grava os metadados da sincronização delta
 */
export async function salvarMetadataSyncLocal(
  tabela: string,
  condominioId: string,
  lastSyncTimestamp: string,
  totalCount: number
): Promise<void> {
  const payload: SyncMetadataRecord = {
    store_and_condo: `${tabela}_${condominioId}`,
    tabela,
    condominioId,
    lastSyncTimestamp,
    totalCount,
    lastFullSync: new Date().toISOString()
  };

  try {
    const db = await abrirPorttoHubDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sync_metadata', 'readwrite');
      const store = tx.objectStore('sync_metadata');
      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoriaMetadataFallback.set(payload.store_and_condo, payload);
  }
}

/**
 * Espelha a fila offline de forma durável na store `offline_queue` do IndexedDB
 */
export async function salvarFilaOfflineIndexedDb(acoes: any[]): Promise<void> {
  memoriaOfflineQueue = Array.isArray(acoes) ? [...acoes] : [];
  try {
    const db = await abrirPorttoHubDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('offline_queue', 'readwrite');
      const store = tx.objectStore('offline_queue');
      store.clear();
      for (const acao of memoriaOfflineQueue) {
        const item = {
          ...acao,
          operation_id: acao.operation_id || acao.id
        };
        if (item.operation_id) {
          store.put(item);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback em memória já atualizado acima
  }
}

export async function lerFilaOfflineIndexedDb(): Promise<any[]> {
  try {
    const db = await abrirPorttoHubDb();
    return new Promise<any[]>((resolve) => {
      const tx = db.transaction('offline_queue', 'readonly');
      const store = tx.objectStore('offline_queue');
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve(memoriaOfflineQueue);
    });
  } catch {
    return memoriaOfflineQueue;
  }
}

/**
 * Limpa todo o cache de leitura local de um condomínio específico (preserva offline_queue)
 */
export async function limparCacheLocalCondominio(condominioId: string): Promise<void> {
  if (!isCondominioIdDbValido(condominioId)) return;

  try {
    const db = await abrirPorttoHubDb();
    const tabelas: NomeTabelaLocal[] = [
      'encomendas_itens',
      'custodia',
      'moradores',
      'veiculos',
      'unidades',
      'bancada_volumes',
      'chaves',
      'registros_acesso'
    ];

    for (const tab of tabelas) {
      memoriaFallback.delete(`${tab}_${condominioId}`);
      memoriaMetadataFallback.delete(`${tab}_${condominioId}`);
      const tx = db.transaction(tab, 'readwrite');
      const store = tx.objectStore(tab);
      if (store.indexNames.contains('condominio_id')) {
        const index = store.index('condominio_id');
        const reqKeys = index.getAllKeys(IDBKeyRange.only(condominioId));
        reqKeys.onsuccess = () => {
          const keys = reqKeys.result || [];
          for (const k of keys) {
            store.delete(k);
          }
        };
      }
    }
  } catch (err) {
    console.warn('[IndexedDB] Erro ao limpar cache do condomínio:', err);
  }
}

/**
 * Limpa apenas os caches de leitura de TODOS os condomínios no IndexedDB (ex: logout),
 * mantendo intacta a store `offline_queue` para não perder registros pendentes da portaria.
 */
export async function limparTodosCachesLeituraIndexedDb(): Promise<void> {
  memoriaFallback.clear();
  memoriaMetadataFallback.clear();
  try {
    const db = await abrirPorttoHubDb();
    const tabelasLeitura: NomeTabelaLocal[] = [
      'encomendas_itens',
      'custodia',
      'moradores',
      'veiculos',
      'unidades',
      'regras_horarios',
      'bancada_volumes',
      'chaves',
      'registros_acesso',
      'sync_metadata'
    ];
    for (const tab of tabelasLeitura) {
      if (db.objectStoreNames.contains(tab)) {
        const tx = db.transaction(tab, 'readwrite');
        tx.objectStore(tab).clear();
      }
    }
  } catch {
    // Ignora se IndexedDB não disponível
  }
}
