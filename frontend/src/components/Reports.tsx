import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Process } from '../types';
import { listProcesses } from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STATUS_LABELS: Record<string, string> = {
  em_andamento: 'Em Andamento',
  finalizado: 'Finalizado',
  pendente: 'Pendente',
  sobrestado: 'Sobrestado',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  em_andamento: '#29ABE2',
  finalizado: '#009C60',
  pendente: '#F59E0B',
  sobrestado: '#6B7280',
};

const NIVEL_COLORS: Record<string, string> = {
  'Público': '#009C60',
  'Restrito': '#F59E0B',
  'Não informado': '#9CA3AF',
};

const unitColors = ['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function fetchAll(filters: Parameters<typeof listProcesses>[0] = {}): Promise<Process[]> {
  const items: Process[] = [];
  for (let page = 1; ; page++) {
    const res = await listProcesses({ ...filters, page, limit: 500 });
    items.push(...res.processes);
    if (page >= (res.totalPages || 1)) break;
  }
  return items;
}

export default function Reports() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    fetchAll({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
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
  const withResume = processes.filter((p) => p.resumoIa).length;
  const hasPeriod = Boolean(dateFrom || dateTo);

  /* Por status (todos) */
  const byStatus = Object.entries(
    processes.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([key, value]) => ({
    name: STATUS_LABELS[key] ?? key,
    value,
    key,
    color: STATUS_DOT_COLORS[key] ?? '#6B7280',
  }));

  /* Por unidade (somente em andamento, Top 10) */
  const unitCount = emAndamentoList.reduce<Record<string, number>>((acc, p) => {
    if (p.unidades.length > 0) {
      for (const u of p.unidades) {
        acc[u.sigla] = (acc[u.sigla] || 0) + 1;
      }
    }
    return acc;
  }, {});
  const byUnit = Object.entries(unitCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  /* Por nível de acesso */
  const byAcesso = Object.entries(
    processes.reduce<Record<string, number>>((acc, p) => {
      const nivel = p.nivelAcesso || 'Não informado';
      acc[nivel] = (acc[nivel] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const maxAcesso = Math.max(1, ...byAcesso.map((a) => a.value));

  const kpis = [
    { label: 'Total', value: total, color: '#009C60', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Em Andamento', value: emAndamentoList.length, color: '#6366F1', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Finalizados', value: processes.filter((p) => p.status === 'finalizado').length, color: '#8DC63F', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Com Resumo', value: withResume, color: '#29ABE2', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
    { label: 'Sem Resumo', value: total - withResume, color: '#F59E0B', icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  ];

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header + período */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Relatórios</h1>
          <p className="text-gray-500 text-sm mt-1">Análise consolidada dos processos gerenciados</p>
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
        <p className="text-sm text-gray-400 text-center py-16">Carregando…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {kpis.map((k) => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-medium tracking-wide">{k.label}</p>
                    <p className="text-3xl font-bold mt-1" style={{ color: k.color, fontFamily: "'Outfit', sans-serif" }}>{k.value}</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: k.color + '18' }}>
                    <svg className="w-5 h-5" style={{ color: k.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={k.icon} />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Unidade + Nível de acesso */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Por unidade (somente em andamento) */}
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

            {/* Nível de acesso */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Distribuição por Nível de Acesso</h2>
              <p className="text-xs text-gray-400 mb-5">{hasPeriod ? 'No período' : 'Em todos os processos'}</p>
              {byAcesso.length > 0 ? (
                <div className="space-y-4">
                  {byAcesso.map((n) => (
                    <div key={n.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{n.name}</span>
                        <span className="text-sm font-bold text-gray-900">{n.value}</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full"
                          style={{ width: `${(n.value / maxAcesso) * 100}%`, background: NIVEL_COLORS[n.name] ?? '#009C60' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum processo no período.</p>
              )}
            </div>
          </div>

          {/* Resumo por status */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Resumo por Status</h2>
              <button
                onClick={() => navigate('/processes')}
                className="text-xs font-medium hover:underline"
                style={{ color: '#009C60' }}
              >
                Ver processos →
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">%</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Com Resumo</th>
                </tr>
              </thead>
              <tbody>
                {byStatus.map((s) => {
                  const count = s.value;
                  const resumeCount = processes.filter((p) => p.status === s.key && p.resumoIa).length;
                  return (
                    <tr key={s.key} className="border-b border-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                          <span className="text-sm text-gray-800">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{count}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {total > 0 ? ((count / total) * 100).toFixed(0) : 0}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
                            <div
                              className="h-1.5 rounded-full"
                              style={{ background: s.color, width: `${count > 0 ? (resumeCount / count) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{resumeCount}/{count}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {byStatus.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-sm text-gray-400 text-center">Nenhum processo no período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}