import { useState } from 'react';
import type { Page } from '../App';
import { batchImport } from '../api';

interface Props {
  navigateTo: (page: Page) => void;
}

interface ImportResult {
  numero: string;
  status: 'success' | 'error' | 'skipped';
  mensagem: string;
}

const SEI_REGEX = /\d{2}\.\d{2}\.\d{9}-\d/g;

function extractSeiNumbers(text: string): string[] {
  const matches = text.match(SEI_REGEX) || [];
  return [...new Set(matches)];
}

const PLACEHOLDER = `Cole os números dos processos (o sistema extrai automaticamente):

26.17.000008588-9
25.17.000009817-9
26.17.000009307-5
26.17.000010045-1
26.17.000009336-9`;

export default function NewProcess({ navigateTo }: Props) {
  const [inputText, setInputText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const detectedNumbers = extractSeiNumbers(inputText);

  const handleImport = async () => {
    if (!detectedNumbers.length) return;

    setRunning(true);
    setProgress(0);

    const res = await batchImport(detectedNumbers);
    let done = 0;
    const interval = setInterval(() => {
      done = Math.min(detectedNumbers.length, done + 1);
      setProgress(Math.round((done / detectedNumbers.length) * 100));
      if (done >= detectedNumbers.length) clearInterval(interval);
    }, 150);

    setResults(res.results.map((r) => ({
      numero: r.numero,
      status: (r.status === 'success' ? 'success' : r.status === 'skipped' ? 'skipped' : 'error') as ImportResult['status'],
      mensagem: r.mensagem,
    })));
    setRunning(false);
    clearInterval(interval);
  };

  const successes = results?.filter((r) => r.status === 'success' || r.status === 'skipped').length ?? 0;
  const errors = results?.filter((r) => r.status === 'error').length ?? 0;

  return (
    <div className="p-8 max-w-3xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => navigateTo('processes')} className="hover:underline" style={{ color: '#009C60' }}>
          Processos
        </button>
        <span>/</span>
        <span>Cadastrar Processo</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Cadastrar Processo
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        Cole os números dos processos no SEI para buscar e importar seus dados automaticamente.
      </p>

      {!results ? (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Números dos Processos SEI
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={PLACEHOLDER}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30 resize-none"
              rows={8}
            />
            {detectedNumbers.length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  {detectedNumbers.length} processo(s) detectado(s):
                </p>
                <div className="flex flex-wrap gap-2">
                  {detectedNumbers.map((num) => (
                    <span key={num} className="px-2 py-1 bg-green-50 text-green-700 text-xs font-mono rounded-md border border-green-200">
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {running && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <svg className="w-4 h-4 animate-spin" style={{ color: '#009C60' }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Consultando SEI e importando processos… {progress}%
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ background: '#009C60', width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={running || detectedNumbers.length === 0}
            className="px-6 py-3 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: '#009C60' }}
          >
            {running ? 'Importando…' : `Importar ${detectedNumbers.length} Processo(s)`}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total', value: results.length, color: '#374151', bg: '#F9FAFB' },
              { label: 'Importados', value: successes, color: '#065F46', bg: '#D1FAE5' },
              { label: 'Falhas', value: errors, color: '#991B1B', bg: '#FEE2E2' },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-gray-100 rounded-xl p-5 text-center">
                <p className="text-3xl font-bold" style={{ color: item.color, fontFamily: "'Outfit', sans-serif" }}>{item.value}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-medium">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Número SEI</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.numero} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{r.numero}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={r.status === 'success'
                          ? { color: '#065F46', background: '#D1FAE5' }
                          : { color: '#991B1B', background: '#FEE2E2' }}
                      >
                        {r.status === 'success' ? 'Sucesso' : 'Erro'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.mensagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setResults(null); setInputText(''); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Nova Importação
            </button>
            <button
              onClick={() => navigateTo('processes')}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white"
              style={{ background: '#009C60' }}
            >
              Ver todos os processos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
