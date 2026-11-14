import { isModuloAtivo, carregarModulosCondominio } from './services/modulosService';
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  supabase,
  isSupabaseConfigurado,
  obterErroConfiguracaoSupabase,
  formatarErroDetalhadoSupabase
} from './services/supabase';

import ModuloErrorBoundary from './components/ModuloErrorBoundary';

// Carregador resiliente com retry automático para evitar falhas transitórias de dynamic import
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  maxRetries = 2
): React.LazyExoticComponent<T> {
  return lazy(() => {
    let retries = 0;
    const execute = (): Promise<{ default: T }> => {
      return factory().catch((error) => {
        if (retries < maxRetries) {
          retries++;
          return new Promise((resolve) => setTimeout(resolve, 300 * retries)).then(execute);
        }
        throw error;
      });
    };
    return execute();
  });
}

// Code Splitting Dinâmico Resiliente
const Cadastros = lazyWithRetry(() => import('./pages/Cadastros'));
const Encomendas = lazyWithRetry(() => import('./pages/Encomendas'));
const Custodia = lazyWithRetry(() => import('./pages/Custodia'));
const Materiais = lazyWithRetry(() => import('./pages/Materiais'));
const Chaves = lazyWithRetry(() => import('./pages/Chaves'));
const Manutencao = lazyWithRetry(() => import('./pages/Manutencao'));
const Rondas = lazyWithRetry(() => import('./pages/Rondas'));
const Ocorrencias = lazyWithRetry(() => import('./pages/Ocorrencias'));
const PassagemPosto = lazyWithRetry(() => import('./pages/PassagemPosto'));
const PrestadoresObras = lazyWithRetry(() => import('./pages/PrestadoresObras'));
const Bancada = lazyWithRetry(() => import('./pages/Bancada'));
const Configuracoes = lazyWithRetry(() => import('./pages/Configuracoes'));
const HistoricoAbsoluto = lazyWithRetry(() => import('./pages/HistoricoAbsoluto'));
const PainelSindico = lazyWithRetry(() => import('./pages/PainelSindico'));
const ReservaAreas = lazyWithRetry(() => import('./pages/ReservaAreas'));
const ControleAcesso = lazyWithRetry(() => import('./pages/ControleAcesso'));

// Modais sob demanda carregados apenas quando acionados pelo usuário
const TutorialOperacionalPorttoHub = lazyWithRetry(() => import('./components/TutorialOperacionalPorttoHub'));
const ModalGerenciadorModulosCondominio = lazyWithRetry(() => import('./components/ModalGerenciadorModulosCondominio'));
const ModalInfoVersaoRepositorio = lazyWithRetry(() => import('./components/ModalInfoVersaoRepositorio'));
const ModalMeuPerfil = lazyWithRetry(() => import('./components/ModalMeuPerfil'));
const SupabaseDoctorModal = lazyWithRetry(() => import('./components/SupabaseDoctorModal'));
const ModalLembretesPortaria = lazyWithRetry(() => import('./components/ModalLembretesPortaria'));
const LeitorNFC = lazyWithRetry(() => import('./components/LeitorNFC'));
const ModalConfigHorariosObrasMudancas = lazyWithRetry(() => import('./components/ModalConfigHorariosObrasMudancas'));


import AlertaRondaGlobal from './components/AlertaRondaGlobal';
import { OfflineIndicator } from './components/OfflineIndicator';
import ControleFonteAcessibilidade from './components/ControleFonteAcessibilidade';
import BotaoAtualizarApp from './components/BotaoAtualizarApp';
import SeletorTema from './components/SeletorTema';
import { inicializarTema } from './services/themeService';
import { NOME_APLICACAO, VERSAO_BUILD_ATUAL } from './services/versaoService';
import { 
  useCustomizacaoVisual, 
  obterClasseTamanhoFonte, 
  obterIconeModulo, 
  isModuloOculto, 
  obterRotuloModulo, 
  obterIconeModuloDinamico 
} from './services/customizacaoVisualService';
import AlertaNovaVersaoPWA from './components/AlertaNovaVersaoPWA';
import IndicadorConectividade from './components/IndicadorConectividade';
import EmblemaInfport from './components/EmblemaInfport';
import BotaoNotificacoesLembretes from './components/BotaoNotificacoesLembretes';
import AlertaNoCondominioTopo from './components/AlertaNoCondominioTopo';
import BarraTopoMenus from './components/BarraTopoMenus';
import HeaderBarPrincipal from './components/HeaderBarPrincipal';
import { checarEDispararAlarmeTrocaPlantao } from './services/lembretesService';
import { navigationStack } from './services/navigationStackService';
import { preCarregarDadosCondominio, limparCacheRamCondominio } from './services/deltaSyncService';
import { salvarCacheLocal, obterCacheLocal, limparCachesLeituraPorLogout, limparCachesDeCondominio } from './services/offlineStorageService';
import { limparCacheLocalCondominio, limparTodosCachesLeituraIndexedDb } from './services/porttoHubDb';
import { limparCacheUrlsAssinadas } from './services/imageUtils';
import { atualizarCacheAutonomia3Horas } from './services/offlineSyncEngine';
import { carregarEPreaquecerEncomendas, inicializarRealtimeEncomendas } from './services/encomendasService';
import { registrarAtividade } from './services/auditoriaService';
import { carregarNiveisAcesso, verificarPermissao, obterPermissoesOperador } from './services/permissoesService';
import { isUUID } from './services/condominioService';
import { aquecerCacheCondominio, invalidarCacheCondominio, limparTodoCache } from './services/redisCacheService';
import {
  buscarVinculosCondominiosOperador,
  resolverContextoCondominiosOperador,
  temAcessoGlobalExplicito,
  ehPerfilSindico,
  isCondominioIdValido,
  ContextoCondominiosResolvido
} from './services/autorizacaoService';
import { 
  ShieldCheck, Sliders, Play, 
  Lock, 
  User, 
  Zap,
  LogOut, 
  Database, 
  Package, 
  Shield, 
  Radio, 
  Key, 
  Wrench, Hammer, 
  QrCode, 
  BookOpen,
  Repeat,
  Briefcase,
  Settings,
  Filter,
  Menu,
  X,
  Home,
  Grid,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  HardHat,
  PackageCheck,
  ClipboardList,
  KeyRound,
  Eye,
  EyeOff,
  History,
  UserCheck,
  Layers,
  Calendar,
  Scan
} from 'lucide-react';

const CHAVE_SESSAO = 'infport_sessao_ativa_v1';

function ModuloLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[460px] w-full p-8 space-y-4">
      <div className="relative flex items-center justify-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/5">
          <div className="w-7 h-7 border-3 border-emerald-500/25 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
          PorttoHub Sistema
        </p>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Carregando módulo operacional...
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [modalGerenciadorModulosAberto, setModalGerenciadorModulosAberto] = useState(false);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [operador, setOperador] = useState<any | null>(null);
  const [condominio, setCondominio] = useState<any | null>(null);
  const [modalLeitorNfcGlobal, setModalLeitorNfcGlobal] = useState(false);
  const [modalMeuPerfilAberto, setModalMeuPerfilAberto] = useState(false);
  const [modalSupabaseDoctorAberto, setModalSupabaseDoctorAberto] = useState(false);
  const [modalLembretesAberto, setModalLembretesAberto] = useState(false);
  const [modalConfigHorariosAberto, setModalConfigHorariosAberto] = useState(false);
  const [mostrarSenhaLogin, setMostrarSenhaLogin] = useState(false);
  const [lembrarAcesso, setLembrarAcesso] = useState(true);
  const [restaurandoSessao, setRestaurandoSessao] = useState(true);
  
  const [listaCondominios, setListaCondominios] = useState<any[]>([]);
  const [condominioAtivoId, setCondominioAtivoId] = useState('');
  const [contextoCondos, setContextoCondos] = useState<ContextoCondominiosResolvido | null>(null);
  const [avisoTurnoLogin, setAvisoTurnoLogin] = useState('');
  const trocaCondoSeqRef = useRef(0);
  const customVisual = useCustomizacaoVisual(condominioAtivoId || operador?.condominio_id);
  const [, setForcarAtualizacaoTema] = useState(0);

  useEffect(() => {
    inicializarTema();
    const handleTema = () => setForcarAtualizacaoTema(n => n + 1);
    window.addEventListener('infport_tema_alterado', handleTema);
    return () => window.removeEventListener('infport_tema_alterado', handleTema);
  }, []);

  const [menuAberto, setMenuAberto] = useState(true);
  const [drawerMobileAberto, setDrawerMobileAberto] = useState(false);

  const [featureFlags, setFeatureFlags] = useState({
    mod01_cadastros_base: true,
    mod02_gestao_encomendas: true,
    mod03_custodia_itens: true,
    mod04_materiais_posto: true,
    mod05_quadro_chaves: true,
    mod06_gestao_manutencao: true,
    mod07_gestao_ronda: true,
    mod08_livro_ocorrencias: true,
    mod09_passagem_posto: true,
    mod10_prestadores_servico: true,
    mod11_bancada_conferencia: true,
    mod12_historico_absoluto: true,
    mod_portal_sindico: true,
    mod_guia_operacional: true,
    mod15_reserva_areas: true,
    mod16_controle_acesso: true
  });

  const [moduloAtual, setModuloAtual] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [modalVersaoInfoAberto, setModalVersaoInfoAberto] = useState(false);

  const [versaoPermissoes, setVersaoPermissoes] = useState(0);

  useEffect(() => {
    const handleAtualizacao = () => setVersaoPermissoes(v => v + 1);
    const handlePermissoesOperador = (e: any) => {
      setVersaoPermissoes(v => v + 1);
      const detail = e.detail;
      if (detail && operador && (detail.operadorId === operador.id || detail.login === operador.login || detail.operadorId === operador.login)) {
        setOperador((op: any) => {
          if (!op) return op;
          const atualizado = { ...op, permissoes: detail.permissoes };
          (window as any).__operadorAtivo = atualizado;
          return atualizado;
        });
      }
    };
    window.addEventListener('niveis_acesso_atualizados', handleAtualizacao);
    window.addEventListener('permissoes_operador_atualizadas', handlePermissoesOperador as EventListener);
    window.addEventListener('operadores_atualizados', handleAtualizacao);
    return () => {
      window.removeEventListener('niveis_acesso_atualizados', handleAtualizacao);
      window.removeEventListener('permissoes_operador_atualizadas', handlePermissoesOperador as EventListener);
      window.removeEventListener('operadores_atualizados', handleAtualizacao);
    };
  }, [operador]);

  // Regras estritas A, B, C, D:
  // Acesso global SOMENTE quando acesso_global_condominios === true no banco.
  // NUNCA inferido por login === 'admin', 'master', nivel_acesso <= 1 ou condominio_id = 'todos'.
  const eSuperAdminGlobal = temAcessoGlobalExplicito(operador);
  const eSindico = ehPerfilSindico(operador);
  const eAdmin = Boolean(
    !eSindico && (
      eSuperAdminGlobal ||
      operador?.perfil === 'admin' ||
      operador?.perfil === 'admin_geral' ||
      operador?.nivel_acesso === 0 ||
      operador?.nivel_acesso === 1
    )
  );
  const eAcessoMultiCondominio = Boolean(contextoCondos?.mostrarSeletor && !eSindico);

  const resolverEAplicarContextoOperador = async (
    opBase: any,
    condoPreferido?: string | null
  ): Promise<{ autorizado: boolean; motivoBloqueio?: string; contexto?: ContextoCondominiosResolvido; opNormalizado?: any }> => {
    const opData = {
      ...opBase,
      permissoes:
        opBase.permissoes && typeof opBase.permissoes === 'object' && Object.keys(opBase.permissoes).length > 0
          ? opBase.permissoes
          : obterPermissoesOperador(opBase)
    };

    const [{ data: condosDb, error: condosErr }, vinculosRes] = await Promise.all([
      supabase.from('condominios').select('*').order('nome'),
      buscarVinculosCondominiosOperador(opData.id)
    ]);

    if (condosErr) {
      console.error('[PorttoHub][Login] Erro ao consultar tabela condominios:', condosErr);
      return {
        autorizado: false,
        motivoBloqueio: formatarErroDetalhadoSupabase(condosErr, 'Consulta na tabela condominios (verifique RLS)')
      };
    }

    if (vinculosRes.erro) {
      console.error('[PorttoHub][Login] Erro ao consultar tabela operador_condominios:', vinculosRes.erro);
      return {
        autorizado: false,
        motivoBloqueio: formatarErroDetalhadoSupabase(vinculosRes.erro, 'Consulta na tabela operador_condominios (verifique RLS)')
      };
    }

    const listaBruta = Array.isArray(condosDb) ? condosDb : [];
    const contexto = resolverContextoCondominiosOperador({
      operador: opData,
      condominiosDisponiveis: listaBruta,
      vinculosExplicitosIds: vinculosRes.ids,
      tabelaVinculosDisponivel: vinculosRes.tabelaDisponivel,
      condominioPreferidoId: condoPreferido
    });

    if (contexto.bloqueado) {
      return {
        autorizado: false,
        motivoBloqueio: contexto.motivoBloqueio || 'Seu usuário não possui condomínio autorizado para acesso.'
      };
    }

    const opNormalizado = {
      ...opData,
      eSuperAdminGlobal: contexto.eAdminGeral,
      condominio_id: contexto.condominioInicialId || opData.condominio_id,
      condominiosAutorizadosIds: contexto.condominiosPermitidos.map(c => c.id)
    };

    const condoInicialObj = contexto.condominiosPermitidos.find(c => c.id === contexto.condominioInicialId) || null;
    setContextoCondos(contexto);
    setListaCondominios(contexto.condominiosPermitidos);
    setCondominioAtivoId(contexto.condominioInicialId);
    setCondominio(condoInicialObj);
    if (contexto.condominioInicialId) {
      localStorage.setItem('infport_condominio_ativo_id', contexto.condominioInicialId);
    }

    return { autorizado: true, contexto, opNormalizado };
  };

  useEffect(() => {
    let montado = true;

    const safetyTimer = setTimeout(() => {
      if (montado) setRestaurandoSessao(false);
    }, 3500);

    const restaurarSessaoSalva = async () => {
      if (!isSupabaseConfigurado()) {
        if (montado) setRestaurandoSessao(false);
        return;
      }

      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) {
          console.error('[PorttoHub][Sessão] Erro em supabase.auth.getSession():', sessionErr);
        }
        const authUser = sessionData?.session?.user;

        if (!authUser) {
          localStorage.removeItem(CHAVE_SESSAO);
          if (montado) setRestaurandoSessao(false);
          return;
        }

        let { data: opData, error: opErr } = await supabase
          .from('operadores')
          .select('*')
          .eq('auth_user_id', authUser.id)
          .eq('ativo', true)
          .maybeSingle();

        if (opErr) {
          console.error('[PorttoHub][Sessão] Erro ao buscar operador por auth_user_id:', opErr);
          await supabase.auth.signOut();
          localStorage.removeItem(CHAVE_SESSAO);
          if (montado) {
            setErro(formatarErroDetalhadoSupabase(opErr, 'Falha ao validar operador da sessão'));
            setRestaurandoSessao(false);
          }
          return;
        }

        if (!opData && authUser.email) {
          const fallbackEmail = await supabase
            .from('operadores')
            .select('*')
            .ilike('email', authUser.email.trim().toLowerCase())
            .eq('ativo', true)
            .maybeSingle();
          if (fallbackEmail.error) {
            console.error('[PorttoHub][Sessão] Erro ao buscar operador por email:', fallbackEmail.error);
            await supabase.auth.signOut();
            localStorage.removeItem(CHAVE_SESSAO);
            if (montado) {
              setErro(formatarErroDetalhadoSupabase(fallbackEmail.error, 'Falha ao consultar operador por e-mail'));
              setRestaurandoSessao(false);
            }
            return;
          }
          if (fallbackEmail.data) {
            opData = fallbackEmail.data;
            if (!opData.auth_user_id) {
              const { error: updErr } = await supabase
                .from('operadores')
                .update({ auth_user_id: authUser.id, migrado_auth_em: new Date().toISOString() })
                .eq('id', opData.id);
              if (updErr) {
                console.warn('[PorttoHub][Sessão] Aviso ao vincular auth_user_id automaticamente:', updErr);
              } else {
                opData.auth_user_id = authUser.id;
              }
            }
          }
        }

        if (!opData) {
          await supabase.auth.signOut();
          localStorage.removeItem(CHAVE_SESSAO);
          if (montado) {
            setErro(`Conta autenticada (${authUser.email || authUser.id}), porém sem operador ativo vinculado em public.operadores.`);
            setRestaurandoSessao(false);
          }
          return;
        }

        const preferidoSalvo = localStorage.getItem('infport_condominio_ativo_id');
        const resCtx = await resolverEAplicarContextoOperador(opData, preferidoSalvo);

        if (!resCtx.autorizado || !resCtx.opNormalizado) {
          await supabase.auth.signOut();
          localStorage.removeItem(CHAVE_SESSAO);
          if (montado) {
            setErro(resCtx.motivoBloqueio || 'Acesso bloqueado: nenhum condomínio autorizado.');
            setRestaurandoSessao(false);
          }
          return;
        }

        if (montado) {
          const opFinal = resCtx.opNormalizado;
          setOperador(opFinal);
          const nomeAtivoRestaurado = opFinal.nome || opFinal.login || opFinal.email || '';
          localStorage.setItem('infport_ultimo_operador_nome', nomeAtivoRestaurado);
          (window as any).__operadorAtivoNome = nomeAtivoRestaurado;
          (window as any).__operadorAtivo = opFinal;

          if (resCtx.contexto?.eSindico) {
            setModuloAtual('painel_sindico');
          }
          if (resCtx.contexto?.condominioInicialId) {
            carregarNiveisAcesso(resCtx.contexto.condominioInicialId);
          } else {
            carregarNiveisAcesso();
          }
        }
      } catch (err) {
        console.warn('Falha ao restaurar sessão Supabase Auth:', err);
      } finally {
        if (montado) setRestaurandoSessao(false);
      }
    };

    restaurarSessaoSalva();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && montado) {
        setOperador(null);
        setCondominio(null);
        setCondominioAtivoId('');
        setContextoCondos(null);
        setListaCondominios([]);
      }
    });

    return () => {
      montado = false;
      clearTimeout(safetyTimer);
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Pré-carregamento dos módulos operacionais mais críticos em tempo ocioso para navegação instantânea
  useEffect(() => {
    if (operador) {
      const prefetch = () => {
        import('./pages/Bancada');
        import('./pages/Encomendas');
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(prefetch);
      } else {
        setTimeout(prefetch, 1200);
      }
    }
  }, [operador]);

  // Garante a autonomia de 3 horas em cache local e pré-carrega encomendas para ZERO DELAY ao abrir o menu
  useEffect(() => {
    if (condominioAtivoId && condominioAtivoId !== 'todos' && condominioAtivoId !== 'global') {
      atualizarCacheAutonomia3Horas(condominioAtivoId);
      carregarEPreaquecerEncomendas(condominioAtivoId).catch(() => {});
      const desinscreverRealtime = inicializarRealtimeEncomendas(condominioAtivoId);
      return () => {
        desinscreverRealtime();
      };
    }
  }, [condominioAtivoId]);

  // Pilha de histórico de navegação para permitir retornar com precisão à tela anterior
  const [historicoModulos, setHistoricoModulos] = useState<string[]>([]);

  const voltarModulo = () => {
    // 1. Dispara evento customizado para permitir que sub-telas (como formulário em Cadastros) voltem internamente
    const evento = new CustomEvent('infport_voltar_menu_anterior', { cancelable: true });
    const foiTratado = !window.dispatchEvent(evento);
    if (foiTratado) {
      return;
    }

    // 2. Retorna para o módulo anterior registrado na pilha de histórico
    if (historicoModulos.length > 0) {
      const pilhaAtualizada = [...historicoModulos];
      const moduloAnterior = pilhaAtualizada.pop();
      setHistoricoModulos(pilhaAtualizada);
      setModuloAtual(moduloAnterior || 'dashboard');
    } else {
      setModuloAtual('dashboard');
    }
  };

  useEffect(() => {
    navigationStack.inicializar(voltarModulo);
  }, []);

  useEffect(() => {
    navigationStack.setModuloAtual(moduloAtual);
  }, [moduloAtual]);

  useEffect(() => {
    if (operador) {
      const condoId = (eAdmin || eAcessoMultiCondominio) ? (condominioAtivoId || operador.condominio_id) : operador.condominio_id;
      if (condoId && condoId !== 'todos' && condoId !== 'global') {
        preCarregarDadosCondominio(condoId);
      }
    }
  }, [operador, condominioAtivoId]);

  const mudarModulo = (novoModulo: string, substituir = false) => {
    let modDestino = novoModulo;
    if (modDestino === 'configuracoes' && !podeAcessarConfiguracoes) {
      modDestino = eSindico ? 'painel_sindico' : 'dashboard';
    }

    if (modDestino === moduloAtual) return;

    if (!substituir) {
      setHistoricoModulos(prev => [...prev, moduloAtual]);
    }
    setModuloAtual(modDestino);
    setDrawerMobileAberto(false);
    try {
      window.history.pushState({ modulo: modDestino }, '');
    } catch {}
  };

  useEffect(() => {
    if (operador) {
      carregarCondominiosHeader();
    }
  }, [operador]);

  useEffect(() => {
    if (operador) {
      let idCondTarget = (eAdmin || eAcessoMultiCondominio) ? (condominioAtivoId || operador.condominio_id) : operador.condominio_id;
      if (!idCondTarget || idCondTarget === 'todos' || idCondTarget === 'global' || !isUUID(idCondTarget)) {
        const idSalvo = localStorage.getItem('infport_condominio_ativo_id');
        if (idSalvo && idSalvo !== 'todos' && idSalvo !== 'global' && isUUID(idSalvo)) {
          idCondTarget = idSalvo;
        } else if (listaCondominios && listaCondominios.length > 0) {
          idCondTarget = listaCondominios[0].id;
        }
      }
      if (idCondTarget && idCondTarget !== 'todos' && idCondTarget !== 'global' && isUUID(idCondTarget)) {
        carregarFeatureFlags(idCondTarget);
      }
    }
  }, [operador, condominioAtivoId, listaCondominios]);

  // Listener para atualização em tempo real quando as flags forem salvas em Configurações
  useEffect(() => {
    const handleAtualizacaoModulos = (e: any) => {
      if (e.detail) {
        const idAlvo = e.detail.condominio_id || e.detail.condominioId;
        const condoAtual = (eAdmin || eAcessoMultiCondominio) ? (condominioAtivoId || operador?.condominio_id) : operador?.condominio_id;
        if (!idAlvo || !condoAtual || idAlvo === condoAtual || condoAtual === 'todos' || condoAtual === 'global') {
          const novas = e.detail.flags || e.detail.modulos || e.detail;
          setFeatureFlags(prev => ({
            ...prev,
            ...novas
          }));
        }
      }
    };

    window.addEventListener('modulos_atualizados', handleAtualizacaoModulos);
    window.addEventListener('modulos_condominio_atualizados', handleAtualizacaoModulos);
    return () => {
      window.removeEventListener('modulos_atualizados', handleAtualizacaoModulos);
      window.removeEventListener('modulos_condominio_atualizados', handleAtualizacaoModulos);
    };
  }, [operador?.condominio_id, condominioAtivoId, eAdmin, eAcessoMultiCondominio]);

  // Listener para navegação rápida entre módulos (ex: da Bancada para Baixa ou da Passagem para Checklist)
  useEffect(() => {
    const handleNavegarModulo = (e: any) => {
      if (e.detail?.modulo) {
        if (e.detail.aba) {
          sessionStorage.setItem('bancada_aba_ativa', e.detail.aba);
        }
        setModuloAtual(e.detail.modulo);
      }
    };
    window.addEventListener('navegar_modulo', handleNavegarModulo);
    return () => window.removeEventListener('navegar_modulo', handleNavegarModulo);
  }, []);

  useEffect(() => {
    const handleAbrirHorarios = () => setModalConfigHorariosAberto(true);
    window.addEventListener('porttohub:abrir_config_horarios', handleAbrirHorarios);
    return () => window.removeEventListener('porttohub:abrir_config_horarios', handleAbrirHorarios);
  }, []);


  // Mantém a variável global idCondominioAtivo sempre sincronizada para prevenir ReferenceError em todo o sistema
  useEffect(() => {
    const idAtivo = condominioAtivoId || operador?.condominio_id || '';
    if (typeof window !== 'undefined') {
      (window as any).idCondominioAtivo = idAtivo;
    }
  }, [condominioAtivoId, operador?.condominio_id]);

  // Escuta alterações de condomínio disparadas por subcomponentes (ex: cards do Cadastros)
  useEffect(() => {
    const handleCondominioAlterado = (e: any) => {
      const novoId = e.detail?.novoCondominioId;
      if (novoId && novoId !== condominioAtivoId) {
        setCondominioAtivoId(novoId);
        const cObj = listaCondominios.find(c => c.id === novoId) || e.detail?.condominio;
        if (cObj) setCondominio(cObj);
        localStorage.setItem('infport_condominio_ativo_id', novoId);
        if (typeof window !== 'undefined') {
          (window as any).idCondominioAtivo = novoId;
        }
      }
    };
    window.addEventListener('infport:condominio_alterado', handleCondominioAlterado);
    return () => window.removeEventListener('infport:condominio_alterado', handleCondominioAlterado);
  }, [condominioAtivoId, listaCondominios]);

  const trocarCondominioGlobal = async (novoId: string) => {
    if (!novoId || !isCondominioIdValido(novoId)) return;
    const permitido = listaCondominios.some(c => c.id === novoId);
    if (!permitido && !eSuperAdminGlobal) {
      console.warn('[Autorização] Tentativa bloqueada de trocar para condomínio não autorizado:', novoId);
      return;
    }

    const seqAtual = ++trocaCondoSeqRef.current;
    const idAnterior = condominioAtivoId;

    // 1. Limpa contexto anterior imediatamente antes de carregar o novo condomínio
    setCondominio(null);
    limparCacheUrlsAssinadas();
    if (idAnterior) {
      limparCacheRamCondominio(idAnterior);
      limparCachesDeCondominio(idAnterior);
      await limparCacheLocalCondominio(idAnterior).catch(() => {});
      await invalidarCacheCondominio(idAnterior).catch(() => {});
    }
    await invalidarCacheCondominio(novoId).catch(() => {});

    if (seqAtual !== trocaCondoSeqRef.current) return;

    setCondominioAtivoId(novoId);
    localStorage.setItem('infport_condominio_ativo_id', novoId);
    const cObj = listaCondominios.find(c => c.id === novoId) || null;
    setCondominio(cObj);

    // Notifica módulos para descartar estados do condomínio anterior antes das novas consultas
    window.dispatchEvent(new CustomEvent('infport:condominio_alterado', { detail: { novoCondominioId: novoId, condominio: cObj } }));
    window.dispatchEvent(new CustomEvent('infport_sincronizar_dados_global'));
    window.dispatchEvent(new CustomEvent('lembretes_portaria_atualizados', { detail: { condominioId: novoId } }));
    window.dispatchEvent(new CustomEvent('operadores_atualizados', { detail: { condominioId: novoId } }));

    // Pré-aquece dados do novo condomínio em background
    aquecerCacheCondominio(novoId).catch(() => {});
    carregarEPreaquecerEncomendas(novoId).catch(() => {});
  };

  const carregarCondominiosHeader = async () => {
    if (!operador) return;
    try {
      const [{ data: condos }, vinculosRes] = await Promise.all([
        supabase.from('condominios').select('*').order('nome'),
        buscarVinculosCondominiosOperador(operador.id)
      ]);
      if (!Array.isArray(condos)) return;

      const contexto = resolverContextoCondominiosOperador({
        operador,
        condominiosDisponiveis: condos,
        vinculosExplicitosIds: vinculosRes.ids,
        tabelaVinculosDisponivel: vinculosRes.tabelaDisponivel,
        condominioPreferidoId: condominioAtivoId || localStorage.getItem('infport_condominio_ativo_id')
      });

      if (contexto.bloqueado) {
        setListaCondominios([]);
        setCondominioAtivoId('');
        setCondominio(null);
        return;
      }

      setContextoCondos(contexto);
      setListaCondominios(contexto.condominiosPermitidos);
      if (contexto.condominioInicialId && contexto.condominioInicialId !== condominioAtivoId) {
        setCondominioAtivoId(contexto.condominioInicialId);
        const cObj = contexto.condominiosPermitidos.find(c => c.id === contexto.condominioInicialId) || null;
        setCondominio(cObj);
        localStorage.setItem('infport_condominio_ativo_id', contexto.condominioInicialId);
      }
      if (contexto.condominioInicialId) {
        salvarCacheLocal('condominios', contexto.condominiosPermitidos, contexto.condominioInicialId);
      }
    } catch (err) {
      console.warn('Erro ao carregar condomínios autorizados:', err);
    }
  };

  const resetarFeatureFlagsPadrao = () => {
    setFeatureFlags({
      mod01_cadastros_base: true,
      mod02_gestao_encomendas: true,
      mod03_custodia_itens: true,
      mod04_materiais_posto: true,
      mod05_quadro_chaves: true,
      mod06_gestao_manutencao: true,
      mod07_gestao_ronda: true,
      mod08_livro_ocorrencias: true,
      mod09_passagem_posto: true,
      mod10_prestadores_servico: true,
      mod11_bancada_conferencia: true,
      mod12_historico_absoluto: true,
      mod_portal_sindico: true,
      mod_guia_operacional: true,
      mod15_reserva_areas: true,
      mod16_controle_acesso: true
    });
  };

  const carregarFeatureFlags = async (condominioId: string) => {
    let idFinal = condominioId;
    if (!idFinal || idFinal === 'todos' || idFinal === 'global' || !isUUID(idFinal)) {
      const idSalvo = localStorage.getItem('infport_condominio_ativo_id');
      if (idSalvo && idSalvo !== 'todos' && idSalvo !== 'global' && isUUID(idSalvo)) {
        idFinal = idSalvo;
      } else if (listaCondominios && listaCondominios.length > 0) {
        idFinal = listaCondominios[0].id;
      } else {
        return;
      }
    }
    try {
      const flagsConsolidadas = await carregarModulosCondominio(idFinal);
      setFeatureFlags(prev => ({
        ...prev,
        ...flagsConsolidadas
      }));
      return;
    } catch (e) {
      console.warn('Erro ao carregar modulosService:', e);
    }

    try {
      // 1. Tenta carregar do localStorage primeiro para resposta instantânea
      const cacheLocal = localStorage.getItem(`infport_flags_${condominioId}`);
      if (cacheLocal) {
        try {
          const parsed = JSON.parse(cacheLocal);
          setFeatureFlags(prev => ({
            ...prev,
            ...parsed
          }));
        } catch {
          // ignore
        }
      }

      const { data, error } = await supabase
        .from('configuracoes')
        .select('*')
        .eq('condominio_id', condominioId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const ff = (typeof data.feature_flags === 'object' && data.feature_flags !== null) 
          ? data.feature_flags 
          : {};

        const resolverFlag = (chave: string, padrao: boolean = true) => {
          if (ff[chave] !== undefined && ff[chave] !== null) return Boolean(ff[chave]);
          if (data[chave] !== undefined && data[chave] !== null) return Boolean(data[chave]);
          return padrao;
        };

        const novasFlags = {
          mod01_cadastros_base: resolverFlag('mod01_cadastros_base'),
          mod02_gestao_encomendas: resolverFlag('mod02_gestao_encomendas'),
          mod03_custodia_itens: resolverFlag('mod03_custodia_itens'),
          mod04_materiais_posto: resolverFlag('mod04_materiais_posto'),
          mod05_quadro_chaves: resolverFlag('mod05_quadro_chaves'),
          mod06_gestao_manutencao: resolverFlag('mod06_gestao_manutencao'),
          mod07_gestao_ronda: resolverFlag('mod07_gestao_ronda'),
          mod08_livro_ocorrencias: resolverFlag('mod08_livro_ocorrencias'),
          mod09_passagem_posto: resolverFlag('mod09_passagem_posto'),
          mod10_prestadores_servico: resolverFlag('mod10_prestadores_servico'),
          mod11_bancada_conferencia: resolverFlag('mod11_bancada_conferencia'),
          mod12_historico_absoluto: resolverFlag('mod12_historico_absoluto'),
          mod_portal_sindico: resolverFlag('mod_portal_sindico'),
          mod_guia_operacional: resolverFlag('mod_guia_operacional'),
          mod15_reserva_areas: resolverFlag('mod15_reserva_areas'),
          mod16_controle_acesso: resolverFlag('mod16_controle_acesso')
        };

        setFeatureFlags(novasFlags);
        localStorage.setItem(`infport_flags_${condominioId}`, JSON.stringify(novasFlags));
      } else {
        resetarFeatureFlagsPadrao();
      }
    } catch (err) {
      console.error('Erro ao carregar Feature Flags:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setAvisoTurnoLogin('');

    try {
      if (!isSupabaseConfigurado()) {
        const msgCfg = obterErroConfiguracaoSupabase() || 'Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).';
        console.error('[PorttoHub][Login] Configuração ausente:', msgCfg);
        setErro(msgCfg);
        setLoading(false);
        return;
      }

      const emailLimpo = login.trim().toLowerCase();
      const senhaLimpa = senha;

      if (!emailLimpo || !emailLimpo.includes('@')) {
        setErro('Informe o e-mail completo cadastrado no Supabase Auth (ex: operador@condominio.com). O acesso com usuário/senha em texto puro foi desativado por segurança.');
        setLoading(false);
        return;
      }

      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: senhaLimpa
      });

      if (authErr || !authData?.user) {
        console.error('[PorttoHub][Login] Erro retornado por supabase.auth.signInWithPassword:', authErr);
        setErro(
          authErr
            ? formatarErroDetalhadoSupabase(authErr, 'Falha no login Supabase Auth')
            : 'Supabase Auth não retornou dados do usuário após autenticação.'
        );
        setLoading(false);
        return;
      }

      const authUser = authData.user;

      let { data: opData, error: opErr } = await supabase
        .from('operadores')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (opErr) {
        console.error('[PorttoHub][Login] Erro ao consultar public.operadores por auth_user_id:', opErr);
        await supabase.auth.signOut();
        setErro(formatarErroDetalhadoSupabase(opErr, 'Falha ao ler tabela operadores (possível bloqueio RLS ou schema desatualizado)'));
        setLoading(false);
        return;
      }

      if (!opData && authUser.email) {
        const fallbackEmail = await supabase
          .from('operadores')
          .select('*')
          .ilike('email', authUser.email.trim().toLowerCase())
          .maybeSingle();

        if (fallbackEmail.error) {
          console.error('[PorttoHub][Login] Erro ao consultar public.operadores por e-mail:', fallbackEmail.error);
          await supabase.auth.signOut();
          setErro(formatarErroDetalhadoSupabase(fallbackEmail.error, 'Falha ao consultar operador por e-mail (verifique RLS)'));
          setLoading(false);
          return;
        }

        if (fallbackEmail.data) {
          opData = fallbackEmail.data;
          if (!opData.auth_user_id) {
            const { error: updErr } = await supabase
              .from('operadores')
              .update({ auth_user_id: authUser.id, migrado_auth_em: new Date().toISOString() })
              .eq('id', opData.id);
            if (updErr) {
              console.warn('[PorttoHub][Login] Erro ao gravar auth_user_id no operador:', updErr);
            } else {
              opData.auth_user_id = authUser.id;
            }
          }
        }
      }

      if (!opData) {
        await supabase.auth.signOut();
        setErro(
          `Usuário autenticado no Supabase Auth (${authUser.email || authUser.id}), porém nenhum registro correspondente foi encontrado ou liberado pela RLS em public.operadores.`
        );
        setLoading(false);
        return;
      }

      if (opData.ativo === false) {
        await supabase.auth.signOut();
        setErro('Esta conta de acesso está desativada (ativo = false). Entre em contato com a supervisão.');
        setLoading(false);
        return;
      }

      const resCtx = await resolverEAplicarContextoOperador(
        opData,
        lembrarAcesso ? localStorage.getItem('infport_condominio_ativo_id') : null
      );

      if (!resCtx.autorizado || !resCtx.opNormalizado || !resCtx.contexto) {
        await supabase.auth.signOut();
        setErro(resCtx.motivoBloqueio || 'Seu usuário não possui condomínio válido autorizado.');
        setLoading(false);
        return;
      }

      const opFinal = resCtx.opNormalizado;
      const idCondFinal = resCtx.contexto.condominioInicialId;

      setOperador(opFinal);
      const nomeAtivoLogin = opFinal.nome || opFinal.login || opFinal.email || '';
      localStorage.setItem('infport_ultimo_operador_nome', nomeAtivoLogin);
      (window as any).__operadorAtivoNome = nomeAtivoLogin;
      (window as any).__operadorAtivo = opFinal;

      if (idCondFinal) {
        carregarNiveisAcesso(idCondFinal);
        preCarregarDadosCondominio(idCondFinal);
        checarEDispararAlarmeTrocaPlantao(idCondFinal);
      } else {
        carregarNiveisAcesso();
      }

      if (lembrarAcesso) {
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify({
          operadorId: opFinal.id,
          condominioId: idCondFinal,
          salvoEm: new Date().toISOString()
        }));
      } else {
        localStorage.removeItem(CHAVE_SESSAO);
      }

      registrarAtividade({
        modulo: 'Sistema',
        acao: 'LOGIN',
        descricao: `Operador ${nomeAtivoLogin} iniciou sessão autenticada no sistema.`,
        detalhes: { operadorId: opFinal.id, perfil: opFinal.perfil, condominioId: idCondFinal },
        operador_nome: nomeAtivoLogin,
        operador_id: opFinal.id,
        operador_login: opFinal.login || opFinal.email,
        condominio_id: idCondFinal || null
      });

      mudarModulo(resCtx.contexto.eSindico ? 'painel_sindico' : 'dashboard');
    } catch (err: any) {
      console.error('[PorttoHub][Login] Exceção inesperada durante login:', err);
      setErro(formatarErroDetalhadoSupabase(err, 'Erro inesperado durante autenticação'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (operador) {
      registrarAtividade({
        modulo: 'Sistema',
        acao: 'LOGOUT',
        descricao: `Operador ${operador.nome || operador.login} encerrou a sessão.`,
        detalhes: { operadorId: operador.id, login: operador.login },
        operador_nome: operador.nome || operador.login,
        operador_id: operador.id,
        operador_login: operador.login,
        condominio_id: condominioAtivoId || operador.condominio_id
      });
    }

    try {
      await supabase.auth.signOut();
    } catch {}

    // Limpa cache em memória, URLs assinadas e caches de leitura, preservando fila de ações offline no IndexedDB
    limparCacheUrlsAssinadas();
    limparCacheRamCondominio();
    limparCachesLeituraPorLogout();
    limparTodosCachesLeituraIndexedDb().catch(() => {});
    limparTodoCache().catch(() => {});
    if (typeof window !== 'undefined') {
      delete (window as any).__operadorAtivo;
      delete (window as any).__operadorAtivoNome;
      delete (window as any).idCondominioAtivo;
    }

    setOperador(null);
    setCondominio(null);
    setContextoCondos(null);
    setListaCondominios([]);
    setLogin('');
    setSenha('');
    setCondominioAtivoId('');
    setDrawerMobileAberto(false);
  };

  const handleTrocarOperador = async (novoOperador: any) => {
    if (!novoOperador) return;

    // Isolamento estrito: troca de turno só pode sugerir operador do mesmo condomínio ativo
    if (condominioAtivoId && novoOperador.condominio_id && novoOperador.condominio_id !== condominioAtivoId && !eSuperAdminGlobal) {
      setErro('Troca de operador bloqueada: operador selecionado pertence a outro condomínio.');
      return;
    }

    const emailDestino = (novoOperador.email || (String(novoOperador.login || '').includes('@') ? novoOperador.login : '') || '').trim();
    const nomeDestino = novoOperador.nome || novoOperador.login || 'Operador Entrante';

    registrarAtividade({
      modulo: 'Passagem de Posto',
      acao: 'TROCA_OPERADOR_SOLICITADA',
      descricao: `Passagem de posto concluída. Aguardando autenticação real de ${nomeDestino}.`,
      detalhes: { operadorDestinoId: novoOperador.id, condominioId: condominioAtivoId },
      operador_nome: operador?.nome || operador?.login || 'Portaria',
      operador_id: operador?.id || null,
      operador_login: operador?.login || null,
      condominio_id: condominioAtivoId || null
    });

    await handleLogout();
    if (emailDestino) {
      setLogin(emailDestino);
    }
    setAvisoTurnoLogin(`Passagem de posto registrada para ${nomeDestino}. Confirme o e-mail e senha para assumir o turno com segurança.`);
  };

  const objCondominioSelecionado = listaCondominios.find(c => c.id === condominioAtivoId);

  const operadorContextoGlobal = operador ? {
    ...operador,
    somenteLeitura: eSindico,
    eSindico: eSindico,
    eSuperAdminGlobal: eSuperAdminGlobal,
    condominio_id: condominioAtivoId || (isCondominioIdValido(operador.condominio_id) ? operador.condominio_id : ''),
    condominio_nome: objCondominioSelecionado?.nome || condominio?.nome || 'Condomínio Ativo',
    listaCondominios: listaCondominios
  } : null;

  // Regra de segurança: Configurações restrito ao Nível 0 ou Admin Geral explícito
  const ehNivel0Adm = Boolean(
    eSuperAdminGlobal ||
    operador?.perfil?.toLowerCase() === 'admin' ||
    operador?.perfil?.toLowerCase() === 'admin_geral' ||
    Number(operador?.nivel_acesso) === 0 ||
    (operador as any)?.nivel_acesso_custom_id === 'nivel_0'
  );

  const podeAcessarConfiguracoes = Boolean(
    !eSindico && ehNivel0Adm
  );
  const podeAcessarCadastros = Boolean(
    eAdmin || operador?.perfil === 'master' || operador?.nivel_acesso === 1 || verificarPermissao(operadorContextoGlobal, 'cadastros', 'visualizar')
  );

  const modulosDisponiveis = [
    ...((eSindico || eAdmin) ? [{ 
      id: 'painel_sindico', 
      titulo: obterRotuloModulo('painel_sindico', customVisual.rotulosModulos, 'Síndico'), 
      icone: obterIconeModuloDinamico('painel_sindico', customVisual.iconesModulos, ShieldCheck), 
      flag: eSindico ? true : isModuloAtivo('painel_sindico', featureFlags), 
      cor: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
    }] : []),
    { 
      id: 'encomendas', 
      titulo: obterRotuloModulo('encomendas', customVisual.rotulosModulos, 'Encomendas'), 
      icone: obterIconeModuloDinamico('encomendas', customVisual.iconesModulos, Package), 
      flag: isModuloAtivo('encomendas', featureFlags) && verificarPermissao(operadorContextoGlobal, 'encomendas', 'visualizar'), 
      cor: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60' 
    },
    { 
      id: 'custodia', 
      titulo: obterRotuloModulo('custodia', customVisual.rotulosModulos, 'Custódia Itens'), 
      icone: obterIconeModuloDinamico('custodia', customVisual.iconesModulos, PackageCheck), 
      flag: isModuloAtivo('custodia', featureFlags) && verificarPermissao(operadorContextoGlobal, 'custodia', 'visualizar'), 
      cor: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60' 
    },
    { 
      id: 'prestadores', 
      titulo: obterRotuloModulo('prestadores', customVisual.rotulosModulos, 'Autorizados'), 
      icone: obterIconeModuloDinamico('prestadores', customVisual.iconesModulos, UserCheck), 
      flag: isModuloAtivo('prestadores', featureFlags) && (verificarPermissao(operadorContextoGlobal, 'autorizados', 'visualizar') || verificarPermissao(operadorContextoGlobal, 'prestadores', 'visualizar')), 
      cor: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/60' 
    },
    { 
      id: 'materiais', 
      titulo: obterRotuloModulo('materiais', customVisual.rotulosModulos, 'Materiais Posto'), 
      icone: obterIconeModuloDinamico('materiais', customVisual.iconesModulos, ClipboardList), 
      flag: isModuloAtivo('materiais', featureFlags) && verificarPermissao(operadorContextoGlobal, 'materiais', 'visualizar'), 
      cor: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800/60' 
    },
    { 
      id: 'chaves', 
      titulo: obterRotuloModulo('chaves', customVisual.rotulosModulos, 'Quadro Chaves'), 
      icone: obterIconeModuloDinamico('chaves', customVisual.iconesModulos, Key), 
      flag: isModuloAtivo('chaves', featureFlags) && verificarPermissao(operadorContextoGlobal, 'chaves', 'visualizar'), 
      cor: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60' 
    },
    { 
      id: 'manutencao', 
      titulo: obterRotuloModulo('manutencao', customVisual.rotulosModulos, 'Manutenção OS'), 
      icone: obterIconeModuloDinamico('manutencao', customVisual.iconesModulos, Wrench), 
      flag: isModuloAtivo('manutencao', featureFlags) && verificarPermissao(operadorContextoGlobal, 'manutencao', 'visualizar'), 
      cor: 'bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60' 
    },
    { 
      id: 'rondas', 
      titulo: obterRotuloModulo('rondas', customVisual.rotulosModulos, 'Rondas QR'), 
      icone: obterIconeModuloDinamico('rondas', customVisual.iconesModulos, QrCode), 
      flag: isModuloAtivo('rondas', featureFlags) && verificarPermissao(operadorContextoGlobal, 'rondas', 'visualizar'), 
      cor: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700' 
    },
    { 
      id: 'ocorrencias', 
      titulo: obterRotuloModulo('ocorrencias', customVisual.rotulosModulos, 'Ocorrências'), 
      icone: obterIconeModuloDinamico('ocorrencias', customVisual.iconesModulos, BookOpen), 
      flag: isModuloAtivo('ocorrencias', featureFlags) && verificarPermissao(operadorContextoGlobal, 'ocorrencias', 'visualizar'), 
      cor: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/60' 
    },
    { 
      id: 'passagem', 
      titulo: obterRotuloModulo('passagem', customVisual.rotulosModulos, 'Passagem de Posto'), 
      icone: obterIconeModuloDinamico('passagem', customVisual.iconesModulos, Repeat), 
      flag: isModuloAtivo('passagem', featureFlags) && (verificarPermissao(operadorContextoGlobal, 'passagem_posto', 'visualizar') || verificarPermissao(operadorContextoGlobal, 'passagem', 'visualizar')), 
      cor: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/60' 
    },
    { 
      id: 'bancada', 
      titulo: obterRotuloModulo('bancada', customVisual.rotulosModulos, 'Bancada'), 
      icone: obterIconeModuloDinamico('bancada', customVisual.iconesModulos, Layers), 
      flag: isModuloAtivo('bancada', featureFlags) && verificarPermissao(operadorContextoGlobal, 'bancada', 'visualizar'), 
      cor: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800/60' 
    },
    ...(podeAcessarCadastros && verificarPermissao(operadorContextoGlobal, 'cadastros', 'visualizar') ? [{ 
      id: 'cadastros', 
      titulo: obterRotuloModulo('cadastros', customVisual.rotulosModulos, 'Cadastros Base'), 
      icone: obterIconeModuloDinamico('cadastros', customVisual.iconesModulos, Database), 
      flag: isModuloAtivo('cadastros', featureFlags), 
      cor: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700' 
    }] : []),
    ...(verificarPermissao(operadorContextoGlobal, 'historico_absoluto', 'visualizar') ? [{ 
      id: 'historico_absoluto', 
      titulo: obterRotuloModulo('historico_absoluto', customVisual.rotulosModulos, 'Histórico Absoluto'), 
      icone: obterIconeModuloDinamico('historico_absoluto', customVisual.iconesModulos, History), 
      flag: isModuloAtivo('historico_absoluto', featureFlags), 
      cor: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60' 
    }] : []),
    { 
      id: 'controle_acesso', 
      titulo: obterRotuloModulo('controle_acesso', customVisual.rotulosModulos, 'Controle de Acesso'), 
      icone: obterIconeModuloDinamico('controle_acesso', customVisual.iconesModulos, Scan), 
      flag: isModuloAtivo('controle_acesso', featureFlags) && (verificarPermissao(operadorContextoGlobal, 'controle_acesso', 'visualizar') || verificarPermissao(operadorContextoGlobal, 'autorizados', 'visualizar')), 
      cor: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60' 
    },
    { 
      id: 'reservas', 
      titulo: obterRotuloModulo('reservas', customVisual.rotulosModulos, 'Reserva de Áreas'), 
      icone: obterIconeModuloDinamico('reservas', customVisual.iconesModulos, Calendar), 
      flag: isModuloAtivo('reservas', featureFlags) && verificarPermissao(operadorContextoGlobal, 'reservas', 'visualizar'), 
      cor: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60' 
    },
  ].filter(m => !isModuloOculto(m.id, customVisual.modulosOcultos));

  // Se o módulo ativo no momento for desativado nas flags ou bloqueado pelo perfil, redireciona para o dashboard
  useEffect(() => {
    if (moduloAtual !== 'dashboard' && moduloAtual !== 'painel_sindico') {
      const modAtivo = modulosDisponiveis.find(m => m.id === moduloAtual);
      if (!modAtivo || !modAtivo.flag) {
        setModuloAtual('dashboard');
      }
    }
  }, [featureFlags, moduloAtual, versaoPermissoes, operador, customVisual]);

  if (podeAcessarConfiguracoes && !isModuloOculto('configuracoes', customVisual.modulosOcultos)) {
    modulosDisponiveis.push({ 
      id: 'configuracoes', 
      titulo: obterRotuloModulo('configuracoes', customVisual.rotulosModulos, 'Configurações'), 
      icone: obterIconeModuloDinamico('configuracoes', customVisual.iconesModulos, Settings), 
      flag: true, 
      cor: 'bg-slate-800 text-white border-slate-900' 
    });
  }

  // Módulo de Manual Oficial & Guia Operacional (Logo abaixo de Configurações no menu)
  if (isModuloAtivo('guia_operacional', featureFlags) && !isModuloOculto('guia_operacional', customVisual.modulosOcultos)) {
    modulosDisponiveis.push({
      id: 'guia_operacional',
      titulo: obterRotuloModulo('guia_operacional', customVisual.rotulosModulos, 'Manual & Guia'),
      icone: obterIconeModuloDinamico('guia_operacional', customVisual.iconesModulos, BookOpen),
      flag: isModuloAtivo('guia_operacional', featureFlags),
      cor: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60'
    });
  }

  if (operador) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col md:flex-row font-sans pb-20 md:pb-0 text-slate-900 dark:text-slate-100 antialiased transition-colors duration-200">
        
        {/* SIDEBAR DESKTOP */}
        <aside className={`hidden md:flex bg-slate-900 text-white flex-col justify-between transition-all duration-300 z-30 ${
          menuAberto ? 'w-64' : 'w-20'
        } shrink-0 min-h-screen sticky top-0`}>
          
          <div>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <EmblemaInfport tamanho="md" condominioId={condominioAtivoId || operador?.condominio_id} />
                {menuAberto && (
                  <div>
                    <h1 className="font-bold text-base leading-tight flex items-center gap-2">
                      {customVisual.nomeAplicacao || 'PorttoHub'} <span className="text-[10px] bg-slate-800 text-emerald-400 font-mono px-2 py-0.5 rounded">PWA</span>
                    </h1>
                    {customVisual.subtituloAplicacao && (
                      <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] leading-tight mt-0.5">
                        {customVisual.subtituloAplicacao}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 truncate max-w-[150px]">
                      {operadorContextoGlobal.condominio_nome}
                    </p>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setMenuAberto(!menuAberto)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                {menuAberto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {eAcessoMultiCondominio && !eSindico && menuAberto && listaCondominios.length > 0 && (
              <div className="p-3 bg-slate-800/80 mx-3 mt-3 rounded-xl border border-slate-700/60 space-y-1">
                <label className="block text-xs font-bold text-emerald-400 uppercase flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Condomínio Ativo
                </label>
                <select
                  value={condominioAtivoId}
                  onChange={(e) => trocarCondominioGlobal(e.target.value)}
                  className="w-full bg-slate-900 text-white text-xs font-bold p-2.5 rounded-lg border border-slate-600 focus:outline-none"
                >
                  {listaCondominios.map((c) => (
                    <option key={c.id} value={c.id}>🏢 {c.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-250px)]">
              {!eSindico && (
                <button
                  onClick={() => mudarModulo('dashboard')}
                  className={`w-full px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all duration-150 cursor-pointer ${
                    moduloAtual === 'dashboard'
                      ? 'bg-emerald-500/15 text-emerald-400 border-l-2 border-emerald-500 shadow-2xs font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Home className="w-4 h-4 shrink-0" />
                    {menuAberto && <span>Painel Principal</span>}
                  </div>
                </button>
              )}

              {modulosDisponiveis.filter(m => m.flag).map((item) => {
                const IconeComponente = item.icone;
                const ativo = moduloAtual === item.id;
                const eAutorizados = item.id === 'prestadores';
                return (
                  <div key={item.id} className="relative flex items-center group">
                    <button
                      onClick={() => mudarModulo(item.id)}
                      className={`w-full px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all duration-150 cursor-pointer ${
                        ativo
                          ? 'bg-emerald-500/15 text-emerald-400 border-l-2 border-emerald-500 shadow-2xs font-bold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <IconeComponente className="w-4 h-4 shrink-0" />
                        {menuAberto && <span>{item.titulo}</span>}
                      </div>
                    </button>
                    {eAutorizados && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalConfigHorariosAberto(true);
                        }}
                        className={`absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-slate-700/80 transition cursor-pointer z-10 ${
                          menuAberto ? 'opacity-80 group-hover:opacity-100' : 'hidden'
                        }`}
                        title="Configurar horários de obras e mudanças"
                        aria-label="Configurar horários"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="p-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-1">
            {menuAberto && (
              <div
                onClick={() => setModalMeuPerfilAberto(true)}
                className="flex items-center gap-2 overflow-hidden cursor-pointer hover:opacity-85 transition group"
                title="Meu Perfil & Alterar Senha"
              >
                {operador.foto_url ? (
                  <img 
                    src={operador.foto_url} 
                    alt={operador.nome} 
                    loading="lazy"
                    decoding="async"
                    className="w-8 h-8 rounded-full object-cover border-2 border-emerald-400 shrink-0" 
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition">
                    {operador.nome?.charAt(0)}
                  </div>
                )}
                <div className="truncate">
                  <p className="text-xs sm:text-sm font-bold text-white truncate flex items-center gap-1">
                    {operador.nome}
                    <KeyRound className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase font-mono">
                    {eAdmin ? 'DEV ADMIN' : (eSindico ? '🛡️ SÍNDICO (CONSULTA)' : `NÍVEL ${operador.nivel_acesso ?? 3}`)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setModalMeuPerfilAberto(true)}
                className="text-slate-400 hover:text-emerald-400 hover:bg-slate-800 p-2 rounded-xl transition font-bold text-xs cursor-pointer"
                title="Meu Perfil & Senha"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="bg-red-600/90 hover:bg-red-700 text-white p-2 rounded-xl transition font-bold text-xs cursor-pointer"
                title="Sair do Sistema"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* DRAWER MOBILE MODERNO E FLUIDO */}
        {drawerMobileAberto && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex justify-start md:hidden animate-in fade-in duration-200">
            <div className="w-[85%] max-w-xs bg-slate-900 h-full flex flex-col justify-between p-4 shadow-2xl border-r border-slate-800 animate-in slide-in-from-left duration-200 overflow-y-auto">
              <div className="space-y-3">
                {/* Cabeçalho do Drawer */}
                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <EmblemaInfport tamanho="sm" condominioId={condominioAtivoId || operador?.condominio_id} />
                    <div>
                      <span className="font-black text-white text-sm tracking-tight block">
                        {customVisual.nomeAplicacao || 'PorttoHub'}
                      </span>
                      {customVisual.subtituloAplicacao && (
                        <span className="text-[10px] text-slate-400 font-medium block truncate max-w-[140px] leading-tight">
                          {customVisual.subtituloAplicacao}
                        </span>
                      )}
                      <span className="text-[10px] text-emerald-400 font-mono font-bold block">
                        v{VERSAO_BUILD_ATUAL} • PWA Offline
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setDrawerMobileAberto(false)} 
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    aria-label="Fechar Menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Seletor de Condomínio Ativo apenas para perfis autorizados a múltiplos condomínios */}
                {eAcessoMultiCondominio && !eSindico && listaCondominios.length > 0 && (
                  <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-1">
                    <label className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Condomínio Ativo
                    </label>
                    <select
                      value={condominioAtivoId}
                      onChange={(e) => trocarCondominioGlobal(e.target.value)}
                      className="w-full bg-slate-900 text-white text-xs font-bold p-2 rounded-lg border border-slate-600 focus:outline-none"
                    >
                      {listaCondominios.map((c) => (
                        <option key={c.id} value={c.id}>🏢 {c.nome}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Lista Categorizada de Módulos */}
                <div className="py-1 space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                  {!eSindico && (
                    <button
                      onClick={() => {
                        mudarModulo('dashboard');
                        setDrawerMobileAberto(false);
                      }}
                      className={`w-full p-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition cursor-pointer ${
                        moduloAtual === 'dashboard'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Home className="w-4 h-4 text-emerald-400" />
                      <span>Painel Geral</span>
                    </button>
                  )}

                  {modulosDisponiveis.filter(m => m.flag).map((item) => {
                    const Icone = item.icone;
                    const ativo = moduloAtual === item.id;
                    const eAutorizados = item.id === 'prestadores';
                    return (
                      <div key={item.id} className="relative flex items-center">
                        <button
                          onClick={() => {
                            mudarModulo(item.id);
                            setDrawerMobileAberto(false);
                          }}
                          className={`w-full p-2.5 rounded-xl font-bold text-xs flex items-center gap-3 transition cursor-pointer ${
                            ativo
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <Icone className={`w-4 h-4 ${ativo ? 'text-white' : 'text-emerald-400'}`} />
                          <span>{item.titulo}</span>
                        </button>
                        {eAutorizados && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalConfigHorariosAberto(true);
                              setDrawerMobileAberto(false);
                            }}
                            className="absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-slate-800 transition cursor-pointer z-10"
                            title="Configurar horários de obras e mudanças"
                            aria-label="Configurar horários"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={() => {
                      setModalLeitorNfcGlobal(true);
                      setDrawerMobileAberto(false);
                    }}
                    className="w-full p-2.5 rounded-xl font-bold text-xs flex items-center gap-3 text-emerald-400 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-500/20 transition mt-2 cursor-pointer"
                  >
                    <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span>Leitor NFC / Tags</span>
                  </button>
                </div>
              </div>

              {/* Rodapé do Drawer com Ações e Sair */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center text-[11px] text-slate-400 px-1">
                  <span className="flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Online & Sincronizado
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMeuPerfilAberto(true);
                      setDrawerMobileAberto(false);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-700"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Meu Perfil</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="py-2 px-3.5 rounded-xl bg-red-600/90 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                    title="Sair do Sistema"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {!eSindico && (
            <AlertaRondaGlobal 
              onNavegarRondas={() => mudarModulo('rondas')} 
              onNavegarModulo={(mod) => mudarModulo(mod)}
              usuarioLogado={operadorContextoGlobal} 
              condominioId={condominioAtivoId || operador?.condominio_id}
              moduloRondaHabilitado={Boolean(featureFlags.mod07_gestao_ronda)}
            />
          )}

          {/* CONTROLE CONDICIONAL DE CABEÇALHO SUPERIOR */}
          {moduloAtual === 'dashboard' ? (
            /* CABEÇALHO DO PAINEL PRINCIPAL: Emblema e texto PorttoHub ficam APENAS aqui */
            <HeaderBarPrincipal
              condominioId={condominioAtivoId || operador?.condominio_id || ''}
              condominioNome={operadorContextoGlobal?.condominio_nome}
              operador={operadorContextoGlobal}
              eAdmin={eAdmin}
              eSindico={eSindico}
              onAbrirDrawerMobile={() => setDrawerMobileAberto(true)}
              onAbrirNotificacoes={() => setModalLembretesAberto(true)}
              onAbrirDoctor={() => setModalSupabaseDoctorAberto(true)}
              onAbrirMeuPerfil={() => setModalMeuPerfilAberto(true)}
              onAbrirVersaoInfo={() => setModalVersaoInfoAberto(true)}
              onLogout={handleLogout}
              onNavegarModulo={(mod) => mudarModulo(mod)}
            />
          ) : (
            /* CABEÇALHO DENTRO DOS MENUS E FUNÇÕES: Botão Voltar + Nome do Menu/Função + Acessibilidade & Sistema */
            <BarraTopoMenus
              moduloId={moduloAtual}
              tituloModulo={
                modulosDisponiveis.find(m => m.id === moduloAtual)?.titulo || 
                (moduloAtual === 'painel_sindico' ? 'Portal Síndico' : (moduloAtual === 'guia_operacional' ? 'Manual & Guia' : 'Menu Operacional'))
              }
              iconeModulo={
                modulosDisponiveis.find(m => m.id === moduloAtual)?.icone || 
                (moduloAtual === 'painel_sindico' ? ShieldCheck : Grid)
              }
              onVoltar={voltarModulo}
              condominioNome={operadorContextoGlobal?.condominio_nome}
              condominioId={condominioAtivoId || operador?.condominio_id || ''}
              operador={operadorContextoGlobal}
              eAdmin={eAdmin}
              eSindico={eSindico}
              onAbrirDoctor={() => setModalSupabaseDoctorAberto(true)}
              onAbrirNotificacoes={() => setModalLembretesAberto(true)}
              onAbrirMeuPerfil={() => setModalMeuPerfilAberto(true)}
              onAbrirVersaoInfo={() => setModalVersaoInfoAberto(true)}
              onAbrirDrawerMobile={() => setDrawerMobileAberto(true)}
              onLogout={handleLogout}
              onNavegarModulo={(mod) => mudarModulo(mod)}
            />
          )}

          <main className="flex-1 p-3.5 sm:p-5 md:p-6 overflow-y-auto text-slate-900 dark:text-slate-100 bg-slate-100/70 dark:bg-slate-950 transition-colors duration-200">
            
            {moduloAtual === 'dashboard' && (
              <div className="max-w-5xl mx-auto space-y-4">

                {/* Grid dos Módulos Operacionais Otimizado e Profissional */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1 gap-2 pt-1 pb-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-5 bg-emerald-500 rounded-full shrink-0" />
                        <h2 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-white tracking-tight truncate">
                          {operadorContextoGlobal.condominio_nome || 'Painel Operacional'}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 hidden sm:inline-block" />
                        <span>Operador:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold">
                          {operador.nome || operador.login}
                        </span>
                        <span className="hidden sm:inline text-slate-400">•</span>
                        <span className="hidden sm:inline text-[11px] font-mono bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                          {operador.turno_padrao || operador.turno || 'Plantão Ativo'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                    {modulosDisponiveis.filter(m => m.flag).map((item) => {
                      const Icone = item.icone;
                      const eAutorizados = item.id === 'prestadores';
                      return (
                        <div key={item.id} className="relative group">
                          <button
                            onClick={() => mudarModulo(item.id)}
                            className="w-full bg-white dark:bg-slate-900/95 hover:bg-slate-50 dark:hover:bg-slate-800/90 active:scale-95 p-2 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/40 dark:hover:border-emerald-500/40 shadow-xs hover:shadow-md flex flex-col items-center justify-center text-center gap-2 transition-all duration-200 cursor-pointer overflow-hidden min-h-[96px] sm:min-h-[108px]"
                          >
                            <div className={`p-2 sm:p-2.5 rounded-xl border ${item.cor} group-hover:scale-110 transition-transform duration-200 shadow-2xs flex items-center justify-center`}>
                              <Icone className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                            </div>
                            <div className="w-full flex items-center justify-center px-0.5">
                              <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors text-center leading-tight line-clamp-2">
                                {item.titulo}
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <ModuloErrorBoundary nomeModulo={moduloAtual}>
              <Suspense fallback={<ModuloLoadingFallback />}>
              {(moduloAtual === 'painel_sindico' || (eSindico && moduloAtual === 'dashboard')) ? (
                <PainelSindico
                  usuarioLogado={operadorContextoGlobal}
                  condominioAtivo={objCondominioSelecionado || condominio || { id: condominioAtivoId, nome: 'Condomínio Ativo' }}
                  listaCondominios={listaCondominios}
                  abaInicial={moduloAtual === 'painel_sindico' || moduloAtual === 'dashboard' ? 'resumo' : moduloAtual}
                  featureFlags={featureFlags}
                />
              ) : (
                <>
                  {moduloAtual === 'encomendas' && featureFlags.mod02_gestao_encomendas && (
                    <Encomendas usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'custodia' && featureFlags.mod03_custodia_itens && (
                    <Custodia usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'materiais' && featureFlags.mod04_materiais_posto && (
                    <Materiais usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'chaves' && featureFlags.mod05_quadro_chaves && (
                    <Chaves usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'manutencao' && featureFlags.mod06_gestao_manutencao && (
                    <Manutencao usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'rondas' && featureFlags.mod07_gestao_ronda && (
                    <Rondas usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'ocorrencias' && featureFlags.mod08_livro_ocorrencias && (
                    <Ocorrencias usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'passagem' && featureFlags.mod09_passagem_posto && (
                    <PassagemPosto 
                      usuarioLogado={operadorContextoGlobal} 
                      onTrocarOperador={handleTrocarOperador} 
                      featureFlags={featureFlags} 
                      condominioConfig={condominio} 
                      onNavegar={(mod, params) => {
                        if (params?.aba) {
                          sessionStorage.setItem('bancada_aba_ativa', params.aba);
                        }
                        setModuloAtual(mod);
                      }}
                    />
                  )}
                  {moduloAtual === 'prestadores' && featureFlags.mod10_prestadores_servico && (
                    <PrestadoresObras usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'bancada' && featureFlags.mod11_bancada_conferencia && (
                    <Bancada 
                      usuarioLogado={operadorContextoGlobal} 
                      onNavegar={(mod, params) => {
                        if (params?.abrirTrocaTurno) {
                          sessionStorage.setItem('abrir_modal_troca_turno', 'true');
                        }
                        setModuloAtual(mod);
                      }}
                    />
                  )}
                  {moduloAtual === 'cadastros' && podeAcessarCadastros && Boolean(featureFlags.mod01_cadastros_base ?? true) && (
                    <Cadastros 
                      usuarioLogado={operadorContextoGlobal} 
                      condominioAtivoProp={condominioAtivoId}
                      onTrocarCondominioGlobal={trocarCondominioGlobal}
                    />
                  )}
                  {moduloAtual === 'historico_absoluto' && Boolean(featureFlags.mod12_historico_absoluto ?? true) && (
                    <HistoricoAbsoluto 
                      operadorLogado={operadorContextoGlobal} 
                      condominioAtivo={objCondominioSelecionado || condominio || { id: condominioAtivoId, nome: 'Condomínio Ativo' }} 
                      listaCondominios={listaCondominios} 
                    />
                  )}
                  {moduloAtual === 'configuracoes' && podeAcessarConfiguracoes && (
                    <Configuracoes 
                      usuarioLogado={operadorContextoGlobal} 
                      onConfigSalva={() => carregarFeatureFlags(operadorContextoGlobal.condominio_id)} 
                    />
                  )}
                  {moduloAtual === 'guia_operacional' && Boolean(featureFlags.mod_guia_operacional ?? true) && (
                    <div className="max-w-5xl mx-auto space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-indigo-500" />
                            <span>{customVisual.rotulosModulos['guia_operacional'] || 'Manual Oficial & Guia Operacional'}</span>
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Apresentação detalhada de rotinas, normas operacionais e instruções da guarita
                          </p>
                        </div>
                        <button
                          onClick={() => mudarModulo('dashboard')}
                          className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                        >
                          ← Voltar ao Início
                        </button>
                      </div>
                      <TutorialOperacionalPorttoHub
                        onNavegarModulo={mudarModulo}
                        modulosDisponiveisIds={modulosDisponiveis.filter(m => m.flag).map(m => m.id)}
                        nomeCondominio={operadorContextoGlobal?.condominio_nome || 'Condomínio'}
                        eAdmin={eAdmin}
                      />
                    </div>
                  )}
                  {moduloAtual === 'reservas' && Boolean(featureFlags.mod15_reserva_areas ?? true) && (
                    <ReservaAreas usuarioLogado={operadorContextoGlobal} />
                  )}
                  {moduloAtual === 'controle_acesso' && Boolean(featureFlags.mod16_controle_acesso ?? true) && (
                    <ControleAcesso usuarioLogado={operadorContextoGlobal} />
                  )}
                </>
              )}
            </Suspense>
          </ModuloErrorBoundary>
          </main>

        </div>

        {/* BARRA INFERIOR MOBILE ERGONÔMICA & FLUIDA */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 text-slate-400 flex justify-around items-center h-16 z-40 px-1.5 shadow-2xl pb-[env(safe-area-inset-bottom)]">
          {eSindico ? (
            <>
              <button
                type="button"
                onClick={() => mudarModulo('painel_sindico')}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                  moduloAtual === 'painel_sindico' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-xl mb-0.5 ${moduloAtual === 'painel_sindico' ? 'bg-emerald-500/15' : ''}`}>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <span>Portal Síndico</span>
              </button>

              {modulosDisponiveis.some(m => m.id === 'ocorrencias' && m.flag) && (
                <button
                  type="button"
                  onClick={() => mudarModulo('ocorrencias')}
                  className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                    moduloAtual === 'ocorrencias' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className={`p-1 rounded-xl mb-0.5 ${moduloAtual === 'ocorrencias' ? 'bg-emerald-500/15' : ''}`}>
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <span>Ocorrências</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setDrawerMobileAberto(true)}
                className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold text-slate-400 hover:text-emerald-400 transition cursor-pointer active:scale-95"
              >
                <div className="p-1 rounded-xl hover:bg-slate-800 transition mb-0.5">
                  <Grid className="w-4 h-4" />
                </div>
                <span>Módulos</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer active:scale-95 transition"
              >
                <div className="p-1 rounded-xl bg-rose-500/10 mb-0.5">
                  <LogOut className="w-4 h-4 text-rose-400" />
                </div>
                <span>Sair</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => mudarModulo('dashboard')}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                  moduloAtual === 'dashboard'
                    ? 'text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-xl transition ${moduloAtual === 'dashboard' ? 'bg-emerald-500/15' : ''}`}>
                  <Home className={`w-4 h-4 ${moduloAtual === 'dashboard' ? 'text-emerald-400 stroke-[2.5]' : ''}`} />
                </div>
                <span className="truncate max-w-[60px]">Início</span>
              </button>

              {modulosDisponiveis.some(m => m.id === 'encomendas' && m.flag) && (
                <button
                  type="button"
                  onClick={() => mudarModulo('encomendas')}
                  className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                    moduloAtual === 'encomendas'
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className={`p-1 rounded-xl transition ${moduloAtual === 'encomendas' ? 'bg-emerald-500/15' : ''}`}>
                    <Package className={`w-4 h-4 ${moduloAtual === 'encomendas' ? 'text-emerald-400 stroke-[2.5]' : ''}`} />
                  </div>
                  <span className="truncate max-w-[65px]">Encomendas</span>
                </button>
              )}

              {modulosDisponiveis.some(m => m.id === 'ocorrencias' && m.flag) && (
                <button
                  type="button"
                  onClick={() => mudarModulo('ocorrencias')}
                  className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                    moduloAtual === 'ocorrencias'
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className={`p-1 rounded-xl transition ${moduloAtual === 'ocorrencias' ? 'bg-emerald-500/15' : ''}`}>
                    <BookOpen className={`w-4 h-4 ${moduloAtual === 'ocorrencias' ? 'text-emerald-400 stroke-[2.5]' : ''}`} />
                  </div>
                  <span className="truncate max-w-[65px]">Ocorrências</span>
                </button>
              )}

              {/* BOTÃO ACESSIBILIDADE NA BARRA DE MENU (NO LUGAR DE PASSAGEM DE POSTO) */}
              <ControleFonteAcessibilidade variante="barra_menu" />

              <button
                type="button"
                onClick={() => setDrawerMobileAberto(true)}
                className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold text-slate-400 hover:text-emerald-400 transition cursor-pointer active:scale-95"
              >
                <div className="p-1 rounded-xl hover:bg-slate-800 transition">
                  <Grid className="w-4 h-4" />
                </div>
                <span className="truncate max-w-[60px]">Menu</span>
              </button>
            </>
          )}
        </nav>

        {/* Indicador de Status Offline e Conexão na Portaria */}
        <IndicadorConectividade />
        <OfflineIndicator />

        {/* Modal Global do Leitor de Tags & Cartões NFC */}
        {modalLeitorNfcGlobal && (
          <Suspense fallback={null}>
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="max-w-md w-full">
                <LeitorNFC
                  titulo="Leitor de Tags & Cartões NFC"
                  subtitulo="Aproxime qualquer tag física, cartão ou chaveiro da portaria"
                  onTagLida={(tagLida, dadosExtras) => {
                    console.log('[App] Tag NFC lida:', tagLida, dadosExtras);
                  }}
                  onFechar={() => setModalLeitorNfcGlobal(false)}
                />
              </div>
            </div>
          </Suspense>
        )}

        {/* Modal de Gerenciamento e Customização de Módulos por Condomínio */}
        {modalGerenciadorModulosAberto && (
          <Suspense fallback={null}>
            <ModalGerenciadorModulosCondominio
              aberto={modalGerenciadorModulosAberto}
              onFechar={() => setModalGerenciadorModulosAberto(false)}
              listaCondominios={listaCondominios}
              condominioAtivoId={condominioAtivoId || operador?.condominio_id || ""}
              onSalvoComSucesso={(condoId, novasFlags) => {
                const condoAtual = (eAdmin || eAcessoMultiCondominio) ? (condominioAtivoId || operador?.condominio_id) : operador?.condominio_id;
                if (!condoId || !condoAtual || condoId === condoAtual || condoAtual === 'todos' || condoAtual === 'global') {
                  setFeatureFlags(prev => ({ ...prev, ...novasFlags }));
                }
              }}
            />
          </Suspense>
        )}

        {/* Modal de Meu Perfil & Troca de Senha */}
        {modalMeuPerfilAberto && (
          <Suspense fallback={null}>
            <ModalMeuPerfil
              isOpen={modalMeuPerfilAberto}
              onClose={() => setModalMeuPerfilAberto(false)}
              operador={operadorContextoGlobal}
              condominio={condominio}
              onOperadorAtualizado={(opAtualizado) => {
                setOperador(opAtualizado);
              }}
            />
          </Suspense>
        )}

        {/* Modal Global do Supabase Doctor */}
        {modalSupabaseDoctorAberto && (
          <Suspense fallback={null}>
            <SupabaseDoctorModal
              isOpen={modalSupabaseDoctorAberto}
              onClose={() => setModalSupabaseDoctorAberto(false)}
              onAbrirMigrador={() => {
                setModalSupabaseDoctorAberto(false);
                mudarModulo('configuracoes');
              }}
            />
          </Suspense>
        )}

        {/* Modal Global de Lembretes & Mensagens da Portaria (Portaria ⇄ Moradores) */}
        {modalLembretesAberto && (
          <Suspense fallback={null}>
            <ModalLembretesPortaria
              aberto={modalLembretesAberto}
              onFechar={() => setModalLembretesAberto(false)}
              condominioId={condominioAtivoId || operador?.condominio_id || ''}
              condominioNome={operadorContextoGlobal?.condominio_nome}
              operadorAtual={{
                id: operador?.id,
                nome: operador?.nome,
                login: operador?.login,
                perfil: operador?.perfil,
                nivel: operador?.nivel,
                nivel_acesso: operador?.nivel_acesso,
                nivel_acesso_custom_id: (operador as any)?.nivel_acesso_custom_id,
                eSuperAdminGlobal: eAdmin
              }}
            />
          </Suspense>
        )}

        {/* Modal de Versao e Repositorio GitHub que fica na tela */}
        {modalVersaoInfoAberto && (
          <Suspense fallback={null}>
            <ModalInfoVersaoRepositorio 
              aberto={modalVersaoInfoAberto} 
              onFechar={() => setModalVersaoInfoAberto(false)} 
            />
          </Suspense>
        )}

        {/* Modal de Configuração de Horários (Obras e Mudanças) */}
        {modalConfigHorariosAberto && (
          <Suspense fallback={null}>
            <ModalConfigHorariosObrasMudancas
              aberto={modalConfigHorariosAberto}
              onFechar={() => setModalConfigHorariosAberto(false)}
              condominioId={condominioAtivoId || operador?.condominio_id}
              condominioNome={operadorContextoGlobal?.condominio_nome}
              operadorNome={operadorContextoGlobal?.nome || operador?.nome}
            />
          </Suspense>
        )}

        {/* Notificação Flutuante de Nova Versão PWA */}
        <AlertaNovaVersaoPWA />

      </div>
    );
  }

  if (restaurandoSessao) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-16 h-16 mb-3 animate-pulse flex items-center justify-center">
          <EmblemaInfport tamanho="xl" />
        </div>
        <h1 className="text-lg font-bold tracking-tight">INFPORT 1.0</h1>
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          Restaurando sessão segura...
        </p>
      </div>
    );
  }

  if (!isSupabaseConfigurado()) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-900 dark:text-slate-100">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border border-amber-300 dark:border-amber-800 space-y-4">
          <div className="flex items-center gap-3">
            <EmblemaInfport tamanho="lg" />
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white">{NOME_APLICACAO}</h1>
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Configuração de Ambiente Pendente
              </p>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs sm:text-sm text-amber-900 dark:text-amber-200 space-y-2">
            <p className="font-bold">{obterErroConfiguracaoSupabase()}</p>
            <p>
              Por segurança, o sistema não utiliza mais banco hardcoded no código-fonte. Defina as variáveis de ambiente <code className="font-mono font-bold">VITE_SUPABASE_URL</code> e <code className="font-mono font-bold">VITE_SUPABASE_ANON_KEY</code> no ambiente de execução ou na Cloudflare Pages e recarregue a página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-900 dark:text-slate-100 antialiased relative transition-colors duration-200">
      {/* Barra Superior com Marca, Versão, Fonte, Tema e Atualizações */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <div className="hidden sm:flex flex-col text-right leading-none">
          <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">
            {NOME_APLICACAO}
          </span>
          <button 
            type="button"
            onClick={() => setModalVersaoInfoAberto(true)}
            className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-emerald-500 font-mono font-bold mt-0.5 cursor-pointer text-right underline underline-offset-2"
            title="Clique para ver os detalhes da versão e repositório GitHub"
          >
            VERSÃO {VERSAO_BUILD_ATUAL}
          </button>
        </div>
        <SeletorTema variante="compacto" />
        <ControleFonteAcessibilidade />
        <BotaoAtualizarApp />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-slate-300/40 dark:shadow-slate-950/80 w-full max-w-md p-6 sm:p-8 my-auto border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-3 flex items-center justify-center">
            <EmblemaInfport tamanho="xl" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{NOME_APLICACAO}</h1>
          <button 
            type="button"
            onClick={() => setModalVersaoInfoAberto(true)}
            className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 mt-1 uppercase tracking-wider cursor-pointer underline underline-offset-2 inline-block mx-auto"
            title="Clique para ver os detalhes da versão e repositório GitHub"
          >
            VERSÃO {VERSAO_BUILD_ATUAL}
          </button>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Sistema Integrado de Portaria & Segurança Patrimonial
          </p>
        </div>

        {avisoTurnoLogin && (
          <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 p-3.5 rounded-xl text-xs mb-4 border border-blue-200 dark:border-blue-800 font-semibold">
            {avisoTurnoLogin}
          </div>
        )}

        {erro && (
          <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3.5 rounded-xl text-sm mb-4 border border-red-200 dark:border-red-900/50 break-words font-semibold">
            {erro}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">
              E-mail de Acesso
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5 z-10" />
              <input
                type="email"
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="operador@condominio.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full pl-11 pr-4 py-3.5 bg-white text-slate-950 placeholder:text-slate-500 border border-slate-300 dark:border-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-base font-semibold shadow-inner transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5 z-10" />
              <input
                type={mostrarSenhaLogin ? "text" : "password"}
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full pl-11 pr-12 py-3.5 bg-white text-slate-950 placeholder:text-slate-500 border border-slate-300 dark:border-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-base font-semibold shadow-inner transition-colors"
              />
              <button
                type="button"
                onClick={() => setMostrarSenhaLogin(!mostrarSenhaLogin)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition cursor-pointer"
                title={mostrarSenhaLogin ? "Ocultar senha" : "Ver senha"}
              >
                {mostrarSenhaLogin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between py-1 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer text-slate-700 dark:text-slate-300 font-semibold select-none group">
              <input
                type="checkbox"
                checked={lembrarAcesso}
                onChange={(e) => setLembrarAcesso(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 dark:bg-slate-800 transition cursor-pointer"
              />
              <span className="text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                Manter conectado neste dispositivo
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:active:bg-emerald-600 text-white dark:text-slate-950 font-black py-3.5 rounded-xl transition duration-150 text-sm sm:text-base uppercase tracking-wider shadow-lg shadow-emerald-900/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? 'Autenticando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>

      {/* Modal do Banco Doctor acessível também na tela de login */}
      <SupabaseDoctorModal
        isOpen={modalSupabaseDoctorAberto}
        onClose={() => setModalSupabaseDoctorAberto(false)}
        abaInicial="condominios"
      />

      <IndicadorConectividade />
      <OfflineIndicator />
      <AlertaNovaVersaoPWA />

      {/* Modal de Versao e Repositorio GitHub acessivel no login */}
      <ModalInfoVersaoRepositorio 
        aberto={modalVersaoInfoAberto} 
        onFechar={() => setModalVersaoInfoAberto(false)} 
      />
    </div>
  );
}
