import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProcesses, syncBatch, syncProcess, listUnidades, type SeiUnidade } from '../api';
import type { Process, User } from '../types';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';
import Pagination from './ui/Pagination';

function tempoDesde(dataIso: string | null): string {
  if (!dataIso) return 'Nunca';
  const d = new Date(dataIso);
  if (isNaN(d.getTime())) return 'Nunca';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  const dias = Math.floor(diffMin / (60 * 24));
  const horas = Math.floor((diffMin % (60 * 24)) / 60);
  const minutos = diffMin % 60;
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
  if (horas > 0) partes.push(`${horas}h`);
  if (minutos > 0) partes.push(`${minutos}min`);
  return partes.length > 0 ? partes.join(', ') : 'menos de 1 min';
}

function TypeFilterDialog({ open, tipos, selected, onApply, onClose }: {
  open: boolean;
  tipos: string[];
  selected: string[];
  onApply: (selected: string[]) => void;
  onClose: () => void;
}) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selected));
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setLocalSelected(new Set(selected));
      setSearch('');
    }
  }, [open, selected]);

  const filtered = tipos.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  const allChecked = filtered.length > 0 && filtered.every((t) => localSelected.has(t));

  const toggle = (t: string) => {
    const next = new Set(localSelected);
    next.has(t) ? next.delete(t) : next.add(t);
    setLocalSelected(next);
  };

  const toggleAll = () => {
    const next = new Set(localSelected);
    if (allChecked) {
      filtered.forEach((t) => next.delete(t));
    } else {
      filtered.forEach((t) => next.add(t));
    }
    setLocalSelected(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[420px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Filtrar por tipo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar tipo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              autoFocus
            />
          </div>
        </div>
        <label className="flex items-center gap-2 px-4 py-2 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="rounded"
            style={{ accentColor: '#009C60' }}
          />
          {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
        </label>
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">Nenhum tipo encontrado</p>
          )}
          {filtered.map((t) => (
            <label key={t} className="flex items-center gap-2 py-1.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1">
              <input
                type="checkbox"
                checked={localSelected.has(t)}
                onChange={() => toggle(t)}
                className="rounded"
                style={{ accentColor: '#009C60' }}
              />
              <span className="truncate">{t}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => { onApply([]); onClose(); }}
            className="text-xs text-gray-500 hover:text-red-500 px-3 py-1.5"
          >
            Limpar
          </button>
          <button
            onClick={() => { onApply(Array.from(localSelected)); onClose(); }}
            className="text-xs text-white px-4 py-1.5 rounded-lg font-medium"
            style={{ background: '#009C60' }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SyncPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const dialog = useDialog();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAndamento, setTotalAndamento] = useState(0);
  const [totalConcluidos, setTotalConcluidos] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('em_andamento');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string[]>([]);
  const [nivelFilter, setNivelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [semAndamentos, setSemAndamentos] = useState(false);
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);

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
      const filterParams = {
        page,
        limit: perPage,
        search,
        status: statusFilter,
        unit: unitFilter,
        tipo: tipoFilter.length === 1 ? tipoFilter[0] : undefined,
        nivelAcesso: nivelFilter,
        andamentos: semAndamentos ? '0' : 'all',
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const andamentoParams = { ...filterParams, page: 1, limit: 1, status: 'em_andamento' };
      const concluidosParams = { ...filterParams, page: 1, limit: 1, status: 'finalizado' };

      const [res, resAndamento, resConcluidos] = await Promise.all([
        listProcesses(filterParams),
        listProcesses(andamentoParams),
        listProcesses(concluidosParams),
      ]);
      let filtered = res.processes;
      if (tipoFilter.length > 1) {
        filtered = filtered.filter((p) => tipoFilter.includes(p.tipo || ''));
      }
      setProcesses(filtered);
      setTotal(tipoFilter.length > 1 ? filtered.length : res.total);
      setTotalPages(tipoFilter.length > 1 ? Math.ceil(filtered.length / perPage) : res.totalPages);
      setTotalAndamento(resAndamento.total);
      setTotalConcluidos(resConcluidos.total);
    } catch {
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, statusFilter, unitFilter, tipoFilter, nivelFilter, dateFrom, dateTo, semAndamentos]);

  useEffect(() => { load(); }, [load]);

  const handleSyncAll = async () => {
    if (syncingAll) return;
    if (total === 0) {
      dialog.alert('Nenhum processo para sincronizar com os filtros aplicados.');
      return;
    }
    setSyncingAll(true);
    setSyncProgress({ done: 0, total });
    let erros = 0;
    let synced = 0;
    let totalAutoImportados = 0;
    try {
      let pageToFetch = 1;
      let hasMore = true;
      while (hasMore) {
        const allRes = await listProcesses({
          page: pageToFetch,
          limit: 500,
          status: statusFilter,
          search,
          unit: unitFilter,
          tipo: tipoFilter.length === 1 ? tipoFilter[0] : undefined,
          nivelAcesso: nivelFilter,
          andamentos: semAndamentos ? '0' : 'all',
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        const sindicaveis = allRes.processes;
        const ids = sindicaveis.map((p) => p.id);
        const SUB_LOTE = 5;
        for (let i = 0; i < ids.length; i += SUB_LOTE) {
          const subLote = ids.slice(i, i + SUB_LOTE);
          const result = await syncBatch(subLote);
          const falhas = result.results.filter((r) => r.status === "error");
          erros += falhas.length;
          synced += result.results.length;
          totalAutoImportados += result.autoImportados || 0;
          setSyncProgress({ done: synced, total });
        }
        hasMore = sindicaveis.length === 500;
        pageToFetch++;
      }
      let msg = erros > 0
        ? `Sincronização concluída. ${erros} processo(s) falharam.`
        : 'Todos os processos filtrados foram sincronizados com sucesso.';
      if (totalAutoImportados > 0) {
        msg += ` ${totalAutoImportados} processo(s) relacionado(s) importado(s) automaticamente.`;
      }
      dialog.success(msg);
      load();
    } catch (e: any) {
      dialog.error(e?.message || 'Erro durante a sincronização.');
    } finally {
      setSyncingAll(false);
      setSyncProgress(null);
    }
  };

  const handleSyncOne = async (p: Process) => {
    setSyncingId(p.id);
    try {
      const result = await syncProcess(p.id) as any;
      if (result.autoImportados > 0) {
        dialog.success(`${p.numeroSei} sincronizado. ${result.autoImportados} processo(s) relacionado(s) importado(s).`);
      }
      load();
    } catch (e: any) {
      dialog.error(e?.message || `Erro ao sincronizar ${p.numeroSei}.`);
    } finally {
      setSyncingId(null);
    }
  };

  const hasFilters = search || statusFilter !== 'all' || unitFilter !== 'all' || tipoFilter.length > 0 || nivelFilter !== 'all' || semAndamentos || dateFrom || dateTo;

  const clearAll = () => {
    setSearch('');
    setStatusFilter('all');
    setUnitFilter('all');
    setTipoFilter([]);
    setNivelFilter('all');
    setDateFrom('');
    setDateTo('');
    setSemAndamentos(false);
    setPage(1);
  };

  const selectCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30";

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Sincronização
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} processo(s) selecionados(s) · {totalAndamento} em andamento · {totalConcluidos} concluído(s)
          </p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncingAll || total === 0}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          style={{ background: '#009C60' }}
        >
          {syncingAll ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {syncingAll
            ? `Sincronizando ${syncProgress?.done || 0}/${syncProgress?.total || 0}…`
            : `Sincronizar (${total})`}
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
            <select
              value={unitFilter}
              onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}
              className={selectCls + ' min-w-[170px]'}
            >
              <option value="all">Todas as unidades</option>
              {units.map((u) => <option key={u.id} value={u.sigla}>{u.sigla}</option>)}
            </select>
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

      <TypeFilterDialog
        open={typeDialogOpen}
        tipos={tipos}
        selected={tipoFilter}
        onApply={(sel) => { setTipoFilter(sel); setPage(1); }}
        onClose={() => setTypeDialogOpen(false)}
      />

      {/* Barra de progresso */}
      {syncingAll && syncProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm text-blue-700 mb-2">
            <span>Sincronizando processos…</span>
            <span className="font-medium">{syncProgress.done}/{syncProgress.total}</span>
          </div>
          <div className="w-full bg-blue-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                background: '#29ABE2',
                width: `${(syncProgress.done / syncProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-green-800" style={{ background: '#009C60' }}>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Número SEI</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Especificação</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Última Sincronização</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Carregando processos…
                  </td>
                </tr>
              ) : processes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Nenhum processo encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : processes.map((p) => {
                const isConcluido = p.status === 'finalizado';
                return (
                  <tr key={p.id} className={`border-b border-gray-50 ${isConcluido ? 'bg-gray-50/60' : ''}`}>
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
                    <td className="px-4 py-3 max-w-[300px]">
                      <p className="text-gray-800 text-xs truncate">{p.especificacao}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={isConcluido
                          ? { color: '#065F46', background: '#D1FAE5' }
                          : { color: '#1D4ED8', background: '#DBEAFE' }}
                      >
                        {isConcluido ? 'Concluído' : 'Em Andamento'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">
                        {tempoDesde(p.sincronizadoEm)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSyncOne(p)}
                        disabled={syncingId === p.id || syncingAll || Boolean(p.acessoRestrito) || (isConcluido && user.role !== 'admin')}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        title={
                          p.acessoRestrito
                            ? 'Você não tem acesso a este processo restrito'
                            : isConcluido && user.role !== 'admin'
                            ? 'Somente administradores podem sincronizar processos finalizados'
                            : ''
                        }
                      >
                        {syncingId === p.id ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                        {syncingId === p.id ? 'Sincronizando…' : 'Sincronizar'}
                      </button>
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
