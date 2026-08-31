import { useState } from 'react';
import type { Page } from '../App';
import { mockProcesses } from '../data/mock';

interface Props {
  navigateTo: (page: Page, id?: string) => void;
}

export default function NewProcess({ navigateTo }: Props) {
  const [numero, setNumero] = useState('');
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<typeof mockProcesses[0] | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const SEI_REGEX = /^\d{2}\.\d{2}\.\d{9}-\d$/;

  const handleSearch = async () => {
    if (!SEI_REGEX.test(numero.trim())) {
      setError('Número inválido. Use o formato XX.XX.XXXXXXXXX-X');
      return;
    }
    setError('');
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    const result = mockProcesses.find((p) => p.numeroSei === numero.trim());
    setLoading(false);
    if (result) {
      setFound(result);
    } else {
      setError('Processo não encontrado no SEI. Verifique o número e tente novamente.');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaved(true);
    setLoading(false);
    setTimeout(() => navigateTo('process-details', found?.id), 800);
  };

  return (
    <div className="p-8 max-w-2xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => navigateTo('processes')} className="hover:underline" style={{ color: '#009C60' }}>
          Processos
        </button>
        <span>/</span>
        <span>Novo Processo</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Cadastrar Novo Processo
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        Informe o número do processo no SEI para buscar e importar seus dados automaticamente.
      </p>

      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Número do Processo SEI
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={numero}
              onChange={(e) => { setNumero(e.target.value); setError(''); setFound(null); }}
              placeholder="26.17.000008588-9"
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !numero.trim()}
              className="px-5 py-2.5 text-white font-medium text-sm rounded-lg disabled:opacity-60 transition-colors"
              style={{ background: '#009C60' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Buscando…
                </span>
              ) : 'Buscar no SEI'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Formato: XX.XX.XXXXXXXXX-X</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {found && (
          <div className="border border-green-200 rounded-xl overflow-hidden">
            <div className="bg-green-50 px-4 py-3 flex items-center gap-2 border-b border-green-100">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-green-700">Processo encontrado no SEI</span>
            </div>
            <div className="p-5 space-y-3">
              {[
                ['Número', found.numeroSei],
                ['Tipo', found.tipo],
                ['Especificação', found.especificacao],
                ['Autuação', new Date(found.dataAutuacao).toLocaleDateString('pt-BR')],
                ['Nível de Acesso', found.nivelAcesso],
                ['Interessados', found.interessados.join(', ')],
                ['Unidade Atual', `${found.unidadeAtual.sigla} – ${found.unidadeAtual.descricao}`],
                ['Último Andamento', found.ultimoAndamento.descricao],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-gray-500 font-medium">{label}</span>
                  <span className="col-span-2 text-gray-800 font-mono text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {found && !saved && (
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-3 text-white font-semibold text-sm rounded-lg disabled:opacity-60 transition-colors"
            style={{ background: '#009C60' }}
          >
            {loading ? 'Cadastrando…' : 'Cadastrar Processo'}
          </button>
        )}

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
            <p className="text-green-700 font-medium text-sm">Processo cadastrado com sucesso! Redirecionando…</p>
          </div>
        )}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-5">
        <p className="text-xs font-semibold text-blue-700 mb-1">Dica: importação em lote</p>
        <p className="text-xs text-blue-600">
          Para cadastrar vários processos de uma vez, use a funcionalidade de{' '}
          <button onClick={() => navigateTo('import')} className="font-semibold underline">
            Importar Lote
          </button>
          . Você pode colar uma lista de números ou enviar um arquivo CSV.
        </p>
      </div>
    </div>
  );
}
