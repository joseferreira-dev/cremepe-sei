import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProcesses, listUnidades, type SeiUnidade } from '../api';
import type { Process, ProcessStatus } from '../types';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';
import MultiSelectDialog from './ui/MultiSelectDialog';
import Pagination from './ui/Pagination';

interface Props {
  onlyWithoutResumo?: boolean;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
};

export default function ProcessList({ onlyWithoutResumo = false }: Props) {
  const navigate = useNavigate();
  const dialog = useDialog();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = useState<string[]>([]);
  const [nivelFilter, setNivelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [semAndamentos, setSemAndamentos] = useState(false);
  const [semDocumentos, setSemDocumentos] = useState(false);
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [data, setData] = useState<Process[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);

  useEffect(() => {
    listUnidades().then(setUnits).catch(() => setUnits([]));
    listProcesses({ limit: 500 }).then((res) => {
      const unique = [...new Set(res.processes.map((p) => p.tipo).filter(Boolean))].sort();
      setTipos(unique);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProcesses({
        page,
        limit: perPage,
        search,
        status: statusFilter,
        unit: unitFilter.length > 0 ? unitFilter.join(',') : 'all',
        resumo: onlyWithoutResumo ? '0' : 'all',
        andamentos: semAndamentos ? '0' : 'all',
        documentos: semDocumentos ? '0' : 'all',
        tipo: tipoFilter.length === 1 ? tipoFilter[0] : undefined,
        nivelAcesso: nivelFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      let filtered = res.processes;
      if (tipoFilter.length > 1) {
        filtered = filtered.filter((p) => tipoFilter.includes(p.tipo || ''));
      }
      setData(filtered);
      setTotal(tipoFilter.length > 1 ? filtered.length : res.total);
      setTotalPages(tipoFilter.length > 1 ? Math.ceil(filtered.length / perPage) : res.totalPages || 1);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, statusFilter, unitFilter, onlyWithoutResumo, semAndamentos, semDocumentos, tipoFilter, nivelFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...data].sort((a, b) => {
    const av = (a as Record<string, any>)[sortKey] ?? '';
    const bv = (b as Record<string, any>)[sortKey] ?? '';
    if (sortKey === 'dataAutuacao') {
      const parseDate = (v: string) => {
        if (!v) return 0;
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime() : 0;
      };
      const diff = parseDate(String(av)) - parseDate(String(bv));
      return sortDir === 'asc' ? diff : -diff;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const hasFilters = search || statusFilter !== 'all' || unitFilter.length > 0 || tipoFilter.length > 0 || nivelFilter !== 'all' || semAndamentos || semDocumentos || dateFrom || dateTo;

  const clearAll = () => {
    setSearch('');
    setStatusFilter('all');
    setUnitFilter([]);
    setTipoFilter([]);
    setNivelFilter('all');
    setDateFrom('');
    setDateTo('');
    setSemAndamentos(false);
    setSemDocumentos(false);
    setPage(1);
  };

  const selectCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30";

  const SortIcon = ({ col }: { col: string }) => (
    <svg className="w-3 h-3 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={
        sortKey === col
          ? sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'
          : 'M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4'
      } />
    </svg>
  );

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {onlyWithoutResumo ? 'Processos sem Resumo' : 'Processos'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{total} processo(s) encontrado(s)</p>
        </div>
        <button
          onClick={() => navigate('/novo-processo')}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style={{ background: '#009C60' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Cadastrar Processo
        </button>
      </div>

      {/* Filters */}
      <section className="bg-white rounded-xl overflow-hidden shadow-lg border-t-[3px] border-t-[#009C60]">
        <div className="p-5">
          {/* Row 1: Search + Unit */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por número, especificação ou interessado…"
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
          </div>

          {/* Row 2: Status, Level, Type, Dates */}
          <div className="flex flex-wrap gap-3 items-center mt-3 pt-3 border-t border-gray-100">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className={selectCls}
            >
              <option value="all">Todos os status</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="finalizado">Finalizado</option>
            </select>
            <select
              value={nivelFilter}
              onChange={(e) => { setNivelFilter(e.target.value); setPage(1); }}
              className={selectCls}
            >
              <option value="all">Todos os níveis</option>
              <option value="Público">Público</option>
              <option value="Restrito">Restrito</option>
            </select>
            <button
              onClick={() => setTypeDialogOpen(true)}
              className={`flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm transition-colors ${tipoFilter.length > 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Tipo{tipoFilter.length > 0 ? ` (${tipoFilter.length})` : ''}
            </button>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className={selectCls}
              title="Data de início"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className={selectCls}
              title="Data final"
            />
            <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white cursor-pointer select-none hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={semAndamentos}
                onChange={(e) => { setSemAndamentos(e.target.checked); setPage(1); }}
                className="rounded"
                style={{ accentColor: '#009C60' }}
              />
              Sem andamentos
            </label>
            <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white cursor-pointer select-none hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={semDocumentos}
                onChange={(e) => { setSemDocumentos(e.target.checked); setPage(1); }}
                className="rounded"
                style={{ accentColor: '#009C60' }}
              />
              Sem documentos
            </label>
            {hasFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
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
        open={typeDialogOpen}
        title="Filtrar por tipo"
        options={tipos}
        selected={tipoFilter}
        searchPlaceholder="Buscar tipo…"
        emptyLabel="Nenhum tipo encontrado"
        onApply={(sel) => { setTipoFilter(sel); setPage(1); }}
        onClose={() => setTypeDialogOpen(false)}
      />
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide cursor-pointer whitespace-nowrap" onClick={() => toggleSort('numeroSei')}>
                  Número SEI <SortIcon col="numeroSei" />
                </th>
                <th className={`px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide cursor-pointer ${onlyWithoutResumo ? 'min-w-[400px]' : 'min-w-[200px]'}`} onClick={() => toggleSort('especificacao')}>
                  Especificação <SortIcon col="especificacao" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Unidades</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Status</th>
                {!onlyWithoutResumo && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide min-w-[300px]">Resumo</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide cursor-pointer whitespace-nowrap" onClick={() => toggleSort('dataAutuacao')}>
                  Autuação <SortIcon col="dataAutuacao" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={onlyWithoutResumo ? 5 : 6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Carregando processos…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={onlyWithoutResumo ? 5 : 6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Nenhum processo encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : sorted.map((p) => {
                const cfg = statusConfig[p.status];
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={'/processo/' + p.id}
                        onClick={(e) => { e.preventDefault(); navigate('/processo/' + p.id); }}
                        className="font-mono text-xs font-semibold hover:underline"
                        style={{ color: '#009C60' }}
                      >
                        {p.numeroSei}
                      </a>
                    </td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <p className="text-gray-800 text-xs leading-relaxed line-clamp-2">{p.especificacao}</p>
                      <div className="flex gap-1 mt-1">
                        {p.tags.map((t) => (
                          <span key={t.id} className="inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-medium" style={{ background: t.color }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {(() => {
                          const allUnits = (p.unidades.length > 0 ? p.unidades : [p.unidadeAtual]).filter(Boolean);
                          const visible = allUnits.slice(0, 3);
                          const remaining = allUnits.length - 3;
                          return (
                            <>
                              {visible.map((u, i) => (
                                <span key={i} className="text-xs font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded inline-block w-fit">
                                  {u.sigla}
                                </span>
                              ))}
                              {remaining > 0 && (
                                <span className="text-[10px] text-gray-400 font-medium">+{remaining}</span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ color: cfg.color, background: cfg.bg }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    {!onlyWithoutResumo && (
                      <td className="px-4 py-3 max-w-[350px]">
                        {p.resumoIa ? (
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{p.resumoIa}</p>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Sem resumo</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDataPtBR(p.dataAutuacao)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} perPage={perPage} onPageChange={setPage} onPerPageChange={(v) => { setPerPage(v); setPage(1); }} />
      </div>
    </div>
  );
}
