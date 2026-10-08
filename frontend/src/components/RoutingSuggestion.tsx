import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sugerirEncaminhamento, type ResultadoSugestao, type SugestaoUnidade } from '../api';
import { formatDataPtBR } from '../utils/date';

const ACCEPT = '.pdf,.doc,.docx,.odt,.txt,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp';

function pct(peso: number): string {
  return `${Math.round((peso || 0) * 100)}%`;
}

export default function RoutingSuggestion() {
  const navigate = useNavigate();
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoSugestao | null>(null);

  const podeEnviar = descricao.trim().length > 0 || files.length > 0;

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const novos = Array.from(e.target.files || []);
    if (novos.length > 0) setFiles((prev) => [...prev, ...novos].slice(0, 20));
    e.target.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const analisar = async () => {
    if (!podeEnviar || loading) return;
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const r = await sugerirEncaminhamento(descricao.trim(), tipo.trim(), files);
      setResultado(r);
    } catch (err: any) {
      setError(err?.message || 'Erro ao analisar a demanda.');
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => {
    setDescricao('');
    setTipo('');
    setFiles([]);
    setResultado(null);
    setError('');
  };

  const metaTexto = (r: ResultadoSugestao): string => {
    if (r.estrategia === 'vizinhos') {
      return `${r.vizinhos} processo(s) semelhante(s) analisado(s) entre ${r.totalBase} da base histórica`;
    }
    if (r.estrategia === 'tipo') {
      return `Nenhum vizinho textual — agrupando ${r.vizinhos} processo(s) com o mesmo tipo do SEI`;
    }
    if (r.estrategia === 'regra' && r.motivoRegra === 'conteudo') {
      const destino = (r.sugestoes[0]?.sigla || '').replace(/^CREMEPE\//, '');
      return `Regra de domínio: o conteúdo do texto indica ${destino}` +
        (r.vizinhos > 0 ? ` — cruzada com ${r.vizinhos} caso(s) semelhante(s)` : '');
    }
    if (r.estrategia === 'regra') {
      return `Regra de domínio: devolução/reembolso de valores → SECON (verifica e autoriza o pagamento)` +
        (r.vizinhos > 0 ? ` — cruzada com ${r.vizinhos} caso(s) semelhante(s)` : '');
    }
    return `Nenhum caso semelhante encontrado na base (${r.totalBase} processos)`;
  };

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Sugestão de Encaminhamento
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Descreva a nova demanda (texto e/ou arquivos) e descubra para qual unidade encaminhá-la,
          com base nos andamentos de processos semelhantes.
        </p>
      </div>

      {/* Formulário */}
      <section className="bg-white rounded-xl overflow-hidden shadow-lg border-t-[3px] border-t-[#009C60]">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Descrição da demanda
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={6}
                placeholder="Ex.: Pedido de habilitação de pessoa jurídica — empresa de contabilidade solicita inscrição, anexando contrato social e certidões…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/30 resize-y"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Tipo do processo (opcional)
              </label>
              <input
                type="text"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                placeholder="Ex.: Habilitação de pessoa jurídica"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                Usado como alternativa quando não há processos semelhantes.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 hover:border-green-500 hover:text-green-700 cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Adicionar arquivos
                <input type="file" multiple accept={ACCEPT} onChange={onFiles} className="hidden" />
              </label>
              <span className="text-xs text-gray-400">
                PDF, DOCX, ODT, planilhas, texto e imagens — até 20 arquivos
              </span>
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {files.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full pl-3 pr-1.5 py-1 text-xs"
                  >
                    <span className="max-w-[220px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="w-4 h-4 rounded-full bg-gray-300 hover:bg-red-400 hover:text-white text-[10px] leading-none flex items-center justify-center"
                      aria-label={`Remover ${f.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={analisar}
              disabled={!podeEnviar || loading}
              className="inline-flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#009C60' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Analisando…
                </>
              ) : (
                'Analisar e sugerir unidade'
              )}
            </button>
            {(descricao || tipo || files.length > 0) && (
              <button
                type="button"
                onClick={limpar}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Limpar
              </button>
            )}
            {loading && (
              <span className="text-xs text-gray-400">
                Extraindo texto dos arquivos e comparando com a base histórica…
              </span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <section className="bg-white rounded-xl overflow-hidden shadow-lg border-t-[3px] border-t-[#009C60]">
          <div className="px-5 pt-5 pb-3 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Resultado
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{metaTexto(resultado)}</p>
          </div>

          {resultado.sugestoes.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-gray-600 text-sm font-medium">
                Não encontrei processos semelhantes para esta demanda.
              </p>
              <p className="text-gray-400 text-xs mt-1.5">
                Detalhe mais a descrição (assunto, interessado, pedido) ou informe o <b>Tipo do processo</b> —
                o tipo é usado como alternativa quando não há correspondência textual.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {resultado.sugestoes.map((s, i) => (
                <SugestaoRow
                  key={s.sigla}
                  s={s}
                  principal={i === 0 && resultado.estrategia !== 'nenhuma'}
                  onAbrirProcesso={(id) => navigate(`/processo/${id}`)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function SugestaoRow({
  s,
  principal,
  onAbrirProcesso,
}: {
  s: SugestaoUnidade;
  principal: boolean;
  onAbrirProcesso: (id: string) => void;
}) {
  return (
    <li className={`px-5 py-4 ${principal ? 'bg-green-50/60' : ''}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-gray-900">{s.sigla.replace(/^CREMEPE\//, '')}</span>
            {principal && (
              <span
                className="text-[10px] font-bold uppercase tracking-wide text-white px-2 py-0.5 rounded-full"
                style={{ background: '#009C60' }}
              >
                Principal sugestão
              </span>
            )}
            <span className="text-xs text-gray-500">
              {s.casos} caso(s) semelhante(s)
            </span>
          </div>
          {s.descricao && (
            <p className="text-xs text-gray-500 mt-0.5">{s.descricao}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-lg font-bold" style={{ color: '#009C60' }}>
            {pct(s.peso)}
          </span>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">dos casos</p>
        </div>
      </div>

      <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: pct(s.peso), background: principal ? '#009C60' : '#8DC63F' }}
        />
      </div>

      {s.exemplos.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Processos semelhantes</p>
          {s.exemplos.map((ex) => (
            <div key={ex.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <a
                href={`/processo/${ex.id}`}
                onClick={(e) => { e.preventDefault(); onAbrirProcesso(ex.id); }}
                className="font-mono font-semibold hover:underline"
                style={{ color: '#009C60' }}
              >
                {ex.numeroSei}
              </a>
              {ex.tipo && <span className="text-gray-500 truncate max-w-[280px]">{ex.tipo}</span>}
              <span className="text-gray-400">{ex.dataAutuacao ? formatDataPtBR(ex.dataAutuacao) : ''}</span>
              {ex.trilha.length > 0 && (
                <span className="inline-flex items-center gap-1 text-gray-400">
                  {ex.trilha.map((u, ui) => (
                    <span key={`${ex.id}-${ui}`} className="inline-flex items-center gap-1">
                      {ui > 0 && <span>→</span>}
                      <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono text-[10px]">{u}</span>
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
