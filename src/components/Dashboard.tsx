import type { Page } from '../App';
import { mockProcesses } from '../data/mock';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  navigateTo: (page: Page, id?: string) => void;
}

const statusConfig = {
  em_analise: { label: 'Em Análise', color: '#29ABE2' },
  finalizado: { label: 'Finalizado', color: '#009C60' },
  pendente: { label: 'Pendente', color: '#F59E0B' },
  sobrestado: { label: 'Sobrestado', color: '#6B7280' },
};

export default function Dashboard({ navigateTo }: Props) {
  const total = mockProcesses.length;
  const semResumo = mockProcesses.filter((p) => !p.resumoIa).length;
  const pendentes = mockProcesses.filter((p) => p.status === 'pendente').length;
  const finalizados = mockProcesses.filter((p) => p.status === 'finalizado').length;

  // Processes by unit
  const byUnit = Object.entries(
    mockProcesses.reduce<Record<string, number>>((acc, p) => {
      const sigla = p.unidadeAtual.sigla;
      acc[sigla] = (acc[sigla] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const recent = [...mockProcesses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  const kpis = [
    { label: 'Total de Processos', value: total, color: '#009C60', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', page: 'processes' as Page },
    { label: 'Sem Resumo IA', value: semResumo, color: '#F59E0B', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', page: 'processes' as Page },
    { label: 'Pendentes', value: pendentes, color: '#EF4444', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', page: 'processes' as Page },
    { label: 'Finalizados', value: finalizados, color: '#8DC63F', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', page: 'processes' as Page },
  ];

  return (
    <div className="p-8 space-y-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral dos processos gerenciados</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => navigateTo(kpi.page)}
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

      {/* Charts + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Unidade</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byUnit} layout="vertical" margin={{ left: 0, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                cursor={{ fill: '#f3f4f6' }}
              />
              <Bar dataKey="value" radius={4}>
                {byUnit.map((_, i) => (
                  <Cell key={i} fill={['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'][i % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent processes */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Últimos Processos Cadastrados</h2>
            <button
              onClick={() => navigateTo('processes')}
              className="text-xs font-medium hover:underline"
              style={{ color: '#009C60' }}
            >
              Ver todos →
            </button>
          </div>
          <div className="space-y-3">
            {recent.map((p) => {
              const cfg = statusConfig[p.status];
              return (
                <button
                  key={p.id}
                  onClick={() => navigateTo('process-details', p.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div
                    className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-white"
                    style={{ background: cfg.color }}
                  >
                    {cfg.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-500">{p.numeroSei}</p>
                    <p className="text-sm font-medium text-gray-800 truncate">{p.especificacao}</p>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">{p.unidadeAtual.sigla}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Novo Processo', desc: 'Cadastrar manualmente', page: 'new-process' as Page, color: '#009C60', icon: 'M12 4v16m8-8H4' },
          { label: 'Importar Lote', desc: 'Via arquivo CSV ou texto', page: 'import' as Page, color: '#29ABE2', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
          { label: 'Relatórios', desc: 'Exportar e visualizar', page: 'reports' as Page, color: '#8DC63F', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => navigateTo(action.page)}
            className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow text-left"
          >
            <div className="rounded-xl p-3" style={{ background: action.color + '18' }}>
              <svg className="w-6 h-6" style={{ color: action.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{action.label}</p>
              <p className="text-xs text-gray-500">{action.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
