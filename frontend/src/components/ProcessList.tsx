import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { listProcesses, deleteProcess, listUnidades, type SeiUnidade } from '../api';
import type { Process, ProcessStatus, User } from '../types';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';

interface Props {
  navigateTo: (page: Page, id?: string) => void;
  onlyWithoutResumo?: boolean;
  user?: User;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_analise: { label: 'Em Análise', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
  sobrestado: { label: 'Sobrestado', color: '#374151', bg: '#F3F4F6' },
};

export default function ProcessList({ navigateTo, onlyWithoutResumo = false, user }: Props) {
  const dialog = useDialog();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Process[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const perPage = 10;

  useEffect(() => {
    listUnidades().then(setUnits).catch(() => setUnits([]));
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
      });
      setData(res.processes);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, unitFilter, onlyWithoutResumo]);

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
            Novo Processo
          </button>
          <button
            onClick={() => navigateTo('import')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importar Lote
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
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
          <option value="em_analise">Em Análise</option>
          <option value="pendente">Pendente</option>
          <option value="finalizado">Finalizado</option>
          <option value="sobrestado">Sobrestado</option>
        </select>
        <select
          value={unitFilter}
          onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
        >
          <option value="all">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.sigla}>{u.sigla}</option>)}
        </select>
        {(search || statusFilter !== 'all' || unitFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setUnitFilter('all'); setPage(1); }}
            className="text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            Limpar filtros
          </button>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer" onClick={() => toggleSort('especificacao')}>
                  Especificação <SortIcon col="especificacao" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Interessados</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumo IA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer whitespace-nowrap" onClick={() => toggleSort('dataAutuacao')}>
                  Autuação <SortIcon col="dataAutuacao" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Carregando processos…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">
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
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-gray-800 truncate text-xs">{p.especificacao}</p>
                      <div className="flex gap-1 mt-1">
                        {p.tags.map((t) => (
                          <span key={t.id} className="inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-medium" style={{ background: t.color }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">
                      <p className="truncate">{p.interessados[0]}</p>
                      {p.interessados.length > 1 && <p className="text-gray-400">+{p.interessados.length - 1}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {p.unidadeAtual.sigla}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ color: cfg.color, background: cfg.bg }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.resumoIa ? (
                        <p className="text-xs text-gray-600 max-w-[160px] truncate">{p.resumoIa}</p>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sem resumo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDataPtBR(p.dataAutuacao)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigateTo('process-details', p.id)}
                          title="Ver detalhes"
                          className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => navigateTo('process-details', p.id)}
                          title="Sincronizar com SEI"
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleDelete(p)}
                            title="Excluir processo"
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Mostrando {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Anterior
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className="px-3 py-1 text-xs border rounded transition-colors"
                  style={n === page ? { background: '#009C60', color: 'white', borderColor: '#009C60' } : {}}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
