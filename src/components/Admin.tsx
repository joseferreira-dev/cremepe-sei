import { useState } from 'react';
import type { User } from '../types';
import { mockUsers, mockLogs } from '../data/mock';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  protocolo: 'Protocolo',
  analista: 'Analista',
  gestor: 'Gestor',
};

interface Props {
  user: User;
}

export default function Admin({ user }: Props) {
  const [section, setSection] = useState<'users' | 'sei' | 'logs'>('users');
  const [users, setUsers] = useState(mockUsers);
  const [showUserModal, setShowUserModal] = useState(false);
  const [seiConfig, setSeiConfig] = useState({
    siglaSistema: 'IntWeb',
    identificacaoServico: '••••••••••••••••••••',
    idUnidade: '110002092',
    urlWsdl: 'https://sei.cremepe.org.br/sei/controlador_ws.php?servico=sei',
  });
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const handleTestConnection = async () => {
    setTestStatus('loading');
    await new Promise((r) => setTimeout(r, 1500));
    setTestStatus('ok');
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const tabs = [
    { id: 'users', label: 'Usuários' },
    { id: 'sei', label: 'Configurações SEI' },
    { id: 'logs', label: 'Logs de Sincronização' },
  ] as const;

  return (
    <div className="p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Administração
      </h1>
      <p className="text-gray-500 text-sm mb-6">Configurações do sistema e gestão de usuários</p>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px ${
              section === t.id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={section === t.id ? { borderBottomColor: '#009C60', color: '#009C60' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users */}
      {section === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">{users.length} usuário(s) cadastrado(s)</p>
            <button
              onClick={() => setShowUserModal(true)}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ background: u.role === 'admin' ? '#009C60' : u.role === 'gestor' ? '#29ABE2' : '#8DC63F' }}
                        >
                          {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <span className="font-medium text-gray-800 text-sm">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {roleLabels[u.role]}
                      </span>
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
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setUsers(users.map((x) => x.id === u.id ? { ...x, active: !x.active } : x))}
                          className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title={u.active ? 'Desativar' : 'Reativar'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={u.active ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} />
                          </svg>
                        </button>
                        {user.id !== u.id && (
                          <button
                            onClick={() => setUsers(users.filter((x) => x.id !== u.id))}
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

      {/* SEI Config */}
      {section === 'sei' && (
        <div className="max-w-lg space-y-5 bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Credenciais do WebService SEI
          </h2>
          {[
            { key: 'siglaSistema', label: 'Sigla do Sistema', placeholder: 'IntWeb' },
            { key: 'identificacaoServico', label: 'Chave de Acesso (IdentificacaoServico)', placeholder: 'Chave secreta de acesso' },
            { key: 'idUnidade', label: 'ID da Unidade Padrão', placeholder: '110002092' },
            { key: 'urlWsdl', label: 'URL do WSDL', placeholder: 'https://sei.exemplo.br/sei/controlador_ws.php?servico=sei' },
          ].map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
              <input
                type={field.key === 'identificacaoServico' ? 'password' : 'text'}
                value={(seiConfig as Record<string, string>)[field.key]}
                onChange={(e) => setSeiConfig({ ...seiConfig, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'loading'}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {testStatus === 'loading' && (
                <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {testStatus === 'ok' && <span className="w-4 h-4 text-green-500">✓</span>}
              {testStatus === 'error' && <span className="w-4 h-4 text-red-500">✗</span>}
              {testStatus === 'loading' ? 'Testando…' : testStatus === 'ok' ? 'Conexão OK' : 'Testar Conexão'}
            </button>
            <button
              className="px-4 py-2 text-white text-sm font-medium rounded-lg"
              style={{ background: '#009C60' }}
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      )}

      {/* Logs */}
      {section === 'logs' && (
        <div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Processo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {mockLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                      {new Date(log.executedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium capitalize px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {log.tipo}
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
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{log.numeroSei ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                      <p className="truncate">{log.mensagem}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User modal (simplified) */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Novo Usuário</h2>
              <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {['Nome completo', 'E-mail institucional', 'Senha temporária'].map((label) => (
                <div key={label}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                  <input
                    type={label === 'Senha temporária' ? 'password' : 'text'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    placeholder={label}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Perfil de Acesso</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30">
                  <option value="protocolo">Protocolo</option>
                  <option value="analista">Analista</option>
                  <option value="gestor">Gestor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Cancelar
              </button>
              <button
                onClick={() => setShowUserModal(false)}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium"
                style={{ background: '#009C60' }}
              >
                Criar Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
