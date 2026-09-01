export type UserRole = 'admin' | 'protocolo' | 'analista' | 'gestor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  authSource: 'local' | 'ad';
  active: boolean;
  createdAt: string;
  units?: UserUnit[];
}

export interface UserUnit {
  id: string;
  unitId: string;
  unitSigla: string;
  unitDesc: string;
}

export type ProcessStatus = 'em_andamento' | 'finalizado' | 'pendente' | 'sobrestado';

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
  tipo: 'manual' | 'batch' | 'auto';
  status: 'success' | 'error';
  mensagem: string;
  executedAt: string;
}
