export type UserRole = 'admin' | 'protocolo' | 'analista' | 'gestor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export type ProcessStatus = 'em_analise' | 'finalizado' | 'pendente' | 'sobrestado';

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
  assuntos: string[];
  interessados: string[];
  unidadeAtual: { id: string; sigla: string; descricao: string };
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
