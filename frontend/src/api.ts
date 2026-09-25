import type { Process, User, UserUnit, Tag, Annotation, SyncLog, AuditoriaLog, Paginacao, SistemaInfo, EstatisticasPerfil } from './types';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://127.0.0.1:8000/api';

let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('cremepe_token', token);
  } else {
    localStorage.removeItem('cremepe_token');
  }
}

export function getToken(): string | null {
  if (authToken) return authToken;
  const stored = localStorage.getItem('cremepe_token');
  if (stored) authToken = stored;
  return authToken;
}

export function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('cremepe_user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: User) {
  localStorage.setItem('cremepe_user', JSON.stringify(user));
}

export function clearSession() {
  setToken(null);
  localStorage.removeItem('cremepe_user');
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event('cremepe-unauthorized'));
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.error || data?.message || `Erro ${res.status}`, res.status);
  }

  return data as T;
}

// ---- Auth ----
export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: User }> {
  const data = await request<{ token: string; user: User }>('/autenticacao/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  storeUser(data.user);
  return data;
}

export async function fetchMe(): Promise<User> {
  return request<User>('/autenticacao/usuario-atual');
}

export async function logout(): Promise<{ message: string }> {
  return request<{ message: string }>('/autenticacao/logout', { method: 'POST' });
}

export async function fetchProfile(): Promise<User & { units: UserUnit[] }> {
  return request<User & { units: UserUnit[] }>('/autenticacao/perfil');
}

export async function updateProfile(data: { name: string }): Promise<User> {
  return request<User>('/autenticacao/perfil', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function alterarSenha(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
  return request<{ message: string }>('/autenticacao/perfil', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchEstatisticas(): Promise<EstatisticasPerfil> {
  return request<EstatisticasPerfil>('/autenticacao/estatisticas');
}

/** Últimas ações do próprio usuário na auditoria (mesmo conteúdo do log de auditoria). */
export async function fetchAtividades(): Promise<AuditoriaLog[]> {
  const data = await request<{ logs: AuditoriaLog[] }>('/autenticacao/atividades');
  return data.logs;
}

export async function syncMyUnits(): Promise<{ synced: number }> {
  return request<{ synced: number }>('/autenticacao/sincronizar-unidades', { method: 'POST' });
}

// ---- Mapping backend Process to frontend Process ----
interface BackendProcess {
  id: string;
  numeroSei: string;
  tipo: string | null;
  especificacao: string | null;
  dataAutuacao: string | null;
  nivelAcesso: string | null;
  linkSei: string | null;
  assuntos: string[];
  interessados: string[];
  unidadeAtual: { id: string; sigla: string; descricao: string } | null;
  unidades: { id: string; sigla: string; descricao: string }[];
  andamentos: { id: string; descricao: string; dataHora: string; usuario: string; unidade: string }[];
  procedimentosRelacionados: { id: string; numero: string; tipo: string }[];
  procedimentosAnexados: { id: string; numero: string; tipo: string }[];
  ultimoAndamento: { descricao: string; dataHora: string; usuario: string; unidade: string } | null;
  statusSistema: string;
  resumoIa?: string | null;
  resumoGeradoEm?: string | null;
  sincronizadoEm: string | null;
  createdAt: string;
  tags: Tag[];
  annotations: Annotation[];
  acessoRestrito?: boolean;
}

function mapStatus(raw: string): Process['status'] {
  const s = raw.toLowerCase().trim();
  if (s === 'em_analise' || s === 'em_andamento') return 'em_andamento';
  if (s === 'finalizado' || s === 'concluido') return 'finalizado';
  if (s === 'pendente') return 'pendente';
  if (s === 'sobrestado') return 'sobrestado';
  return 'em_andamento';
}

export function mapProcess(p: BackendProcess): Process {
  return {
    id: p.id,
    numeroSei: p.numeroSei,
    tipo: p.tipo || '',
    especificacao: p.especificacao || '',
    dataAutuacao: p.dataAutuacao || '',
    nivelAcesso: p.nivelAcesso || '',
    linkSei: p.linkSei || '',
    assuntos: Array.isArray(p.assuntos) ? p.assuntos : [],
    interessados: Array.isArray(p.interessados) ? p.interessados : [],
    unidadeAtual: p.unidadeAtual || { id: '', sigla: '', descricao: '' },
    unidades: Array.isArray(p.unidades) ? p.unidades : [],
    andamentos: Array.isArray(p.andamentos) ? p.andamentos : [],
    procedimentosRelacionados: Array.isArray(p.procedimentosRelacionados) ? p.procedimentosRelacionados : [],
    procedimentosAnexados: Array.isArray(p.procedimentosAnexados) ? p.procedimentosAnexados : [],
    ultimoAndamento: p.ultimoAndamento || { descricao: '', dataHora: '', usuario: '', unidade: '' },
    status: mapStatus(p.statusSistema || 'em_andamento'),
    resumoIa: p.resumoIa || undefined,
    resumoGeradoEm: p.resumoGeradoEm || undefined,
    sincronizadoEm: p.sincronizadoEm || '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    annotations: Array.isArray(p.annotations) ? p.annotations : [],
    createdAt: p.createdAt,
    acessoRestrito: Boolean(p.acessoRestrito),
  };
}

// ---- Processes ----
export async function listProcesses(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  unit?: string;
  resumo?: string;
  andamentos?: string;
  documentos?: string;
  tipo?: string;
  nivelAcesso?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<{ processes: Process[]; total: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.unit && params.unit !== 'all') qs.set('unit', params.unit);
  if (params.resumo && params.resumo !== 'all') qs.set('resumo', params.resumo);
  if (params.andamentos && params.andamentos !== 'all') qs.set('andamentos', params.andamentos);
  if (params.documentos && params.documentos !== 'all') qs.set('documentos', params.documentos);
  if (params.tipo && params.tipo !== 'all') qs.set('tipo', params.tipo);
  if (params.nivelAcesso && params.nivelAcesso !== 'all') qs.set('nivelAcesso', params.nivelAcesso);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);

  const data = await request<{
    processes: BackendProcess[];
    pagination: { total: number; totalPages: number };
  }>(`/processos?${qs.toString()}`);

  return {
    processes: (data.processes || []).map(mapProcess),
    total: data.pagination?.total ?? 0,
    totalPages: data.pagination?.totalPages ?? 1,
  };
}

export interface StalledProcess {
  id: string;
  numeroSei: string;
  especificacao: string;
  dataAutuacao: string;
  nivelAcesso: string;
  unidadeAtual: { id: string; sigla: string; descricao: string };
  unidades: { id: string; sigla: string; descricao: string }[];
  tags: Tag[];
  ultimoAndamento: { descricao: string; dataHora: string; usuario: string; unidade: string } | null;
  diasParado: number | null;
  ultimaAtividade: string | null;
}

export async function listStalledProcesses(): Promise<StalledProcess[]> {
  const data = await request<{ processes: any[] }>('/processos/parados');
  return (data.processes || []).map((p) => ({
    ...p,
    unidadeAtual: p.unidadeAtual || {},
    unidades: p.unidades || [],
    tags: p.tags || [],
  }));
}

export async function getProcess(id: string): Promise<Process> {
  const data = await request<BackendProcess>(`/processos/${id}`);
  return mapProcess(data);
}

export async function findProcessByNumero(numeroSei: string): Promise<Process | null> {
  const data = await request<{ processes: BackendProcess[] }>(`/processos?search=${encodeURIComponent(numeroSei)}&limit=1`);
  const found = data.processes?.find((p) => p.numeroSei === numeroSei);
  return found ? mapProcess(found) : null;
}

export async function createProcess(numeroSei: string): Promise<Process & { autoImportados?: number }> {
  const data = await request<BackendProcess & { autoImportados?: number }>('/processos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numeroSei }),
  });
  return { ...mapProcess(data), autoImportados: data.autoImportados };
}

export async function syncProcess(id: string): Promise<Process> {
  const data = await request<BackendProcess>(`/processos/${id}/sincronizar`, {
    method: 'POST',
  });
  return mapProcess(data);
}

export async function syncBatch(ids: string[]): Promise<{ results: { id: string; status: string; mensagem: string }[]; total: number; autoImportados: number }> {
  return request(`/processos/sincronizar-lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function updateProcess(
  id: string,
  body: { statusSistema?: string; tagIds?: string[] }
): Promise<Process> {
  const data = await request<BackendProcess>(`/processos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return mapProcess(data);
}

export async function deleteProcess(id: string): Promise<void> {
  await request(`/processos/${id}`, { method: 'DELETE' });
}

export async function batchImport(
  numeros: string[]
): Promise<{
  results: { numero: string; status: string; mensagem: string }[];
  summary: { total: number; successes: number; errors: number };
}> {
  return request('/processos/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numeros }),
  });
}

export async function generateSummary(
  id: string,
  files: File[],
  textoManual?: string
): Promise<{ resumo: string }> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  if (textoManual) form.append('textoManual', textoManual);
  return request(`/processos/${id}/resumo`, { method: 'POST', body: form });
}

export async function saveSummary(
  id: string,
  resumo: string
): Promise<{ process: Process }> {
  return request(`/processos/${id}/resumo/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumo }),
  });
}

export async function generateSummaryFromDocs(id: string): Promise<{ resumo: string }> {
  return request(`/processos/${id}/resumo-documentos`, { method: 'POST' });
}

export async function getSummary(
  id: string
): Promise<{ resumoIa: string | null; resumoGeradoEm: string | null }> {
  return request(`/processos/${id}/resumo`);
}

/** Registra na auditoria um download/exportação (panorama de processo ou relatório). */
export async function registrarExportacao(payload: {
  escopo: 'processo' | 'relatorio';
  processoId?: string;
  detalhe?: string;
}): Promise<{ ok: boolean }> {
  return request('/processos/exportacoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---- Annotations ----
export async function listAnnotations(processId: string): Promise<Annotation[]> {
  return request(`/processos/${processId}/anotacoes`);
}

export async function createAnnotation(processId: string, content: string): Promise<Annotation> {
  return request(`/processos/${processId}/anotacoes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function updateAnnotation(
  processId: string,
  annotationId: string,
  content: string
): Promise<Annotation> {
  return request(`/processos/${processId}/anotacoes/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function deleteAnnotation(processId: string, annotationId: string): Promise<void> {
  await request(`/processos/${processId}/anotacoes/${annotationId}`, { method: 'DELETE' });
}

// ---- Andamentos ----
export interface Andamento {
  IdAndamento: string;
  Descricao: string;
  DataHora: string;
  Usuario: { Sigla: string; Nome: string } | null;
  Unidade: { IdUnidade: string; Sigla: string; Descricao: string } | null;
}

export async function listAndamentos(processId: string): Promise<Andamento[]> {
  const data = await request<{ andamentos: Andamento[] }>(`/processos/${processId}/andamentos`);
  return data.andamentos || [];
}

export interface ProcessoPai {
  id: string;
  numero: string;
  tipo: string | null;
  statusSistema: string;
}

export async function listProcessosPai(processId: string): Promise<ProcessoPai[]> {
  const data = await request<{ pais: ProcessoPai[] }>(`/processos/${processId}/pais`);
  return data.pais || [];
}

// ---- Tags ----
export async function listTags(): Promise<Tag[]> {
  return request<Tag[]>('/etiquetas');
}

export async function createTag(name: string, color: string): Promise<Tag> {
  return request<Tag>('/etiquetas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export async function updateTag(id: string, name: string, color: string): Promise<Tag> {
  return request<Tag>(`/etiquetas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export async function deleteTag(id: string): Promise<void> {
  await request(`/etiquetas/${id}`, { method: 'DELETE' });
}

// ---- Admin ----
export async function listUsers(): Promise<User[]> {
  return request<User[]>('/administracao/usuarios');
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: string;
  authSource?: string;
  username?: string;
}): Promise<User> {
  return request<User>('/administracao/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: { name?: string; email?: string; role?: string; active?: boolean; password?: string; username?: string }
): Promise<User> {
  return request<User>(`/administracao/usuarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await request(`/administracao/usuarios/${id}`, { method: 'DELETE' });
}

export async function syncUserUnits(id: string): Promise<{ synced: number }> {
  return request<{ synced: number }>(`/administracao/usuarios/${id}/sincronizar-unidades`, { method: 'POST' });
}

export async function setUserUnits(
  id: string,
  unidades: { unitId: string; unitSigla: string; unitDesc: string }[]
): Promise<{ synced: number }> {
  return request<{ synced: number }>(`/administracao/usuarios/${id}/unidades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unidades }),
  });
}

export async function listLogs(params: {
  tipo?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<{ logs: SyncLog[]; pagination: Paginacao }> {
  const qs = new URLSearchParams();
  if (params.tipo && params.tipo !== 'all') qs.set('tipo', params.tipo);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  return request(`/administracao/registros?${qs.toString()}`);
}

export async function listAuditoria(params: { search?: string; page?: number; limit?: number } = {}): Promise<{
  logs: AuditoriaLog[];
  pagination: Paginacao;
}> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return request(`/administracao/auditoria?${qs.toString()}`);
}

// ---- Admin: configurações SEI ----
export async function getSeiConfig(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/administracao/configuracoes');
}

export async function saveSeiConfig(configs: Record<string, string>): Promise<{ message: string }> {
  return request('/administracao/configuracoes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configs),
  });
}

export async function testSeiConnection(cfg?: {
  url?: string;
  siglaSistema?: string;
  identificacaoServico?: string;
  idUnidade?: string;
}): Promise<{ ok: boolean; unidades: number }> {
  return request('/administracao/testar-conexao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg ?? {}),
  });
}

// ---- Admin: sistema ----
export async function getSistema(): Promise<SistemaInfo> {
  return request<SistemaInfo>('/administracao/sistema');
}

// ---- SEI ----
export interface SeiUnidade {
  id: string;
  sigla: string;
  descricao: string;
}

export async function listUnidades(): Promise<SeiUnidade[]> {
  return request<{ unidades: SeiUnidade[] }>('/sei/unidades').then((d) => d.unidades || []);
}
