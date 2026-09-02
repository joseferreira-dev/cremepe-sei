import { useEffect, useState, useCallback } from 'react';
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

export default function Reports() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [emAndamentoProcesses, setEmAndamentoProcesses] = useState<Process[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(() => {
    Promise.all([
      listProcesses({ limit: 500 }),
      listProcesses({ limit: 500, status: 'em_andamento' }),
    ]).then(([all, emAndamento]) => {
      setProcesses(all.processes);
      setEmAndamentoProcesses(emAndamento.processes);
      setTotalCount(all.total);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
    const onVisibility = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadData]);

  // Por status (todos)
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

  // Por unidade (somente em andamento, sem "Sem unidade")
  const unitCount = emAndamentoProcesses.reduce<Record<string, number>>((acc, p) => {
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
    .slice(0, 12);

  // Por tipo (somente em andamento)
  const typeCount = emAndamentoProcesses.reduce<Record<string, number>>((acc, p) => {
    const tipo = p.tipo || 'Sem tipo';
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});
  const byType = Object.entries(typeCount)
    .map(([name, value]) => ({ name: name.length > 40 ? name.substring(0, 37) + '…' : name, value }))
    .sort((a, b) => b.value - a.value);

  // Por nível de acesso
  const byAcesso = processes.reduce<Record<string, number>>((acc, p) => {
    const nivel = p.nivelAcesso || 'Não informado';
    acc[nivel] = (acc[nivel] || 0) + 1;
    return acc;
  }, {});

  const withResume = processes.filter((p) => p.resumoIa).length;
  const total = totalCount || processes.length;

  return (
    <div className="p-8 space-y-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Análise consolidada dos processos gerenciados</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: total, color: '#009C60' },
          { label: 'Em Andamento', value: processes.filter((p) => p.status === 'em_andamento').length, color: '#29ABE2' },
          { label: 'Finalizados', value: processes.filter((p) => p.status === 'finalizado').length, color: '#8DC63F' },
          { label: 'Com Resumo', value: withResume, color: '#6366F1' },
          { label: 'Sem Resumo', value: total - withResume, color: '#F59E0B' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 uppercase font-medium tracking-wide">{k.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: k.color, fontFamily: "'Outfit', sans-serif" }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tipo + Unidade lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por tipo (somente em andamento) */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Tipo</h2>
          <p className="text-xs text-gray-400 mb-5">Apenas processos em andamento</p>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, byType.length * 28)}>
              <BarChart data={byType} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={220} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="value" radius={4}>
                  {byType.map((_, i) => (
                    <Cell key={i} fill={['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum processo em andamento.</p>
          )}
        </div>

        {/* Por unidade (somente em andamento) */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Unidade</h2>
          <p className="text-xs text-gray-400 mb-5">Apenas processos em andamento</p>
          {byUnit.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, byUnit.length * 28)}>
              <BarChart data={byUnit} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="value" radius={4}>
                  {byUnit.map((_, i) => (
                    <Cell key={i} fill={['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'][i % 5]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum processo em andamento.</p>
          )}
        </div>
      </div>

      {/* Tabela resumo */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Resumo por Status</h2>
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
          </tbody>
        </table>
      </div>

      {/* Nível de acesso */}
      {Object.keys(byAcesso).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>Distribuição por Nível de Acesso</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byAcesso).map(([nivel, count]) => (
              <div key={nivel} className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-2.5">
                <span className="text-sm text-gray-700">{nivel}</span>
                <span className="text-sm font-bold" style={{ color: '#009C60' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
