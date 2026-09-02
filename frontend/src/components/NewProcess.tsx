import { useState } from 'react';
import type { Page } from '../App';
import { createProcess } from '../api';

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
  const [results, setResults] = useState<ImportResult[]>([]);
  const [currentImport, setCurrentImport] = useState<string | null>(null);

  const detectedNumbers = extractSeiNumbers(inputText);

  const handleImport = async () => {
    if (!detectedNumbers.length) return;

    setRunning(true);
    setProgress(0);
    setResults([]);
    setCurrentImport(null);

    for (let i = 0; i < detectedNumbers.length; i++) {
      const num = detectedNumbers[i];
      setCurrentImport(num);

      try {
        const process = await createProcess(num);
        setResults((prev) => [
          ...prev,
          { numero: num, status: 'success', mensagem: `Processo ${process.numeroSei} importado com sucesso.` },
        ]);
      } catch (err: any) {
        const msg = err?.message || 'Erro desconhecido';
        const skipped = msg.toLowerCase().includes('já cadastrado') || msg.toLowerCase().includes('already exists');
        setResults((prev) => [
          ...prev,
          { numero: num, status: skipped ? 'skipped' : 'error', mensagem: msg },
        ]);
      }

      setProgress(Math.round(((i + 1) / detectedNumbers.length) * 100));
    }

    setCurrentImport(null);
    setRunning(false);
  };

  const successes = results.filter((r) => r.status === 'success').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return (
    <div className="p-8 max-w-6xl" style={{ fontFamily: "'Inter', sans-serif" }}>
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

      {/* Barra de progresso (acima de tudo) */}
      {running && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            <svg className="w-4 h-4 animate-spin" style={{ color: '#009C60' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Importando {results.length} de {detectedNumbers.length}… {progress}%
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ background: '#009C60', width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* Coluna esquerda: input */}
        <div className="flex-1 min-w-0 space-y-4">
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
              disabled={running}
            />
            {detectedNumbers.length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  {detectedNumbers.length} processo(s) detectado(s):
                </p>
                <div className="flex flex-wrap gap-2">
                  {detectedNumbers.map((num) => {
                    const result = results.find((r) => r.numero === num);
                    const isCurrent = currentImport === num;
                    return (
                      <span
                        key={num}
                        className="px-2 py-1 text-xs font-mono rounded-md border transition-colors"
                        style={
                          isCurrent
                            ? { color: '#1D4ED8', background: '#DBEAFE', borderColor: '#93C5FD' }
                            : result?.status === 'success'
                            ? { color: '#065F46', background: '#D1FAE5', borderColor: '#A7F3D0' }
                            : result?.status === 'skipped'
                            ? { color: '#92400E', background: '#FEF3C7', borderColor: '#FDE68A' }
                            : result?.status === 'error'
                            ? { color: '#991B1B', background: '#FEE2E2', borderColor: '#FECACA' }
                            : { color: '#374151', background: '#F9FAFB', borderColor: '#E5E7EB' }
                        }
                      >
                        {isCurrent && (
                          <svg className="inline w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        )}
                        {num}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleImport}
            disabled={running || detectedNumbers.length === 0}
            className="px-6 py-3 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: '#009C60' }}
          >
            {running ? 'Importando…' : `Importar ${detectedNumbers.length} Processo(s)`}
          </button>

          {!running && results.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={() => { setResults([]); setInputText(''); setProgress(0); }}
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
          )}
        </div>

        {/* Coluna direita: resultados */}
        {results.length > 0 && (
          <div className="w-96 shrink-0 space-y-4">
            <div className="space-y-2">
              {[
                { label: 'Total', value: results.length, color: '#374151', bg: '#F9FAFB' },
                { label: 'Importados', value: successes, color: '#065F46', bg: '#D1FAE5' },
                { label: 'Já Cadastrados', value: skipped, color: '#92400E', bg: '#FEF3C7' },
                { label: 'Erros', value: errors, color: '#991B1B', bg: '#FEE2E2' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3" style={{ background: item.bg }}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{item.label}</p>
                  <p className="text-xl font-bold" style={{ color: item.color, fontFamily: "'Outfit', sans-serif" }}>{item.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Resultado</p>
              </div>
              <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                {[...results].reverse().map((r) => (
                  <div key={r.numero} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-gray-800">{r.numero}</span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={
                          r.status === 'success'
                            ? { color: '#065F46', background: '#D1FAE5' }
                            : r.status === 'skipped'
                            ? { color: '#92400E', background: '#FEF3C7' }
                            : { color: '#991B1B', background: '#FEE2E2' }
                        }
                      >
                        {r.status === 'success' ? 'OK' : r.status === 'skipped' ? 'Já Cadastrado' : 'Erro'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{r.mensagem}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
