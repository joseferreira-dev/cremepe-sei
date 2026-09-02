import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { listProcesses, syncProcess } from '../api';
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, resAndamento, resConcluidos] = await Promise.all([
        listProcesses({ page, limit: perPage }),
        listProcesses({ page: 1, limit: 1, status: 'em_andamento' }),
        listProcesses({ page: 1, limit: 1, status: 'finalizado' }),
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
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleSyncAll = async () => {
    if (syncingAll) return;
    if (totalAndamento === 0) {
      dialog.alert('Nenhum processo para sincronizar.');
      return;
    }
    setSyncingAll(true);
    setSyncProgress({ done: 0, total: totalAndamento });
    let erros = 0;
    let synced = 0;
    try {
      let pageToFetch = 1;
      let hasMore = true;
      while (hasMore) {
        const allRes = await listProcesses({ page: pageToFetch, limit: 500, status: 'em_andamento' });
        const sindicaveis = allRes.processes;
        for (let i = 0; i < sindicaveis.length; i++) {
          synced++;
          setSyncProgress({ done: synced, total: totalAndamento });
          try {
            await syncProcess(sindicaveis[i].id);
          } catch {
            erros++;
          }
        }
        hasMore = sindicaveis.length === 500;
        pageToFetch++;
      }
      if (erros > 0) {
        dialog.success(`Sincronização concluída. ${erros} processo(s) falharam.`);
      } else {
        dialog.success('Todos os processos foram sincronizados com sucesso.');
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
          disabled={syncingAll || totalAndamento === 0}
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
            : `Sincronizar em Andamento (${totalAndamento})`}
        </button>
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
                    Nenhum processo cadastrado.
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
