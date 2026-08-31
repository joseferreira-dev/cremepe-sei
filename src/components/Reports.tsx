import { mockProcesses } from '../data/mock';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  em_analise: '#29ABE2',
  finalizado: '#009C60',
  pendente: '#F59E0B',
  sobrestado: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  em_analise: 'Em Análise',
  finalizado: 'Finalizado',
  pendente: 'Pendente',
  sobrestado: 'Sobrestado',
};

export default function Reports() {
  const byStatus = Object.entries(
    mockProcesses.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: STATUS_LABELS[name] ?? name, value, key: name }));

  const byUnit = Object.entries(
    mockProcesses.reduce<Record<string, number>>((acc, p) => {
      acc[p.unidadeAtual.sigla] = (acc[p.unidadeAtual.sigla] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const byType = Object.entries(
    mockProcesses.reduce<Record<string, number>>((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const withResume = mockProcesses.filter((p) => p.resumoIa).length;

  return (
    <div className="p-8 space-y-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Relatórios</h1>
          <p className="text-gray-500 text-sm mt-1">Análise consolidada dos processos gerenciados</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Processos', value: mockProcesses.length, color: '#009C60' },
          { label: 'Com Resumo IA', value: withResume, color: '#29ABE2' },
          { label: 'Em Análise', value: mockProcesses.filter((p) => p.status === 'em_analise').length, color: '#6366F1' },
          { label: 'Finalizados', value: mockProcesses.filter((p) => p.status === 'finalizado').length, color: '#8DC63F' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs text-gray-400 uppercase font-medium tracking-wide">{k.label}</p>
            <p className="text-4xl font-bold mt-2" style={{ color: k.color, fontFamily: "'Outfit', sans-serif" }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By status pie */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-5" style={{ fontFamily: "'Outfit', sans-serif" }}>Distribuição por Status</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={byStatus}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={11}
              >
                {byStatus.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.key] ?? '#6B7280'} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* By unit bar */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-5" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Unidade</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byUnit} layout="vertical" margin={{ left: 0, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
              <Bar dataKey="value" fill="#009C60" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By type */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-5" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Tipo</h2>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={byType} margin={{ left: 0, right: 16 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
            <Bar dataKey="value" fill="#29ABE2" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Resumo por Status</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Quantidade</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">%</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Com Resumo IA</th>
            </tr>
          </thead>
          <tbody>
            {byStatus.map((s) => {
              const count = s.value;
              const resumeCount = mockProcesses.filter((p) => STATUS_LABELS[p.status] === s.name && p.resumoIa).length;
              return (
                <tr key={s.name} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[s.key] }} />
                      <span className="text-sm text-gray-800">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {((count / mockProcesses.length) * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ background: STATUS_COLORS[s.key], width: `${count > 0 ? (resumeCount / count) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{resumeCount}/{count}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
