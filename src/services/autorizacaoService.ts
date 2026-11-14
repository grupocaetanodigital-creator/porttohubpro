import { supabase } from './supabase';

export interface CondominioResumo {
  id: string;
  nome: string;
  [key: string]: any;
}

export interface ContextoCondominiosResolvido {
  bloqueado: boolean;
  motivoBloqueio?: string;
  eAdminGeral: boolean;
  eSupervisor: boolean;
  eSindico: boolean;
  ePorteiro: boolean;
  podeTrocarCondominio: boolean;
  mostrarSeletor: boolean;
  condominiosPermitidos: CondominioResumo[];
  condominioInicialId: string;
}

export function isCondominioIdValido(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  const limpo = id.trim();
  if (!limpo) return false;
  const lower = limpo.toLowerCase();
  if (lower === 'todos' || lower === 'global' || lower === 'null' || lower === 'undefined') {
    return false;
  }
  return true;
}

/**
 * Regra C: Administrador Geral SOMENTE com flag explícito de banco/backend.
 * NUNCA concede acesso global por login === 'admin', 'master', nivel_acesso <= 1
 * ou condominio_id vazio / 'todos' / 'global'.
 */
export function temAcessoGlobalExplicito(operador?: any | null): boolean {
  return Boolean(operador && operador.acesso_global_condominios === true);
}

export function ehPerfilSupervisor(operador?: any | null): boolean {
  if (!operador || temAcessoGlobalExplicito(operador)) return false;
  const perfil = String(operador.perfil || '').toLowerCase();
  const funcao = String(operador.funcao || operador.cargo || '').toLowerCase();
  return (
    Number(operador.nivel_acesso) === 2 ||
    perfil === 'supervisor' ||
    funcao.includes('supervisor')
  );
}

export function ehPerfilSindico(operador?: any | null): boolean {
  if (!operador) return false;
  const perfil = String(operador.perfil || '').toLowerCase();
  const funcao = String(operador.funcao || operador.cargo || '').toLowerCase();
  return (
    Number(operador.nivel_acesso) === 4 ||
    perfil === 'sindico' ||
    perfil === 'síndico' ||
    funcao.includes('síndic') ||
    funcao.includes('sindic')
  );
}

export function ehPerfilPorteiroOuComum(operador?: any | null): boolean {
  if (!operador || temAcessoGlobalExplicito(operador) || ehPerfilSupervisor(operador) || ehPerfilSindico(operador)) {
    return false;
  }
  const perfil = String(operador.perfil || '').toLowerCase();
  const nivel = operador.nivel_acesso !== undefined && operador.nivel_acesso !== null ? Number(operador.nivel_acesso) : 3;
  // Nível 3+ ou perfil porteiro/operador/custom sem flag global são operadores comuns
  if (perfil === 'operador' || perfil === 'porteiro' || nivel >= 3) {
    return true;
  }
  return false;
}

/**
 * Busca os vínculos explícitos na tabela public.operador_condominios.
 * Retorna também se a tabela existe no banco (tabelaDisponivel).
 */
export async function buscarVinculosCondominiosOperador(operadorId: string): Promise<{
  ids: string[];
  tabelaDisponivel: boolean;
  erro?: any;
}> {
  if (!operadorId) return { ids: [], tabelaDisponivel: true };

  try {
    const { data, error } = await supabase
      .from('operador_condominios')
      .select('condominio_id, principal, ativo')
      .eq('operador_id', operadorId);

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const tabelaAusente =
        (error as any).code === '42P01' ||
        (error as any).code === 'PGRST205' ||
        msg.includes('does not exist') ||
        msg.includes('schema cache');

      if (tabelaAusente) {
        return { ids: [], tabelaDisponivel: false };
      }
      console.error('[PorttoHub][Autorização] Erro ao consultar operador_condominios:', error);
      return { ids: [], tabelaDisponivel: true, erro: error };
    }

    const ids = Array.from(
      new Set(
        (data || [])
          .filter((row: any) => row.ativo !== false && isCondominioIdValido(row.condominio_id))
          .map((row: any) => String(row.condominio_id).trim())
      )
    );

    return { ids, tabelaDisponivel: true };
  } catch (err) {
    console.error('[PorttoHub][Autorização] Exceção ao consultar operador_condominios:', err);
    return { ids: [], tabelaDisponivel: false, erro: err };
  }
}

/**
 * Resolve de forma determinística e testável o contexto multi-condomínio de um operador
 * seguindo estritamente as Regras A, B, C e D.
 */
export function resolverContextoCondominiosOperador(params: {
  operador: any;
  condominiosDisponiveis: CondominioResumo[];
  vinculosExplicitosIds?: string[];
  tabelaVinculosDisponivel?: boolean;
  condominioPreferidoId?: string | null;
}): ContextoCondominiosResolvido {
  const {
    operador,
    condominiosDisponiveis,
    vinculosExplicitosIds = [],
    tabelaVinculosDisponivel = true,
    condominioPreferidoId
  } = params;

  const todosValidos = (condominiosDisponiveis || []).filter(c => isCondominioIdValido(c?.id));
  const eAdminGeral = temAcessoGlobalExplicito(operador);
  const eSupervisor = ehPerfilSupervisor(operador);
  const eSindico = ehPerfilSindico(operador);
  const ePorteiro = ehPerfilPorteiroOuComum(operador);

  // REGRA C: Administrador Geral explícito
  if (eAdminGeral) {
    const preferido = isCondominioIdValido(condominioPreferidoId) && todosValidos.some(c => c.id === condominioPreferidoId)
      ? String(condominioPreferidoId)
      : '';
    const principalOp = isCondominioIdValido(operador?.condominio_id) && todosValidos.some(c => c.id === operador.condominio_id)
      ? String(operador.condominio_id)
      : '';
    const condominioInicialId = preferido || principalOp || todosValidos[0]?.id || '';

    return {
      bloqueado: false,
      eAdminGeral: true,
      eSupervisor: false,
      eSindico: false,
      ePorteiro: false,
      podeTrocarCondominio: todosValidos.length >= 1,
      mostrarSeletor: todosValidos.length > 0,
      condominiosPermitidos: todosValidos,
      condominioInicialId
    };
  }

  // REGRA B: Supervisor — estritamente pelos vínculos explícitos em operador_condominios
  if (eSupervisor) {
    const setIds = new Set(
      (vinculosExplicitosIds || []).filter(id => isCondominioIdValido(id))
    );

    // Somente na janela de transição antes da criação da tabela operador_condominios
    // aceita o condominio_id unitário já cadastrado (nunca 'todos'/'global').
    if (!tabelaVinculosDisponivel && setIds.size === 0 && isCondominioIdValido(operador?.condominio_id)) {
      setIds.add(String(operador.condominio_id).trim());
    }

    const permitidos = todosValidos.filter(c => setIds.has(c.id));

    if (permitidos.length === 0) {
      return {
        bloqueado: true,
        motivoBloqueio: 'Sua conta de supervisão não possui nenhum condomínio autorizado vinculado. Solicite ao administrador geral o vínculo em Cadastros.',
        eAdminGeral: false,
        eSupervisor: true,
        eSindico: false,
        ePorteiro: false,
        podeTrocarCondominio: false,
        mostrarSeletor: false,
        condominiosPermitidos: [],
        condominioInicialId: ''
      };
    }

    if (permitidos.length === 1) {
      return {
        bloqueado: false,
        eAdminGeral: false,
        eSupervisor: true,
        eSindico: false,
        ePorteiro: false,
        podeTrocarCondominio: false,
        mostrarSeletor: false,
        condominiosPermitidos: permitidos,
        condominioInicialId: permitidos[0].id
      };
    }

    const preferido = isCondominioIdValido(condominioPreferidoId) && permitidos.some(c => c.id === condominioPreferidoId)
      ? String(condominioPreferidoId)
      : '';
    const principal = isCondominioIdValido(operador?.condominio_id) && permitidos.some(c => c.id === operador.condominio_id)
      ? String(operador.condominio_id)
      : '';

    return {
      bloqueado: false,
      eAdminGeral: false,
      eSupervisor: true,
      eSindico: false,
      ePorteiro: false,
      podeTrocarCondominio: true,
      mostrarSeletor: true,
      condominiosPermitidos: permitidos,
      condominioInicialId: preferido || principal || permitidos[0].id
    };
  }

  // REGRAS A e D: Porteiro, Síndico, Admin Local, Master, Custom RBAC (sem acesso_global_condominios)
  const idPrincipal = isCondominioIdValido(operador?.condominio_id) ? String(operador.condominio_id).trim() : '';
  const idsLinksValidos = (vinculosExplicitosIds || []).filter(id => isCondominioIdValido(id));

  // Porteiro e Síndico padrão sempre ficam restritos a 1 condomínio
  const idPrincipalMatch = todosValidos.find(c => c.id === idPrincipal);
  const linksPermitidos = todosValidos.filter(c => idsLinksValidos.includes(c.id));

  let permitidos: CondominioResumo[] = [];
  if (ePorteiro || eSindico) {
    if (idPrincipalMatch) {
      permitidos = [idPrincipalMatch];
    } else if (linksPermitidos.length === 1) {
      permitidos = [linksPermitidos[0]];
    } else if (!ePorteiro && linksPermitidos.length > 0) {
      permitidos = linksPermitidos;
    }
  } else {
    // Master / Admin Local / Custom RBAC sem acesso global explícito:
    // Usa o seu condomínio principal ou os vínculos explícitos (nunca todos os condomínios)
    const mapa = new Map<string, CondominioResumo>();
    if (idPrincipalMatch) mapa.set(idPrincipalMatch.id, idPrincipalMatch);
    for (const c of linksPermitidos) {
      mapa.set(c.id, c);
    }
    permitidos = Array.from(mapa.values());
  }

  if (permitidos.length === 0) {
    return {
      bloqueado: true,
      motivoBloqueio: 'Sua conta não possui nenhum condomínio válido vinculado. Solicite ao administrador do sistema.',
      eAdminGeral: false,
      eSupervisor: false,
      eSindico,
      ePorteiro,
      podeTrocarCondominio: false,
      mostrarSeletor: false,
      condominiosPermitidos: [],
      condominioInicialId: ''
    };
  }

  const podeAlternarEntreVinculados = !ePorteiro && !eSindico && permitidos.length >= 2;
  const preferido = podeAlternarEntreVinculados && isCondominioIdValido(condominioPreferidoId) && permitidos.some(c => c.id === condominioPreferidoId)
    ? String(condominioPreferidoId)
    : '';

  return {
    bloqueado: false,
    eAdminGeral: false,
    eSupervisor: false,
    eSindico,
    ePorteiro,
    podeTrocarCondominio: podeAlternarEntreVinculados,
    mostrarSeletor: podeAlternarEntreVinculados,
    condominiosPermitidos: permitidos,
    condominioInicialId: preferido || permitidos[0].id
  };
}
