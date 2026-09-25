import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, UserUnit, EstatisticasPerfil, AuditoriaLog } from '../types';
import {
  fetchProfile,
  syncMyUnits,
  updateProfile,
  alterarSenha,
  fetchEstatisticas,
  fetchAtividades,
  getToken,
} from '../api';
import { formatDataPtBR } from '../utils/date';
import { getTema, setTema, type Tema } from '../utils/preferences';
import { useDialog } from './ui/Dialog';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  assistente: 'Assistente',
  analista: 'Analista',
};

const permissoesPorPapel: Record<string, string> = {
  admin:
    'Acesso total: visualiza e sincroniza todos os processos (inclusive finalizados), gerencia usuários, unidades, configurações, logs e auditoria, e pode excluir processos.',
  analista:
    'Vê todos os processos; processos de acesso Restrito fora das suas unidades aparecem apenas com dados básicos (sem detalhes). Pode gerar resumos, anotações e sincronizar.',
  assistente:
    'Vê somente os processos das unidades SEI vinculadas ao seu perfil. Sem unidade vinculada, nenhum processo é exibido.',
};

const SENHA_MINIMA = 8;

function expiracaoSessao(): Date | null {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function tempoRestante(ms: number): string {
  if (ms <= 0) return 'expirada';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}

interface Props {
  user: User;
  onUserUpdated: (user: User) => void;
}

export default function Profile({ user, onUserUpdated }: Props) {
  const dialog = useDialog();
  const navigate = useNavigate();
  const [section, setSection] = useState<'dados' | 'unidades' | 'atividade' | 'preferencias'>('dados');
  const [profile, setProfile] = useState<(User & { units: UserUnit[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<EstatisticasPerfil | null>(null);
  const [atividades, setAtividades] = useState<AuditoriaLog[]>([]);
  const [unitSearch, setUnitSearch] = useState('');

  // Edição de nome
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeDraft, setNomeDraft] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);

  // Troca de senha (dialog)
  const [showSenhaModal, setShowSenhaModal] = useState(false);
  const [senhaForm, setSenhaForm] = useState({ atual: '', nova: '', confirmar: '' });
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  // Preferência: tema do sistema (escuro ainda não implementado)
  const [tema, setTemaState] = useState<Tema>(() => getTema());

  const expiracao = expiracaoSessao();

  useEffect(() => {
    fetchProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchEstatisticas().then(setStats).catch(() => {});
    fetchAtividades().then(setAtividades).catch(() => {});
  }, []);

  const handleSyncUnits = async () => {
    const confirmed = await dialog.confirm(
      'A sincronização busca suas unidades no SEI e pode demorar um pouco. Deseja continuar?'
    );
    if (!confirmed) return;

    setSyncing(true);
    try {
      const result = await syncMyUnits();
      const updated = await fetchProfile();
      setProfile(updated);
      fetchEstatisticas().then(setStats).catch(() => {});
      dialog.success(`${result.synced} unidade(s) sincronizada(s) com sucesso.`);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao sincronizar unidades.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSalvarNome = async () => {
    if (!nomeDraft.trim()) {
      dialog.alert('O nome não pode ficar vazio.');
      return;
    }
    setSalvandoNome(true);
    try {
      const updated = await updateProfile({ name: nomeDraft.trim() });
      onUserUpdated(updated);
      setEditandoNome(false);
      dialog.success('Nome atualizado com sucesso.');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao atualizar nome.');
    } finally {
      setSalvandoNome(false);
    }
  };

  const handleAlterarSenha = async () => {
    if (!senhaForm.atual || !senhaForm.nova || !senhaForm.confirmar) {
      dialog.alert('Preencha todos os campos de senha.');
      return;
    }
    if (senhaForm.nova.length < SENHA_MINIMA) {
      dialog.alert(`A nova senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`);
      return;
    }
    if (senhaForm.nova !== senhaForm.confirmar) {
      dialog.alert('A confirmação não confere com a nova senha.');
      return;
    }
    setSalvandoSenha(true);
    try {
      const r = await alterarSenha({ currentPassword: senhaForm.atual, newPassword: senhaForm.nova });
      setSenhaForm({ atual: '', nova: '', confirmar: '' });
      setShowSenhaModal(false);
      dialog.success(r.message || 'Senha alterada com sucesso.');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao alterar senha.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  const handleTema = (novo: Tema) => {
    setTemaState(novo);
    setTema(novo);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </div>
    );
  }

  const units = profile?.units || [];
  const isAd = user.authSource === 'ad';
  const unidadesFiltradas = units.filter((u) => {
    const s = unitSearch.trim().toLowerCase();
    if (!s) return true;
    return u.unitSigla.toLowerCase().includes(s) || (u.unitDesc || '').toLowerCase().includes(s);
  });

  const kpis = [
    { label: 'Processos que tenho acesso', value: stats?.queTenhoAcesso, color: '#009C60' },
    { label: 'Processos das minhas unidades', value: stats?.dasMinhasUnidades, color: '#29ABE2' },
    { label: 'Minhas anotações', value: stats?.anotacoes, color: '#8DC63F' },
  ];

  const tabs = [
    { id: 'dados', label: 'Dados Pessoais' },
    { id: 'unidades', label: 'Unidades SEI' },
    { id: 'atividade', label: 'Atividades' },
    { id: 'preferencias', label: 'Preferências' },
  ] as const;

  return (
    <div className="p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Meu Perfil
      </h1>
      <p className="text-gray-500 text-sm mb-6">Dados pessoais, segurança, estatísticas e unidades SEI</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-bold" style={{ color: k.color, fontFamily: "'Outfit', sans-serif" }}>
                {k.value === undefined ? '—' : k.value}
              </p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: k.color }} />
          </div>
        ))}
      </div>

      {/* Abas */}
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

      {/* ---------------- Dados Pessoais ---------------- */}
      {section === 'dados' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Perfil */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
                  style={{ background: '#009C60' }}
                >
                  {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    {editandoNome ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={nomeDraft}
                          onChange={(e) => setNomeDraft(e.target.value)}
                          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                          autoFocus
                        />
                        <button
                          onClick={handleSalvarNome}
                          disabled={salvandoNome}
                          className="px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-60"
                          style={{ background: '#009C60' }}
                        >
                          {salvandoNome ? 'Salvando…' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => setEditandoNome(false)}
                          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold text-gray-900">{user.name}</h2>
                        {!isAd && (
                          <button
                            onClick={() => {
                              setNomeDraft(user.name);
                              setEditandoNome(true);
                            }}
                            className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Editar nome
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-600 mt-3">
                    <p>
                      <span className="font-medium text-gray-700">E-mail:</span> {user.email}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Perfil:</span>{' '}
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {roleLabels[user.role] ?? user.role}
                      </span>
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Autenticação:</span>{' '}
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded"
                        style={isAd
                          ? { color: '#1E40AF', background: '#DBEAFE' }
                          : { color: '#374151', background: '#F3F4F6' }}
                      >
                        {isAd ? 'Active Directory' : 'Local'}
                      </span>
                      {isAd && <span className="text-xs text-gray-400 ml-2">Nome e senha controlados pelo AD.</span>}
                    </p>
                    <p>
                      <span className="font-medium text-gray-700">Username:</span>{' '}
                      <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {profile?.username ?? '—'}
                      </span>
                    </p>
                  </div>

                  {expiracao && (
                    <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                      Sessão expira em {tempoRestante(expiracao.getTime() - Date.now())} (
                      {formatDataPtBR(expiracao.toISOString(), true)})
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* O que eu posso acessar */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-800 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                O que eu posso acessar
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className="font-medium text-gray-800">{roleLabels[user.role] ?? user.role}:</span>{' '}
                {permissoesPorPapel[user.role] ?? 'Perfil sem descrição — contate o administrador.'}
              </p>
            </div>
          </div>

          {/* Segurança (abre dialog de senha) */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 mt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Segurança
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {isAd
                    ? 'Sua senha é controlada pelo Active Directory — o sistema não a armazena e não permite alterá-la aqui. Troque-a pelo AD ou contate o administrador.'
                    : `Altere sua senha periodicamente (mínimo de ${SENHA_MINIMA} caracteres). A troca fica registrada na auditoria.`}
                </p>
              </div>
              {!isAd && (
                <button
                  onClick={() => {
                    setSenhaForm({ atual: '', nova: '', confirmar: '' });
                    setShowSenhaModal(true);
                  }}
                  className="px-4 py-2 text-white text-sm font-medium rounded-lg shrink-0"
                  style={{ background: '#009C60' }}
                >
                  Alterar senha
                </button>
              )}
            </div>
          </div>

          {/* Dialog: alterar senha */}
          {showSenhaModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Alterar Senha
                  </h2>
                  <button onClick={() => setShowSenhaModal(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha atual</label>
                    <input
                      type="password"
                      value={senhaForm.atual}
                      onChange={(e) => setSenhaForm({ ...senhaForm, atual: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nova senha</label>
                    <input
                      type="password"
                      value={senhaForm.nova}
                      onChange={(e) => setSenhaForm({ ...senhaForm, nova: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar nova senha</label>
                    <input
                      type="password"
                      value={senhaForm.confirmar}
                      onChange={(e) => setSenhaForm({ ...senhaForm, confirmar: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Mínimo de {SENHA_MINIMA} caracteres. Você será auditado ao alterar a senha.
                  </p>
                </div>
                <div className="flex gap-3 p-6 border-t border-gray-100">
                  <button
                    onClick={() => setShowSenhaModal(false)}
                    className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAlterarSenha}
                    disabled={salvandoSenha}
                    className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                    style={{ background: '#009C60' }}
                  >
                    {salvandoSenha ? 'Alterando…' : 'Alterar senha'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- Unidades SEI ---------------- */}
      {section === 'unidades' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Unidades SEI
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {units.length} unidade(s) vinculada(s) ·{' '}
                {profile?.unitsSyncedAt
                  ? `sincronizadas em ${formatDataPtBR(profile.unitsSyncedAt, true)}`
                  : 'nunca sincronizadas'}
              </p>
            </div>
            <button
              onClick={handleSyncUnits}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {syncing ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          </div>

          {units.length > 0 && (
            <input
              type="text"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Buscar unidade por sigla ou descrição…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
          )}

          {units.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Nenhuma unidade vinculada. Clique em "Sincronizar" para buscar.
            </div>
          ) : unidadesFiltradas.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">Nenhuma unidade encontrada para "{unitSearch}".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
              {unidadesFiltradas.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: '#009C60' }}
                  >
                    {u.unitSigla.slice(-2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.unitSigla}</p>
                    <p className="text-xs text-gray-500 truncate">{u.unitDesc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Atividades (auditoria do próprio usuário) ---------------- */}
      {section === 'atividade' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Atividades recentes
          </h3>
          <p className="text-xs text-gray-500 mb-4">Suas últimas ações registradas na auditoria do sistema</p>
          {atividades.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma ação registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {atividades.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-50 flex-wrap"
                >
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0"
                  >
                    {a.acao}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{a.alvo}</span>
                  {a.detalhe && (
                    <span className="text-xs text-gray-500 line-clamp-1 flex-1 min-w-0" title={a.detalhe}>
                      {a.detalhe}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 shrink-0 ml-auto">
                    {formatDataPtBR(a.createdAt, true)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Preferências ---------------- */}
      {section === 'preferencias' && (
        <div className="max-w-lg bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Tema do Sistema
          </h3>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <label className="text-sm text-gray-700">Tema:</label>
            <select
              value={tema}
              onChange={(e) => handleTema(e.target.value as Tema)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
            >
              <option value="claro">Claro (padrão)</option>
              <option value="escuro">Escuro</option>
            </select>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            A preferência fica salva neste dispositivo e será aplicada quando o modo escuro estiver disponível.
          </p>
          {tema === 'escuro' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              O tema escuro ainda não foi implementado — por enquanto a interface permanece clara.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
