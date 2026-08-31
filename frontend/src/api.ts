import type { Process, User, Tag, Annotation, SyncLog } from './types';

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
  const data = await request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  storeUser(data.user);
  return data;
}

export async function fetchMe(): Promise<User> {
  return request<User>('/auth/me');
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
}

export function mapProcess(p: BackendProcess): Process {
  const anyP = p as any;
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
    status: (p.statusSistema || anyP.status || 'em_analise') as Process['status'],
    resumoIa: p.resumoIa || undefined,
    resumoGeradoEm: p.resumoGeradoEm || undefined,
    sincronizadoEm: p.sincronizadoEm || '',
    tags: Array.isArray(anyP.tags) ? anyP.tags : [],
    annotations: Array.isArray(anyP.annotations) ? anyP.annotations : [],
    createdAt: p.createdAt,
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
} = {}): Promise<{ processes: Process[]; total: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.unit && params.unit !== 'all') qs.set('unit', params.unit);
  if (params.resumo && params.resumo !== 'all') qs.set('resumo', params.resumo);

  const data = await request<{
    processes: BackendProcess[];
    pagination: { total: number; totalPages: number };
  }>(`/processes?${qs.toString()}`);

  return {
    processes: (data.processes || []).map(mapProcess),
    total: data.pagination?.total ?? 0,
    totalPages: data.pagination?.totalPages ?? 1,
  };
}

export async function getProcess(id: string): Promise<Process> {
  const data = await request<BackendProcess>(`/processes/${id}`);
  return mapProcess(data);
}

export async function findProcessByNumero(numeroSei: string): Promise<Process | null> {
  const data = await request<{ processes: BackendProcess[] }>(`/processes?search=${encodeURIComponent(numeroSei)}&limit=1`);
  const found = data.processes?.find((p) => p.numeroSei === numeroSei);
  return found ? mapProcess(found) : null;
}

export async function createProcess(numeroSei: string): Promise<Process> {
  const data = await request<BackendProcess>('/processes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numeroSei }),
  });
  return mapProcess(data);
}

export async function syncProcess(id: string): Promise<Process> {
  const data = await request<BackendProcess>(`/processes/${id}/sync`, {
    method: 'POST',
  });
  return mapProcess(data);
}

export async function updateProcess(
  id: string,
  body: { statusSistema?: string; tagIds?: string[] }
): Promise<Process> {
  const data = await request<BackendProcess>(`/processes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return mapProcess(data);
}

export async function deleteProcess(id: string): Promise<void> {
  await request(`/processes/${id}`, { method: 'DELETE' });
}

export async function batchImport(
  numeros: string[]
): Promise<{
  results: { numero: string; status: string; mensagem: string }[];
  summary: { total: number; successes: number; errors: number };
}> {
  return request('/processes/import', {
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
  return request(`/processes/${id}/resumo`, { method: 'POST', body: form });
}

export async function getSummary(
  id: string
): Promise<{ resumoIa: string | null; resumoGeradoEm: string | null }> {
  return request(`/processes/${id}/resumo`);
}

// ---- Annotations ----
export async function listAnnotations(processId: string): Promise<Annotation[]> {
  return request(`/processes/${processId}/annotations`);
}

export async function createAnnotation(processId: string, content: string): Promise<Annotation> {
  return request(`/processes/${processId}/annotations`, {
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
  return request(`/processes/${processId}/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function deleteAnnotation(processId: string, annotationId: string): Promise<void> {
  await request(`/processes/${processId}/annotations/${annotationId}`, { method: 'DELETE' });
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
  const data = await request<{ andamentos: Andamento[] }>(`/processes/${processId}/andamentos`);
  return data.andamentos || [];
}

// ---- Tags ----
export async function listTags(): Promise<Tag[]> {
  return request<Tag[]>('/tags');
}

export async function createTag(name: string, color: string): Promise<Tag> {
  return request<Tag>('/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export async function updateTag(id: string, name: string, color: string): Promise<Tag> {
  return request<Tag>(`/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export async function deleteTag(id: string): Promise<void> {
  await request(`/tags/${id}`, { method: 'DELETE' });
}

// ---- Admin ----
export async function listUsers(): Promise<User[]> {
  return request<User[]>('/admin/users');
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: string;
}): Promise<User> {
  return request<User>('/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: { name?: string; email?: string; role?: string; active?: boolean; password?: string }
): Promise<User> {
  return request<User>(`/admin/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await request(`/admin/users/${id}`, { method: 'DELETE' });
}

export async function listLogs(): Promise<SyncLog[]> {
  return request<SyncLog[]>('/admin/logs');
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
