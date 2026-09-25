export type UserRole = 'admin' | 'assistente' | 'analista';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  authSource: 'local' | 'ad';
  username?: string | null;
  active: boolean;
  createdAt: string;
  units?: UserUnit[];
  unitsSyncedAt?: string | null;
}

export interface UserUnit {
  id: string;
  unitId: string;
  unitSigla: string;
  unitDesc: string;
}

export type ProcessStatus = 'em_andamento' | 'finalizado';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Annotation {
  id: string;
  processId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface Process {
  id: string;
  numeroSei: string;
  tipo: string;
  especificacao: string;
  dataAutuacao: string;
  nivelAcesso: string;
  linkSei: string;
  assuntos: string[];
  interessados: string[];
  unidadeAtual: { id: string; sigla: string; descricao: string };
  unidades: { id: string; sigla: string; descricao: string }[];
  andamentos: { id: string; descricao: string; dataHora: string; usuario: string; unidade: string }[];
  procedimentosRelacionados: { id: string; numero: string; tipo: string }[];
  procedimentosAnexados: { id: string; numero: string; tipo: string }[];
  ultimoAndamento: { descricao: string; dataHora: string; usuario: string; unidade: string };
  status: ProcessStatus;
  resumoIa?: string;
  resumoGeradoEm?: string;
  sincronizadoEm: string;
  tags: Tag[];
  annotations: Annotation[];
  createdAt: string;
}

export interface SyncLog {
  id: string;
  processId?: string;
  numeroSei?: string;
  userId?: string | null;
  userName?: string | null;
  tipo: 'manual' | 'batch';
  status: 'success' | 'error';
  mensagem: string;
  executedAt: string;
}

export interface AuditoriaLog {
  id: string;
  userId: string;
  userName: string;
  acao: string;
  alvo: string;
  detalhe: string;
  createdAt: string;
}

export interface Paginacao {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface EstatisticasPerfil {
  queTenhoAcesso: number;
  dasMinhasUnidades: number;
  anotacoes: number;
}

export interface SistemaInfo {
  saude: string;
  node: string;
  banco: { caminho: string; tamanhoBytes: number | null };
  contagens: {
    usuarios: number;
    usuariosAtivos: number;
    processos: number;
    syncLogs: number;
    auditLogs: number;
  };
  seiConfig: {
    url: string;
    siglaSistema: string;
    idUnidade: string;
    chaveDefinida: boolean;
    chaveOrigem: string;
  };
}
