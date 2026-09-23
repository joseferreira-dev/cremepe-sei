import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Process } from '../types';
import { listProcesses } from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Spinner from './ui/Spinner';

const statusConfig: Record<string, { label: string; color: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#29ABE2' },
  finalizado: { label: 'Finalizado', color: '#009C60' },
  pendente: { label: 'Pendente', color: '#F59E0B' },
  sobrestado: { label: 'Sobrestado', color: '#6B7280' },
};

const unitColors = ['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function fetchAll(dateFrom: string, dateTo: string): Promise<Process[]> {
  const items: Process[] = [];
  for (let page = 1; ; page++) {
    const res = await listProcesses({
      page,
      limit: 500,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    items.push(...res.processes);
    if (page >= (res.totalPages || 1)) break;
  }
  return items;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    fetchAll(dateFrom, dateTo)
      .then(setProcesses)
      .catch(() => setProcesses([]))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadData();
    const onVisibility = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadData]);

  const total = processes.length;
  const emAndamentoList = processes.filter((p) => p.status === 'em_andamento');
  const comResumo = processes.filter((p) => p.resumoIa).length;

  const unitCount = emAndamentoList.reduce<Record<string, number>>((acc, p) => {
    for (const u of p.unidades) {
      acc[u.sigla] = (acc[u.sigla] || 0) + 1;
    }
    return acc;
  }, {});
  const byUnit = Object.entries(unitCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const recent = [...processes]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5);

  const kpis = [
    { label: 'Total de Processos', value: total, color: '#009C60', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', path: '/processes' },
    { label: 'Em Andamento', value: emAndamentoList.length, color: '#6366F1', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', path: '/processes' },
    { label: 'Finalizados', value: processes.filter((p) => p.status === 'finalizado').length, color: '#8DC63F', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', path: '/processes' },
    { label: 'Com Resumo', value: comResumo, color: '#29ABE2', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', path: '/processes' },
  ];

  const hasPeriod = Boolean(dateFrom || dateTo);

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header + período */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Visão geral dos processos gerenciados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasPeriod && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs font-medium px-3 py-2 rounded-lg text-white transition-colors hover:bg-red-700"
              style={{ background: '#DC2626' }}
            >
              Limpar
            </button>
          )}
          {[
            { label: '30 dias', days: 30 },
            { label: '90 dias', days: 90 },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => setDateFrom(daysAgo(preset.days))}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setDateFrom(new Date().getFullYear() + '-01-01')}
            className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Este ano
          </button>
          <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
            <label className="text-xs text-gray-500">De:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm text-gray-700 focus:outline-none"
            />
            <label className="text-xs text-gray-500">Até:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm text-gray-700 focus:outline-none"
            />
          </div>
          </div>
      </div>

      {loading && processes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Spinner size="w-9 h-9" color="#009C60" />
          <p className="text-sm text-gray-600">Carregando processos…</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <button
                key={kpi.label}
                onClick={() => navigate(kpi.path)}
                className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      {kpi.value}
                    </p>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: kpi.color + '18' }}>
                    <svg className="w-5 h-5" style={{ color: kpi.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={kpi.icon} />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Gráfico de unidade + últimos processos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Unidade</h2>
              <p className="text-xs text-gray-400 mb-4">Top 10 · apenas processos em andamento{hasPeriod ? ' no período' : ''}</p>
              {byUnit.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, byUnit.length * 28)}>
                  <BarChart data={byUnit} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={170} />
                    <Tooltip formatter={(value) => [String(value), 'Processos']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
                    <Bar dataKey="value" radius={4}>
                      {byUnit.map((_, i) => (
                        <Cell key={i} fill={unitColors[i % unitColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum processo em andamento no período.</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Últimos Processos{hasPeriod ? ' (período)' : ' Cadastrados'}</h2>
                <button
                  onClick={() => navigate('/processes')}
                  className="text-xs font-medium hover:underline"
                  style={{ color: '#009C60' }}
                >
                  Ver todos →
                </button>
              </div>
              <div className="space-y-3">
                {recent.map((p) => {
                  const cfg = statusConfig[p.status] || statusConfig.em_andamento;
                  return (
                    <a
                      key={p.id}
                      href={'/process/' + p.id}
                      onClick={(e) => { e.preventDefault(); navigate('/process/' + p.id); }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-white" style={{ background: cfg.color }}>
                        {cfg.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-gray-500">{p.numeroSei}</p>
                        <p className="text-sm font-medium text-gray-800 truncate">{p.especificacao}</p>
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {p.unidades.length > 0 ? p.unidades[0].sigla : '—'}
                      </div>
                    </a>
                  );
                })}
                {recent.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Nenhum processo encontrado no período.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}