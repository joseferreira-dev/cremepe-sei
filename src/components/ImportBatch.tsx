import { useState } from 'react';
import type { Page } from '../App';

interface Props {
  navigateTo: (page: Page) => void;
}

interface ImportResult {
  numero: string;
  status: 'success' | 'error';
  mensagem: string;
}

export default function ImportBatch({ navigateTo }: Props) {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const mockNumbers = [
    '26.17.000008588-9', '26.17.000009307-5', '25.17.000007966-2',
    '26.17.000010045-1', '26.17.000011230-7', '24.17.000005441-3',
  ];

  const handleImport = async () => {
    const nums = mode === 'text'
      ? text.split(/[,;\n]/).map((n) => n.trim()).filter(Boolean)
      : ['26.17.000012345-0', '26.17.000013456-1'];

    if (!nums.length) return;
    setRunning(true);
    setProgress(0);
    const res: ImportResult[] = [];

    for (let i = 0; i < nums.length; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const isKnown = mockNumbers.includes(nums[i]);
      res.push({
        numero: nums[i],
        status: isKnown ? 'success' : Math.random() > 0.3 ? 'success' : 'error',
        mensagem: isKnown ? 'Importado com sucesso' : Math.random() > 0.3 ? 'Importado com sucesso' : 'Processo não encontrado no SEI',
      });
      setProgress(Math.round(((i + 1) / nums.length) * 100));
    }

    setResults(res);
    setRunning(false);
  };

  const successes = results?.filter((r) => r.status === 'success').length ?? 0;
  const errors = results?.filter((r) => r.status === 'error').length ?? 0;

  return (
    <div className="p-8 max-w-3xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => navigateTo('processes')} className="hover:underline" style={{ color: '#009C60' }}>
          Processos
        </button>
        <span>/</span>
        <span>Importar Lote</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Importar Processos em Lote
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        Cadastre múltiplos processos simultaneamente colando os números ou enviando um arquivo.
      </p>

      {!results ? (
        <div className="space-y-6">
          {/* Mode selector */}
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setMode('text')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Colar texto
            </button>
            <button
              onClick={() => setMode('file')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Arquivo CSV/Excel
            </button>
          </div>

          {mode === 'text' ? (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Números de Processo
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Cole os números separados por vírgula, ponto e vírgula ou quebra de linha:\n\n26.17.000009307-5\n25.17.000007966-2\n26.17.000010045-1`}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/30 resize-none"
                rows={8}
              />
              <p className="text-xs text-gray-400 mt-2">
                {text.split(/[,;\n]/).filter((n) => n.trim()).length} número(s) detectado(s)
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <label className="block border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-green-400 transition-colors">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {file ? (
                  <p className="text-sm font-medium text-gray-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500">Arraste ou <span style={{ color: '#009C60' }}>clique para selecionar</span></p>
                    <p className="text-xs text-gray-400 mt-1">CSV ou XLSX com coluna "numero_sei"</p>
                  </>
                )}
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-xs font-semibold text-gray-600 mb-2">Formato esperado do CSV:</p>
                <pre className="text-xs text-gray-500 font-mono">numero_sei{'\n'}26.17.000008588-9{'\n'}26.17.000009307-5</pre>
              </div>
            </div>
          )}

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
            disabled={running || (mode === 'text' ? !text.trim() : !file)}
            className="px-6 py-3 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: '#009C60' }}
          >
            {running ? 'Importando…' : 'Iniciar Importação'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
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

          {/* Results table */}
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
              onClick={() => { setResults(null); setText(''); setFile(null); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Nova Importação
            </button>
            {errors > 0 && (
              <button className="px-4 py-2 text-sm font-medium rounded-lg text-white" style={{ background: '#29ABE2' }}>
                Baixar relatório de falhas
              </button>
            )}
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
