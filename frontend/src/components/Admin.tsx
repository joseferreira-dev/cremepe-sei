import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, SyncLog, AuditoriaLog, SistemaInfo, Paginacao } from '../types';
import {
  listUsers,
  listLogs,
  listAuditoria,
  updateUser,
  deleteUser,
  createUser,
  syncUserUnits,
  setUserUnits,
  getSeiConfig,
  saveSeiConfig,
  testSeiConnection,
  getSistema,
  listUnidades,
  type SeiUnidade,
} from '../api';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';
import MultiSelectDialog from './ui/MultiSelectDialog';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  assistente: 'Assistente',
  analista: 'Analista',
};

const SENHA_MINIMA = 8;
const CHAVE_MASCARADA = '********';
const LOG_TIPO_LABELS: Record<string, string> = {
  manual: 'Manual',
  batch: 'Lote',
};

interface Props {
  user: User;
  onUserUpdated: (user: User) => void;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(b: number | null): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function Pagination({ p, onPage }: { p: Paginacao | null; onPage: (n: number) => void }) {
  if (!p || p.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
      <span className="text-gray-500">
        {p.total} registro(s) · página {p.page} de {p.totalPages}
      </span>
      <div className="flex gap-2">
        <button
          disabled={p.page <= 1}
          onClick={() => onPage(p.page - 1)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        <button
          disabled={p.page >= p.totalPages}
          onClick={() => onPage(p.page + 1)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export default function Admin({ user, onUserUpdated }: Props) {
  const dialog = useDialog();
  const navigate = useNavigate();
  const [section, setSection] = useState<'users' | 'sei' | 'logs' | 'audit' | 'sistema'>('users');

  // Usuários
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [syncingUnitsId, setSyncingUnitsId] = useState<string | null>(null);

  // Modal de usuário
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'assistente',
    authSource: 'local' as 'local' | 'ad',
    username: '',
    active: true,
  });
  const [saving, setSaving] = useState(false);

  // Unidades (MultiSelect)
  const [unitsDialogUserId, setUnitsDialogUserId] = useState<string | null>(null);
  const [seiCatalog, setSeiCatalog] = useState<SeiUnidade[]>([]);
  const [unitsDialogSelected, setUnitsDialogSelected] = useState<string[]>([]);

  // Logs de sincronização
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPagination, setLogsPagination] = useState<Paginacao | null>(null);
  const [logFilters, setLogFilters] = useState({
    tipo: 'all',
    status: 'all',
    search: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    limit: 20,
  });
  const [logSearchInput, setLogSearchInput] = useState('');
  const [logDetail, setLogDetail] = useState<SyncLog | null>(null);

  // Auditoria
  const [auditLogs, setAuditLogs] = useState<AuditoriaLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPagination, setAuditPagination] = useState<Paginacao | null>(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditSearchInput, setAuditSearchInput] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  // Configurações SEI
  const [seiConfigForm, setSeiConfigForm] = useState({
    seiUrl: '',
    seiSiglaSistema: '',
    seiIdentificacaoServico: '',
    seiIdUnidade: '',
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  // Sistema
  const [sistema, setSistema] = useState<SistemaInfo | null>(null);
  const [sistemaLoading, setSistemaLoading] = useState(false);

  const refreshUsers = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch {
      /* mantém a lista atual */
    }
  }, []);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => {}).finally(() => setUsersLoading(false));
  }, []);

  // ---- Logs: carregamento e debounce de busca ----
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await listLogs(logFilters);
      setLogs(res.logs);
      setLogsPagination(res.pagination);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [logFilters]);

  useEffect(() => {
    if (section === 'logs') loadLogs();
  }, [section, loadLogs]);

  useEffect(() => {
    const t = setTimeout(() => {
      setLogFilters((f) => (f.search === logSearchInput.trim() ? f : { ...f, search: logSearchInput.trim(), page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [logSearchInput]);

  // ---- Auditoria ----
  useEffect(() => {
    if (section !== 'audit') return;
    setAuditLoading(true);
    listAuditoria({ search: auditSearch, page: auditPage, limit: 20 })
      .then((r) => {
        setAuditLogs(r.logs);
        setAuditPagination(r.pagination);
      })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, [section, auditPage, auditSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      setAuditSearch((s) => (s === auditSearchInput.trim() ? s : auditSearchInput.trim()));
      setAuditPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [auditSearchInput]);

  // ---- Configurações SEI ----
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const cfg = await getSeiConfig();
      setSeiConfigForm({
        seiUrl: cfg.seiUrl ?? '',
        seiSiglaSistema: cfg.seiSiglaSistema ?? '',
        seiIdentificacaoServico: cfg.seiIdentificacaoServico ?? '',
        seiIdUnidade: cfg.seiIdUnidade ?? '',
      });
      setConfigLoaded(true);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao carregar as configurações.');
    } finally {
      setConfigLoading(false);
    }
  }, [dialog]);

  useEffect(() => {
    if (section === 'sei' && !configLoaded) loadConfig();
  }, [section, configLoaded, loadConfig]);

  // ---- Sistema ----
  useEffect(() => {
    if (section !== 'sistema') return;
    setSistemaLoading(true);
    getSistema()
      .then(setSistema)
      .catch(() => {})
      .finally(() => setSistemaLoading(false));
  }, [section]);

  // ---- Ações de usuário ----
  const handleToggleActive = async (u: User) => {
    if (u.id === user.id && u.active) {
      dialog.error('Você não pode desativar a própria conta.');
      return;
    }
    try {
      const updated = await updateUser(u.id, { active: !u.active });
      setUsers(users.map((x) => (x.id === u.id ? { ...updated, units: x.units } : x)));
      dialog.success(u.active ? `${u.name} foi desativado.` : `${u.name} foi reativado.`);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao atualizar usuário.');
    }
  };

  const handleDelete = async (id: string) => {
    if (id === user.id) {
      dialog.error('Você não pode excluir a própria conta.');
      return;
    }
    const ok = await dialog.confirm('Excluir este usuário?');
    if (!ok) return;
    try {
      await deleteUser(id);
      setUsers(users.filter((x) => x.id !== id));
      dialog.success('Usuário excluído.');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao excluir usuário.');
    }
  };

  const handleSyncUnits = async (u: User) => {
    setSyncingUnitsId(u.id);
    try {
      const result = await syncUserUnits(u.id);
      await refreshUsers();
      dialog.success(`${result.synced} unidade(s) sincronizada(s) com o SEI para ${u.name}.`);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao sincronizar unidades.');
    } finally {
      setSyncingUnitsId(null);
    }
  };

  const openUnitsDialog = async (u: User) => {
    try {
      if (seiCatalog.length === 0) {
        const catalogo = await listUnidades();
        setSeiCatalog(catalogo);
      }
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao carregar as unidades do SEI.');
      return;
    }
    setUnitsDialogSelected((u.units ?? []).map((x) => x.unitSigla));
    setUnitsDialogUserId(u.id);
  };

  const handleUnitsApply = async (siglas: string[]) => {
    const alvo = users.find((u) => u.id === unitsDialogUserId);
    if (!alvo) return;
    const porSiglaCatalogo = new Map(seiCatalog.map((u) => [u.sigla, u]));
    const porSiglaAtual = new Map((alvo.units ?? []).map((u) => [u.unitSigla, u]));
    const payload: { unitId: string; unitSigla: string; unitDesc: string }[] = [];
    for (const sigla of siglas) {
      const cat = porSiglaCatalogo.get(sigla);
      if (cat) {
        payload.push({ unitId: cat.id, unitSigla: cat.sigla, unitDesc: cat.descricao });
        continue;
      }
      const atual = porSiglaAtual.get(sigla);
      if (atual) payload.push({ unitId: atual.unitId, unitSigla: atual.unitSigla, unitDesc: atual.unitDesc });
    }
    try {
      const r = await setUserUnits(alvo.id, payload);
      await refreshUsers();
      dialog.success(`${r.synced} unidade(s) salva(s) para ${alvo.name}.`);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao salvar unidades.');
    }
  };

  // ---- Modal de usuário ----
  const openNewUser = () => {
    setEditingUser(null);
    setForm({ name: '', email: '', password: '', role: 'assistente', authSource: 'local', username: '', active: true });
    setShowUserModal(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      authSource: u.authSource || 'local',
      username: u.username ?? '',
      active: u.active,
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      dialog.alert('Preencha nome e e-mail.');
      return;
    }
    if (!editingUser && form.authSource === 'local') {
      if (!form.password) {
        dialog.alert('Usuários locais precisam de uma senha.');
        return;
      }
      if (form.password.length < SENHA_MINIMA) {
        dialog.alert(`A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
        return;
      }
    }
    if (editingUser && form.password && form.password.length < SENHA_MINIMA) {
      dialog.alert(`A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        const payload: Record<string, unknown> = { name: form.name, email: form.email, role: form.role, active: form.active };
        if (form.password) payload.password = form.password;
        payload.username = form.username.trim();
        const updated = await updateUser(editingUser.id, payload);
        setUsers(users.map((x) => (x.id === editingUser.id ? { ...updated, units: x.units } : x)));
        if (editingUser.id === user.id) {
          onUserUpdated(updated);
        }
        dialog.success('Usuário atualizado.');
      } else {
        const created = await createUser({
          name: form.name,
          email: form.email,
          password: form.password || '',
          role: form.role,
          authSource: form.authSource,
          username: form.username.trim(),
        });
        setUsers([...users, created]);
        dialog.success('Usuário criado.');
      }
      setShowUserModal(false);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  // ---- Configurações SEI ----
  const handleTestConnection = async () => {
    setTestStatus('loading');
    try {
      const resultado = await testSeiConnection({
        url: seiConfigForm.seiUrl,
        siglaSistema: seiConfigForm.seiSiglaSistema,
        identificacaoServico:
          seiConfigForm.seiIdentificacaoServico === CHAVE_MASCARADA
            ? undefined
            : seiConfigForm.seiIdentificacaoServico,
        idUnidade: seiConfigForm.seiIdUnidade,
      });
      setTestStatus('ok');
      dialog.success(`Conexão OK — ${resultado.unidades} unidade(s) retornada(s) pelo SEI.`);
    } catch (e: any) {
      setTestStatus('error');
      dialog.error(e?.message || 'Falha ao contatar o SEI.');
    } finally {
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const resultado = await saveSeiConfig(seiConfigForm);
      dialog.success(resultado.message || 'Configurações salvas.');
      await loadConfig();
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  };

  // ---- Logs ----
  const handleExportLogsCsv = () => {
    if (logs.length === 0) {
      dialog.alert('Nenhum registro para exportar.');
      return;
    }
    const header = ['Data/Hora', 'Tipo', 'Status', 'Processo', 'Usuário', 'Mensagem'];
    const rows = logs.map((l) => [
      formatDataPtBR(l.executedAt, true),
      LOG_TIPO_LABELS[l.tipo] ?? l.tipo,
      l.status === 'success' ? 'Sucesso' : 'Erro',
      l.numeroSei ?? '',
      l.userName ?? '',
      l.mensagem,
    ]);
    downloadCsv(`registros-sincronizacao-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const setLogFilter = (patch: Partial<typeof logFilters>) =>
    setLogFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const filteredUsers = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)) &&
        (roleFilter === 'all' || u.role === roleFilter) &&
        (statusFilter === 'all' || (statusFilter === 'active' ? u.active : !u.active))
    );
  }, [users, userSearch, roleFilter, statusFilter]);

  const kpis = [
    { label: 'Ativos', value: users.filter((u) => u.active).length, color: '#009C60' },
    { label: 'Inativos', value: users.filter((u) => !u.active).length, color: '#6B7280' },
    { label: 'Active Directory', value: users.filter((u) => u.authSource === 'ad').length, color: '#29ABE2' },
    { label: 'Locais', value: users.filter((u) => u.authSource !== 'ad').length, color: '#8DC63F' },
  ];

  const tabs = [
    { id: 'users', label: 'Usuários' },
    { id: 'sei', label: 'Configurações SEI' },
    { id: 'logs', label: 'Logs de Sincronização' },
    { id: 'audit', label: 'Auditoria' },
    { id: 'sistema', label: 'Sistema' },
  ] as const;

  const unitsDialogAlvo = users.find((u) => u.id === unitsDialogUserId) || null;
  const unitsDialogOptions = Array.from(
    new Set([...seiCatalog.map((c) => c.sigla), ...(unitsDialogAlvo?.units ?? []).map((u) => u.unitSigla)])
  );

  return (
    <div className="p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Administração
      </h1>
      <p className="text-gray-500 text-sm mb-6">Configurações do sistema e gestão de usuários</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-bold" style={{ color: k.color, fontFamily: "'Outfit', sans-serif" }}>
                {k.value}
              </p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: k.color }} />
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              section === t.id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={section === t.id ? { borderBottomColor: '#009C60', color: '#009C60' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------------- Usuários ---------------- */}
      {section === 'users' && (
        <div>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail…"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
              >
                <option value="all">Todos os perfis</option>
                <option value="admin">Administrador</option>
                <option value="analista">Analista</option>
                <option value="assistente">Assistente</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
              <span className="text-xs text-gray-400">
                {filteredUsers.length} de {users.length} usuário(s)
              </span>
            </div>
            <button
              onClick={openNewUser}
              className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
              style={{ background: '#009C60' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Novo Usuário
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">E-mail</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Perfil</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Autenticação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unidades</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Carregando usuários…</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Nenhum usuário encontrado.</td></tr>
                ) : filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ background: u.role === 'admin' ? '#009C60' : '#8DC63F' }}
                        >
                          {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <span className="font-medium text-gray-800 text-sm">
                          {u.name}
                          {u.id === user.id && <span className="text-gray-400 font-normal"> (você)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {roleLabels[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded"
                        style={u.authSource === 'ad'
                          ? { color: '#1E40AF', background: '#DBEAFE' }
                          : { color: '#374151', background: '#F3F4F6' }}
                      >
                        {u.authSource === 'ad' ? 'AD' : 'Local'}
                      </span>
                      {u.username && (
                        <p className="text-[10px] font-mono text-gray-400 mt-0.5">{u.username}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openUnitsDialog(u)}
                        title="Gerenciar unidades"
                        className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {u.units?.length ?? 0} un.
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={u.active
                          ? { color: '#065F46', background: '#D1FAE5' }
                          : { color: '#374151', background: '#F3F4F6' }}
                      >
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditUser(u)}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={u.id === user.id && u.active}
                          className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={u.id === user.id && u.active ? 'Você não pode desativar a própria conta' : (u.active ? 'Desativar' : 'Reativar')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={u.active ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleSyncUnits(u)}
                          disabled={syncingUnitsId === u.id}
                          className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          title="Sincronizar unidades com o SEI"
                        >
                          <svg className={`w-4 h-4 ${syncingUnitsId === u.id ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        {user.id !== u.id && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Excluir"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Configurações SEI ---------------- */}
      {section === 'sei' && (
        <div className="max-w-lg space-y-5 bg-white rounded-xl border border-gray-100 p-6">
          <div>
            <h2 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Credenciais do WebService SEI
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Valores vazios mantêm os do arquivo <code className="bg-gray-100 px-1 rounded">.env</code> do servidor. A chave de
              acesso nunca é exibida — envie um novo valor apenas para trocar.
            </p>
          </div>
          {configLoading ? (
            <p className="text-sm text-gray-400">Carregando configurações…</p>
          ) : (
            [
              { key: 'seiUrl' as const, label: 'URL do WebService SEI', placeholder: 'https://sei.exemplo.br/sei/ws/SeiWS.php' },
              { key: 'seiSiglaSistema' as const, label: 'Sigla do Sistema', placeholder: 'IntWeb' },
              {
                key: 'seiIdentificacaoServico' as const,
                label: 'Chave de Acesso (IdentificacaoServico)',
                placeholder:
                  seiConfigForm.seiIdentificacaoServico === CHAVE_MASCARADA
                    ? '•••••••• (mantida — digite para trocar)'
                    : 'Chave secreta de acesso',
                password: true,
              },
              {
                key: 'seiIdUnidade' as const,
                label: 'ID da Unidade (opcional — vazio busca em todas as unidades)',
                placeholder: 'Deixe em branco para buscar em todas',
              },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
                <input
                  type={field.password ? 'password' : 'text'}
                  value={seiConfigForm[field.key]}
                  onChange={(e) => setSeiConfigForm({ ...seiConfigForm, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
              </div>
            ))
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'loading' || configLoading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-50 disabled:opacity-60"
            >
              {testStatus === 'loading' && (
                <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              {testStatus === 'ok' && <span className="w-4 h-4 text-green-500">✓</span>}
              {testStatus === 'error' && <span className="w-4 h-4 text-red-500">✗</span>}
              {testStatus === 'loading' ? 'Testando…' : testStatus === 'ok' ? 'Conexão OK' : 'Testar Conexão'}
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig || configLoading}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60"
              style={{ background: '#009C60' }}
            >
              {savingConfig ? 'Salvando…' : 'Salvar Configurações'}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Logs de sincronização ---------------- */}
      {section === 'logs' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="text"
              value={logSearchInput}
              onChange={(e) => setLogSearchInput(e.target.value)}
              placeholder="Buscar por nº SEI ou mensagem…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <select
              value={logFilters.tipo}
              onChange={(e) => setLogFilter({ tipo: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
            >
              <option value="all">Todos os tipos</option>
              <option value="manual">Manual</option>
              <option value="batch">Lote</option>
            </select>
            <select
              value={logFilters.status}
              onChange={(e) => setLogFilter({ status: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
            >
              <option value="all">Todos os status</option>
              <option value="success">Sucesso</option>
              <option value="error">Erro</option>
            </select>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={logFilters.dateFrom}
                onChange={(e) => setLogFilter({ dateFrom: e.target.value })}
                title="De"
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              <span className="text-gray-400 text-xs">até</span>
              <input
                type="date"
                value={logFilters.dateTo}
                onChange={(e) => setLogFilter({ dateTo: e.target.value })}
                title="Até"
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            {(logFilters.tipo !== 'all' || logFilters.status !== 'all' || logFilters.search || logFilters.dateFrom || logFilters.dateTo) && (
              <button
                onClick={() => {
                  setLogSearchInput('');
                  setLogFilters({ tipo: 'all', status: 'all', search: '', dateFrom: '', dateTo: '', page: 1, limit: 20 });
                }}
                className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Limpar filtros
              </button>
            )}
            <button
              onClick={handleExportLogsCsv}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              title="Exportar os registros listados em CSV"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar CSV
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Processo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Carregando registros…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Nenhum registro encontrado.</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                      {formatDataPtBR(log.executedAt, true)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium capitalize px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {LOG_TIPO_LABELS[log.tipo] ?? log.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={log.status === 'success'
                          ? { color: '#065F46', background: '#D1FAE5' }
                          : { color: '#991B1B', background: '#FEE2E2' }}
                      >
                        {log.status === 'success' ? 'Sucesso' : 'Erro'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">
                      {log.numeroSei ? (
                        log.processId ? (
                          <button
                            onClick={() => navigate('/processo/' + log.processId)}
                            className="hover:underline"
                            style={{ color: '#009C60' }}
                          >
                            {log.numeroSei}
                          </button>
                        ) : (
                          log.numeroSei
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{log.userName ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                      <button onClick={() => setLogDetail(log)} className="truncate block w-full text-left hover:underline" title="Ver detalhe">
                        {log.mensagem}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination p={logsPagination} onPage={(n) => setLogFilter({ page: n })} />
          </div>
        </div>
      )}

      {/* ---------------- Auditoria ---------------- */}
      {section === 'audit' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={auditSearchInput}
              onChange={(e) => setAuditSearchInput(e.target.value)}
              placeholder="Buscar por usuário, ação ou alvo…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <span className="text-xs text-gray-400">Ações de administração registradas automaticamente</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Alvo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Carregando auditoria…</td></tr>
                ) : auditLogs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Nenhuma ação registrada.</td></tr>
                ) : auditLogs.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                      {formatDataPtBR(a.createdAt, true)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-800">{a.userName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">{a.acao}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{a.alvo}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-md">
                      <span className="line-clamp-2" title={a.detalhe}>{a.detalhe || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination p={auditPagination} onPage={setAuditPage} />
          </div>
        </div>
      )}

      {/* ---------------- Sistema ---------------- */}
      {section === 'sistema' && (
        <div className="space-y-5">
          {sistemaLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-400">Carregando…</div>
          ) : sistema ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">API</p>
                  <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#009C60' }} />
                    Operacional
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Node {sistema.node}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Banco SQLite</p>
                  <p className="text-lg font-bold text-gray-900">{formatBytes(sistema.banco.tamanhoBytes)}</p>
                  <p className="text-xs text-gray-400 mt-1 truncate" title={sistema.banco.caminho}>{sistema.banco.caminho}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Processos</p>
                  <p className="text-lg font-bold text-gray-900">{sistema.contagens.processos}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {sistema.contagens.usuarios} usuário(s) · {sistema.contagens.usuariosAtivos} ativo(s)
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Registros</p>
                  <p className="text-lg font-bold text-gray-900">{sistema.contagens.syncLogs}</p>
                  <p className="text-xs text-gray-400 mt-1">{sistema.contagens.auditLogs} ação(ões) de auditoria</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      Configuração SEI efetiva
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">Valores em uso agora (.env sobrescrito pelas configurações salvas)</p>
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={testStatus === 'loading'}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {testStatus === 'loading' && (
                      <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                    {testStatus === 'ok' && <span className="w-4 h-4 text-green-500">✓</span>}
                    {testStatus === 'error' && <span className="w-4 h-4 text-red-500">✗</span>}
                    {testStatus === 'loading' ? 'Testando…' : 'Testar conexão com o SEI'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <p><span className="font-medium text-gray-700">URL:</span> <span className="text-gray-600 break-all">{sistema.seiConfig.url}</span></p>
                  <p><span className="font-medium text-gray-700">Sigla do sistema:</span> <span className="text-gray-600">{sistema.seiConfig.siglaSistema}</span></p>
                  <p><span className="font-medium text-gray-700">ID da unidade:</span> <span className="text-gray-600">{sistema.seiConfig.idUnidade || '— (todas)'}</span></p>
                  <p>
                    <span className="font-medium text-gray-700">Chave de acesso:</span>{' '}
                    {sistema.seiConfig.chaveDefinida ? (
                      <span className="text-green-700 font-medium">definida ({sistema.seiConfig.chaveOrigem === 'banco' ? 'configurações' : '.env'})</span>
                    ) : (
                      <span className="text-red-600 font-medium">não definida</span>
                    )}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-400">
              Não foi possível carregar as informações do sistema.
            </div>
          )}
        </div>
      )}

      {/* ---------------- Modal de usuário ---------------- */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nome completo
                  {editingUser?.authSource === 'ad' && (
                    <span className="text-xs text-gray-400 font-normal ml-1">(controlado pelo AD)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome completo"
                  disabled={editingUser?.authSource === 'ad'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mail institucional
                  {editingUser?.authSource === 'ad' && (
                    <span className="text-xs text-gray-400 font-normal ml-1">(controlado pelo AD)</span>
                  )}
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="E-mail institucional"
                  disabled={editingUser?.authSource === 'ad'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              {editingUser?.authSource === 'ad' ? (
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500">
                    Senha controlada pelo Active Directory — não pode ser criada nem alterada no sistema.
                  </p>
                </div>
              ) : !editingUser && form.authSource === 'ad' ? (
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-500">
                    Usuários do Active Directory não possuem senha neste sistema — a autenticação é feita pelo AD.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingUser ? 'Nova senha (deixe em branco para manter)' : 'Senha temporária'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingUser ? 'Nova senha' : 'Senha temporária'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  />
                  <p className="text-xs text-gray-400 mt-1">Mínimo de {SENHA_MINIMA} caracteres.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Username
                  <span className="text-xs text-gray-400 font-normal ml-1">(sem @)</span>
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Digite seu nome de usuário"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Identificador usado no login (para AD, é o sAMAccountName). Se vazio, usa o prefixo do e-mail.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Perfil de Acesso</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={editingUser?.id === user.id && form.role === 'admin'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="assistente">Assistente</option>
                  <option value="analista">Analista</option>
                  <option value="admin">Administrador</option>
                </select>
                {editingUser?.id === user.id && form.role === 'admin' && (
                  <p className="text-xs text-gray-400 mt-1">Você não pode remover o próprio perfil de administrador.</p>
                )}
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Fonte de Autenticação</label>
                  <select
                    value={form.authSource}
                    onChange={(e) => setForm({ ...form, authSource: e.target.value as 'local' | 'ad' })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  >
                    <option value="local">Local (senha do sistema)</option>
                    <option value="ad">Active Directory</option>
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  disabled={editingUser?.id === user.id}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                />
                Usuário ativo
                {editingUser?.id === user.id && <span className="text-xs text-gray-400">(você — não desative)</span>}
              </label>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                disabled={saving}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                style={{ background: '#009C60' }}
              >
                {saving ? 'Salvando…' : editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Dialog de unidades ---------------- */}
      <MultiSelectDialog
        open={Boolean(unitsDialogAlvo)}
        title={unitsDialogAlvo ? `Unidades de ${unitsDialogAlvo.name}` : 'Unidades'}
        options={unitsDialogOptions}
        selected={unitsDialogSelected}
        onApply={handleUnitsApply}
        onClose={() => setUnitsDialogUserId(null)}
        searchPlaceholder="Buscar unidade…"
        emptyLabel="Nenhuma unidade encontrada"
      />

      {/* ---------------- Detalhe do log ---------------- */}
      {logDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setLogDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Detalhe do registro
              </h2>
              <button onClick={() => setLogDetail(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p><span className="font-medium text-gray-700">Data/Hora:</span> <span className="text-gray-600">{formatDataPtBR(logDetail.executedAt, true)}</span></p>
              <p><span className="font-medium text-gray-700">Tipo:</span> <span className="text-gray-600">{LOG_TIPO_LABELS[logDetail.tipo] ?? logDetail.tipo}</span></p>
              <p><span className="font-medium text-gray-700">Status:</span> <span className="text-gray-600">{logDetail.status === 'success' ? 'Sucesso' : 'Erro'}</span></p>
              <p><span className="font-medium text-gray-700">Processo:</span> <span className="text-gray-600 font-mono">{logDetail.numeroSei ?? '—'}</span></p>
              <p><span className="font-medium text-gray-700">Usuário:</span> <span className="text-gray-600">{logDetail.userName ?? '—'}</span></p>
              <div>
                <p className="font-medium text-gray-700 mb-1">Mensagem:</p>
                <p className="text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap">{logDetail.mensagem}</p>
              </div>
              {logDetail.processId && (
                <button
                  onClick={() => {
                    navigate('/processo/' + logDetail.processId);
                    setLogDetail(null);
                  }}
                  className="text-sm font-medium hover:underline"
                  style={{ color: '#009C60' }}
                >
                  Abrir processo →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
