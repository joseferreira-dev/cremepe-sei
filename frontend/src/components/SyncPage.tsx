import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { listProcesses, syncBatch, syncProcess, listUnidades, type SeiUnidade } from '../api';
import type { Process } from '../types';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';
import Pagination from './ui/Pagination';

interface Props {
  navigateTo: (page: Page, id?: string) => void;
}

function tempoDesde(dataIso: string | null): string {
  if (!dataIso) return 'Nunca';
  const d = new Date(dataIso);
  if (isNaN(d.getTime())) return 'Nunca';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const meses = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  const dias = Math.floor((diffMs % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
  const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const partes: string[] = [];
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
  if (partes.length === 0) partes.push(`${horas}h`);
  return partes.join(', ');
}

export default function SyncPage({ navigateTo }: Props) {
  const dialog = useDialog();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAndamento, setTotalAndamento] = useState(0);
  const [totalConcluidos, setTotalConcluidos] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const perPage = 20;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('em_andamento');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string>('all');
  const [nivelFilter, setNivelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);

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
        tipo: tipoFilter,
        nivelAcesso: nivelFilter,
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
      setProcesses(res.processes);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setTotalAndamento(resAndamento.total);
      setTotalConcluidos(resConcluidos.total);
    } catch {
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, unitFilter, tipoFilter, nivelFilter, dateFrom, dateTo]);

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
          tipo: tipoFilter,
          nivelAcesso: nivelFilter,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        const sindicaveis = allRes.processes;
        const ids = sindicaveis.map((p) => p.id);
        if (ids.length > 0) {
          const result = await syncBatch(ids);
          const falhas = result.results.filter((r) => r.status === "error");
          erros += falhas.length;
          synced += result.results.length;
          setSyncProgress({ done: synced, total });
        }
        hasMore = sindicaveis.length === 500;
        pageToFetch++;
      }
      if (erros > 0) {
        dialog.success(`Sincronização concluída. ${erros} processo(s) falharam.`);
      } else {
        dialog.success('Todos os processos filtrados foram sincronizados com sucesso.');
      }
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
      await syncProcess(p.id);
      load();
    } catch (e: any) {
      dialog.error(e?.message || `Erro ao sincronizar ${p.numeroSei}.`);
    } finally {
      setSyncingId(null);
    }
  };

  const hasFilters = search || statusFilter !== 'all' || unitFilter !== 'all' || tipoFilter !== 'all' || nivelFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Sincronização
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} processo(s) · {totalAndamento} em andamento · {totalConcluidos} concluído(s)
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
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setUnitFilter('all'); setTipoFilter('all'); setNivelFilter('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

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
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Número SEI</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Especificação</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Última Sincronização</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ação</th>
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
                      <button
                        onClick={() => navigateTo('process-details', p.id)}
                        className="font-mono text-xs font-semibold hover:underline"
                        style={{ color: '#009C60' }}
                      >
                        {p.numeroSei}
                      </button>
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
                        disabled={syncingId === p.id || syncingAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
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

        {/* Paginação */}
        <Pagination page={page} totalPages={totalPages} total={total} perPage={perPage} onPageChange={setPage} />
      </div>
    </div>
  );
}
