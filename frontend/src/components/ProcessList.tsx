import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProcesses, deleteProcess, listUnidades, listTags, syncBatch, updateProcess, type SeiUnidade } from '../api';
import type { Process, ProcessStatus, User, Tag } from '../types';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';
import Pagination from './ui/Pagination';

interface Props {
  onlyWithoutResumo?: boolean;
  user?: User;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
  sobrestado: { label: 'Sobrestado', color: '#374151', bg: '#F3F4F6' },
};

export default function ProcessList({ onlyWithoutResumo = false, user }: Props) {
  const navigate = useNavigate();
  const dialog = useDialog();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string>('all');
  const [nivelFilter, setNivelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [semAndamentos, setSemAndamentos] = useState(false);
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagToApply, setTagToApply] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const perPage = 10;

  useEffect(() => {
    listUnidades().then(setUnits).catch(() => setUnits([]));
    listTags().then(setTags).catch(() => setTags([]));
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
        andamentos: semAndamentos ? '0' : 'all',
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
  }, [page, search, statusFilter, unitFilter, onlyWithoutResumo, semAndamentos, tipoFilter, nivelFilter, dateFrom, dateTo]);

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
    const proc = data.find((p) => p.id === id);
    if (proc?.acessoRestrito) return;
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const selectable = sorted.filter((p) => !p.acessoRestrito);

  const toggleSelectAll = () => {
    if (selectedIds.size === selectable.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectable.map((p) => p.id)));
  };

  const handleSyncSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      const res = await syncBatch(ids);
      let ok = 0, semAlteracao = 0, erros = 0;
      res.results.forEach((r) => {
        if (r.status === 'error') erros++;
        else if (r.status === 'skipped') semAlteracao++;
        else ok++;
      });
      let msg = `Sincronizados: ${ok}${semAlteracao ? ` · sem alterações: ${semAlteracao}` : ''}${erros ? ` · erros: ${erros}` : ''}.`;
      if (res.autoImportados > 0) msg += ` ${res.autoImportados} processo(s) relacionado(s) importado(s).`;
      dialog.success(msg);
      load();
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao sincronizar selecionados.');
    } finally {
      setBatchBusy(false);
    }
  };

  const handleApplyTag = async () => {
    if (!tagToApply) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      const alvos = ids.filter((id) => {
        const proc = data.find((p) => p.id === id);
        return proc && !proc.acessoRestrito && !proc.tags.find((t) => t.id === tagToApply);
      });
      const resultados = await Promise.allSettled(alvos.map((id) => {
        const proc = data.find((p) => p.id === id) as Process;
        return updateProcess(id, { tagIds: [...proc.tags.map((t) => t.id), tagToApply] });
      }));
      const applied = resultados.filter((r) => r.status === 'fulfilled').length;
      dialog.success(`Tag aplicada em ${applied} processo(s).`);
      load();
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao aplicar tag.');
    } finally {
      setBatchBusy(false);
      setTagToApply('');
    }
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
            onClick={() => navigate('/new-process')}
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
        {/* Line 1: Search, Units, Types */}
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
            value={unitFilter}
            onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
          >
            <option value="all">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.sigla}>{u.sigla}</option>)}
          </select>
          <select
            value={tipoFilter}
            onChange={(e) => { setTipoFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 bg-white"
          >
            <option value="all">Todos os tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Line 2: Status, Level, Dates, Clear */}
        <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-gray-100">
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
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={semAndamentos}
              onChange={(e) => { setSemAndamentos(e.target.checked); setPage(1); }}
              className="rounded"
              style={{ accentColor: '#009C60' }}
            />
            Sem andamentos
          </label>
          {(search || statusFilter !== 'all' || unitFilter !== 'all' || tipoFilter !== 'all' || nivelFilter !== 'all' || semAndamentos || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setUnitFilter('all'); setTipoFilter('all'); setNivelFilter('all'); setDateFrom(''); setDateTo(''); setSemAndamentos(false); setPage(1); }}
              className="text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Batch actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-blue-700 font-medium">{selectedIds.size} processo(s) selecionado(s)</span>
          <button
            onClick={handleSyncSelected}
            disabled={batchBusy}
            className="text-xs px-3 py-1 rounded-md text-white font-medium disabled:opacity-50"
            style={{ background: '#29ABE2' }}
          >
            {batchBusy ? 'Processando…' : 'Sincronizar selecionados'}
          </button>
          <div className="flex items-center gap-1.5">
            <select
              value={tagToApply}
              onChange={(e) => setTagToApply(e.target.value)}
              disabled={batchBusy}
              className="text-xs px-2 py-1 rounded-md border border-blue-200 bg-white text-blue-700 focus:outline-none"
            >
              <option value="">Selecionar tag…</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={handleApplyTag}
              disabled={batchBusy || !tagToApply}
              className="text-xs px-3 py-1 rounded-md bg-white border border-blue-200 text-blue-700 font-medium disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
          <button onClick={() => { setSelectedIds(new Set()); setTagToApply(''); }} className="ml-auto text-blue-400 hover:text-blue-600 text-xs">Deselecionar</button>
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
                    checked={selectedIds.size === selectable.length && selectable.length > 0}
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
                        disabled={Boolean(p.acessoRestrito)}
                        className="rounded"
                        style={{ accentColor: '#009C60' }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={'/process/' + p.id}
                        onClick={(e) => { e.preventDefault(); navigate('/process/' + p.id); }}
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
