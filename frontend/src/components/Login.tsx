import { useState } from 'react';
import logoCremepe from '@/imports/logo-cremepe.png';
import logoSei from '@/imports/logo-sei.png';

interface Props {
  onLogin: (email: string, password: string) => Promise<string | null>;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Preencha o usuário e senha para continuar.');
      return;
    }
    setError('');
    setLoading(true);
    const err = await onLogin(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12"
        style={{ background: 'linear-gradient(160deg, #003D26 0%, #006B42 50%, #009C60 100%)' }}
      >
        <div>
          <img src={logoCremepe} alt="CREMEPE" className="h-16 w-16 object-contain" />
          <h1
            className="mt-8 text-4xl font-bold text-white leading-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            CREMEPE<br />SEI
          </h1>
          <p className="mt-4 text-green-200 text-lg leading-relaxed">
            Sistema de Gestão Inteligente de Processos
          </p>
        </div>

        <div className="space-y-6">
          {[
            ['Encaminhamento preciso', 'Resumos por IA orientam o setor correto para cada processo'],
            ['Busca avançada', 'Filtre por unidade, tipo, data, status e muito mais'],
            ['Sincronizado com SEI', 'Status sempre atualizado via WebService SOAP'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: '#8DC63F' }}
              />
              <div>
                <p className="text-white font-medium text-sm">{title}</p>
                <p className="text-green-300 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}

          <div className="pt-4 border-t border-green-700">
            <div className="flex items-center gap-3">
              <img src={logoSei} alt="SEI" className="h-6 object-contain opacity-70" />
              <span className="text-green-400 text-xs">Integrado ao Sistema Eletrônico de Informações</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <img src={logoCremepe} alt="CREMEPE" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
              CREMEPE SEI
            </span>
          </div>

          <h2
            className="text-2xl font-bold text-gray-900 mb-1"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Bem-vindo de volta
          </h2>
          <p className="text-gray-500 text-sm mb-8">Entre com sua senha do Active Directory</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Usuário</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ '--tw-ring-color': '#009C60' } as React.CSSProperties}
                placeholder="Ex: gjose"
                autoComplete="username"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <button type="button" className="text-xs hover:underline" style={{ color: '#009C60' }}>
                  Esqueceu a senha?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded"
                style={{ accentColor: '#009C60' }}
              />
              <label htmlFor="remember" className="text-sm text-gray-600">Lembrar-me neste dispositivo</label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-semibold py-3 rounded-lg text-sm transition-all disabled:opacity-70"
              style={{ background: loading ? '#006B42' : '#009C60' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Autenticando…
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-gray-400">
            CREMEPE SEI v1.0.0 · Conselho Regional de Medicina de Pernambuco
          </p>
        </div>
      </div>
    </div>
  );
}
