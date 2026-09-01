import { useState, useEffect } from 'react';
import type { User, UserUnit } from '../types';
import { fetchProfile, syncMyUnits } from '../api';
import { useDialog } from './ui/Dialog';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  assistente: 'Assistente',
  analista: 'Analista',
};

interface Props {
  user: User;
}

export default function Profile({ user }: Props) {
  const dialog = useDialog();
  const [profile, setProfile] = useState<(User & { units: UserUnit[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
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
      dialog.success(`${result.synced} unidade(s) sincronizada(s) com sucesso.`);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao sincronizar unidades.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  const units = profile?.units || [];

  return (
    <div className="p-8 max-w-2xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Meu Perfil
      </h1>
      <p className="text-gray-500 text-sm mb-6">Dados pessoais e unidades SEI vinculadas</p>

      {/* Dados pessoais */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
            style={{ background: '#009C60' }}
          >
            {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{user.name}</h2>

            <div className="space-y-1.5 text-sm text-gray-600">
              <p><span className="font-medium text-gray-700">E-mail:</span> {user.email}</p>
              <p>
                <span className="font-medium text-gray-700">Perfil:</span>{' '}
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {roleLabels[user.role]}
                </span>
              </p>
              <p>
                <span className="font-medium text-gray-700">Autenticação:</span>{' '}
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded"
                  style={user.authSource === 'ad'
                    ? { color: '#1E40AF', background: '#DBEAFE' }
                    : { color: '#374151', background: '#F3F4F6' }}
                >
                  {user.authSource === 'ad' ? 'Active Directory' : 'Local'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Unidades SEI */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Unidades SEI
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {units.length} unidade(s) vinculada(s) ao seu perfil
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
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>

        {units.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Nenhuma unidade vinculada. Clique em "Sincronizar" para buscar.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {units.map((u) => (
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
    </div>
  );
}
