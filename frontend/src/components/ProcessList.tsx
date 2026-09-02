import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { listProcesses, deleteProcess, listUnidades, type SeiUnidade } from '../api';
import type { Process, ProcessStatus, User } from '../types';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';
import Pagination from './ui/Pagination';

interface Props {
  navigateTo: (page: Page, id?: string) => void;
  onlyWithoutResumo?: boolean;
  user?: User;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
  sobrestado: { label: 'Sobrestado', color: '#374151', bg: '#F3F4F6' },
};

export default function ProcessList({ navigateTo, onlyWithoutResumo = false, user }: Props) {
  const dialog = useDialog();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string>('all');
  const [nivelFilter, setNivelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Process[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const perPage = 10;

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
        unit: unitFilter,
        resumo: onlyWithoutResumo ? '0' : 'all',
        tipo: tipoFilter,
        nivelAcesso: nivelFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setData(res.processes);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, unitFilter, onlyWithoutResumo, tipoFilter, nivelFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = [...data].sort((a, b) => {
    const av = (a as Record<string, any>)[sortKey] ?? '';
    const bv = (b as Record<string, any>)[sortKey] ?? '';
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map((p) => p.id)));
  };

  const handleDelete = async (p: Process) => {
    const ok = await dialog.confirm(`Excluir o processo ${p.numeroSei}? Esta ação não pode ser desfeita.`, { title: 'Excluir processo' });
    if (!ok) return;
    try {
      await deleteProcess(p.id);
      load();
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao excluir processo.');
    }
  };

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
        <div className="flex gap-2">
          <button
            onClick={() => navigateTo('new-process')}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style={{ background: '#009C60' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Cadastrar Processo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
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
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
          >
            <option value="all">Todos os status</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="finalizado">Finalizado</option>
          </select>
          <select
            value={unitFilter}
            onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
          >
            <option value="all">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.sigla}>{u.sigla}</option>)}
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {showFilters ? 'Ocultar filtros' : 'Mais filtros'}
          </button>
          {(search || statusFilter !== 'all' || unitFilter !== 'all' || tipoFilter !== 'all' || nivelFilter !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setUnitFilter('all'); setTipoFilter('all'); setNivelFilter('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-gray-100">
            <select
              value={tipoFilter}
              onChange={(e) => { setTipoFilter(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
            >
              <option value="all">Todos os tipos</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={nivelFilter}
              onChange={(e) => { setNivelFilter(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
            >
              <option value="all">Todos os níveis</option>
              <option value="Público">Público</option>
              <option value="Restrito">Restrito</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">De:</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Até:</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>
          </div>
        )}
      </div>

      {/* Batch actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-blue-700 font-medium">{selectedIds.size} processo(s) selecionado(s)</span>
          <button className="text-xs px-3 py-1 rounded-md text-white font-medium" style={{ background: '#29ABE2' }}>
            Sincronizar selecionados
          </button>
          <button className="text-xs px-3 py-1 rounded-md bg-white border border-blue-200 text-blue-700 font-medium">
            Aplicar tag
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-blue-400 hover:text-blue-600 text-xs">Deselecionar</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                    style={{ accentColor: '#009C60' }}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer whitespace-nowrap" onClick={() => toggleSort('numeroSei')}>
                  Número SEI <SortIcon col="numeroSei" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer min-w-[260px]" onClick={() => toggleSort('especificacao')}>
                  Especificação <SortIcon col="especificacao" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidades</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[200px]">Resumo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer whitespace-nowrap" onClick={() => toggleSort('dataAutuacao')}>
                  Autuação <SortIcon col="dataAutuacao" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Carregando processos…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Nenhum processo encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : sorted.map((p) => {
                const cfg = statusConfig[p.status];
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded"
                        style={{ accentColor: '#009C60' }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigateTo('process-details', p.id)}
                        className="font-mono text-xs font-semibold hover:underline"
                        style={{ color: '#009C60' }}
                      >
                        {p.numeroSei}
                      </button>
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
                    <td className="px-4 py-3 max-w-[240px]">
                      {p.resumoIa ? (
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{p.resumoIa}</p>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sem resumo</span>
                      )}
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

        {/* Pagination */}
        <Pagination page={page} totalPages={totalPages} total={total} perPage={perPage} onPageChange={setPage} />
      </div>
    </div>
  );
}
