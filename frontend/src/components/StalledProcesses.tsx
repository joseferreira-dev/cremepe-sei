import { useState, useEffect, Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { listStalledProcesses, listUnidades, type StalledProcess, type SeiUnidade } from '../api';
import { formatDataPtBR } from '../utils/date';
import MultiSelectDialog from './ui/MultiSelectDialog';
import Pagination from './ui/Pagination';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-600 font-medium mb-2">Erro ao renderizar a página.</p>
          <p className="text-sm text-gray-500">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const diasOpcoes = [
  { label: 'Todos', value: 0 },
  { label: '5+ dias', value: 5 },
  { label: '10+ dias', value: 10 },
  { label: '15+ dias', value: 15 },
  { label: '20+ dias', value: 20 },
  { label: '25+ dias', value: 25 },
  { label: '30+ dias', value: 30 },
];

function getDiasColor(dias: number): { color: string; bg: string } {
  if (dias >= 30) return { color: '#991B1B', bg: '#FEE2E2' };
  if (dias >= 20) return { color: '#92400E', bg: '#FEF3C7' };
  if (dias >= 10) return { color: '#9A3412', bg: '#FFEDD5' };
  return { color: '#374151', bg: '#F3F4F6' };
}

function StalledProcessesInner() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<StalledProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filtroDias, setFiltroDias] = useState(0);
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [nivelFilter, setNivelFilter] = useState('all');
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => {
    let cancelled = false;
    listStalledProcesses()
      .then((data) => { if (!cancelled) setProcesses(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) { setProcesses([]); setLoadError(e?.message || 'Erro ao carregar processos.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    listUnidades().then((u) => { if (!cancelled) setUnits(Array.isArray(u) ? u : []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const safeStr = (v: unknown): string => (typeof v === 'string' ? v : '');

  const filtered = processes.filter((p) => {
    if (!p) return false;
    if (filtroDias !== 0 && (p.diasParado ?? 0) < filtroDias) return false;
    if (unitFilter.length > 0) {
      const unitsArr = Array.isArray(p.unidades) ? p.unidades : [];
      const current = p.unidadeAtual && typeof p.unidadeAtual === 'object' ? p.unidadeAtual : null;
      const siglas = [...unitsArr.map((u: any) => u?.sigla), current?.sigla].filter(Boolean);
      if (!siglas.some((s: string) => unitFilter.includes(s))) return false;
    }
    if (nivelFilter !== 'all' && p.nivelAcesso !== nivelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const num = safeStr(p.numeroSei).toLowerCase();
      const esp = safeStr(p.especificacao).toLowerCase();
      if (!num.includes(q) && !esp.includes(q)) return false;
    }
    return true;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const hasFilters = search || filtroDias !== 0 || unitFilter.length > 0 || nivelFilter !== 'all';

  const clearAll = () => {
    setSearch('');
    setFiltroDias(0);
    setUnitFilter([]);
    setNivelFilter('all');
    setPage(1);
  };

  const selectCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30";

  if (safePage !== page) setPage(safePage);

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Processos Parados
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {loading ? 'Carregando…' : `${totalFiltered} processo(s) na visualização atual`}
        </p>
      </div>

      {/* Filters */}
      <section className="bg-white rounded-xl overflow-hidden shadow-lg border-t-[3px] border-t-[#009C60]">
        <div className="p-5">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por número ou especificação…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            <button
              onClick={() => setUnitDialogOpen(true)}
              className={`flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm transition-colors min-w-[170px] justify-between ${unitFilter.length > 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <span className="truncate">
                {unitFilter.length === 0
                  ? 'Todas as unidades'
                  : unitFilter.length === 1
                    ? unitFilter[0]
                    : `${unitFilter.length} unidades`}
              </span>
              <svg className="w-3.5 h-3.5 shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </button>
            <select
              value={nivelFilter}
              onChange={(e) => { setNivelFilter(e.target.value); setPage(1); }}
              className={selectCls}
            >
              <option value="all">Todos os níveis</option>
              <option value="Público">Público</option>
              <option value="Restrito">Restrito</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-center mt-3 pt-3 border-t border-gray-100">
            {diasOpcoes.map((d) => (
              <button
                key={d.value}
                onClick={() => { setFiltroDias(d.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filtroDias === d.value
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {d.label}
              </button>
            ))}
            {hasFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ml-auto"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </section>

      <MultiSelectDialog
        open={unitDialogOpen}
        title="Filtrar por unidade"
        options={units.map((u) => u.sigla)}
        selected={unitFilter}
        searchPlaceholder="Buscar unidade…"
        emptyLabel="Nenhuma unidade encontrada"
        onApply={(sel) => { setUnitFilter(sel); setPage(1); }}
        onClose={() => setUnitDialogOpen(false)}
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-800" style={{ background: '#009C60' }}>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Número SEI</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide min-w-[250px]">Especificação</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Unidades</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Dias Parado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Última Atividade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Autuação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Carregando processos…
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-red-500 text-sm">
                    {loadError}
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Nenhum processo parado encontrado.
                  </td>
                </tr>
              ) : paginated.map((p) => {
                const dc = getDiasColor(p.diasParado ?? 0);
                const allUnits = Array.isArray(p.unidades) ? p.unidades : [];
                const unitAtual = p.unidadeAtual && typeof p.unidadeAtual === 'object' ? p.unidadeAtual : null;
                const displayUnits = (allUnits.length > 0 ? allUnits : unitAtual ? [unitAtual] : []).slice(0, 2);
                const tags = Array.isArray(p.tags) ? p.tags : [];
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={'/processo/' + p.id}
                        onClick={(e) => { e.preventDefault(); navigate('/processo/' + p.id); }}
                        className="font-mono text-xs font-semibold hover:underline"
                        style={{ color: '#009C60' }}
                      >
                        {safeStr(p.numeroSei)}
                      </a>
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <p className="text-gray-800 text-xs leading-relaxed line-clamp-2">{safeStr(p.especificacao)}</p>
                      <div className="flex gap-1 mt-1">
                        {tags.map((t: any) => (
                          <span key={t.id} className="inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-medium" style={{ background: t.color || '#6B7280' }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {displayUnits.map((u: any, i: number) => (
                          <span key={i} className="text-xs font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded inline-block w-fit">
                            {u?.sigla || '—'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ color: dc.color, background: dc.bg }}
                      >
                        {p.diasParado ?? 0} {(p.diasParado ?? 0) === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {p.ultimaAtividade ? formatDataPtBR(p.ultimaAtividade, true) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDataPtBR(p.dataAutuacao)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && totalFiltered > 0 && (
          <Pagination page={safePage} totalPages={totalPages} total={totalFiltered} perPage={perPage} onPageChange={setPage} onPerPageChange={(v) => { setPerPage(v); setPage(1); }} />
        )}
      </div>
    </div>
  );
}

export default function StalledProcesses() {
  return (
    <ErrorBoundary>
      <StalledProcessesInner />
    </ErrorBoundary>
  );
}
