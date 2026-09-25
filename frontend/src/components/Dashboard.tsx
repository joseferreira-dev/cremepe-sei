import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Process } from '../types';
import { listProcesses, listStalledProcesses } from '../api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  Text,
} from 'recharts';
import Spinner from './ui/Spinner';

const statusConfig: Record<string, { label: string; color: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#29ABE2' },
  finalizado: { label: 'Finalizado', color: '#009C60' },
};

const unitColors = ['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'];

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function dayKey(value: string): string | null {
  if (!value) return null;
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
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
  const [defaultFrom] = useState(() => daysAgo(31));
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState('');
  const [stalledCount, setStalledCount] = useState<number | null>(null);

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

  useEffect(() => {
    listStalledProcesses()
      .then((items) => setStalledCount(items.length))
      .catch(() => setStalledCount(null));
  }, []);

  const total = processes.length;
  const emAndamento = processes.filter((p) => p.status === 'em_andamento').length;
  const finalizados = processes.filter((p) => p.status === 'finalizado').length;
  const comResumo = processes.filter((p) => p.resumoIa).length;
  const semResumo = total - comResumo;

  const byUnit = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of processes.filter((proc) => proc.status === 'em_andamento')) {
      if (p.unidades.length > 0) {
        for (const u of p.unidades) counts[u.sigla] = (counts[u.sigla] || 0) + 1;
      } else if (p.unidadeAtual?.sigla) {
        counts[p.unidadeAtual.sigla] = (counts[p.unidadeAtual.sigla] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.replace(/\s+/g, ' ').trim(), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [processes]);

  const byTipo = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of processes) {
      const t = p.tipo || 'Não informado';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [processes]);

  const tipoTickWidth = useMemo(
    () => Math.ceil((Math.max(1, ...byTipo.map((t) => t.name.length)) * 6 + 12) / 2),
    [byTipo]
  );

  const byDay = useMemo(() => {
    const autuacoes = new Map<string, number>();
    const finais = new Map<string, number>();
    const allKeys = new Set<string>();
    for (const p of processes) {
      const ka = dayKey(p.dataAutuacao || '');
      if (ka) {
        autuacoes.set(ka, (autuacoes.get(ka) || 0) + 1);
        allKeys.add(ka);
      }
      if (p.status === 'finalizado') {
        const kf = dayKey(p.ultimoAndamento?.dataHora || '');
        if (kf) {
          finais.set(kf, (finais.get(kf) || 0) + 1);
          allKeys.add(kf);
        }
      }
    }
    if (allKeys.size === 0) {
      return {
        points: [] as { key: string; autuacoes: number; finalizados: number }[],
        spanDays: 0,
        dayTicks: [] as string[],
        monthTicks: [] as string[],
      };
    }

    const sorted = Array.from(allKeys).sort();
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const points: { key: string; autuacoes: number; finalizados: number }[] = [];
    const spanDays = Math.round((new Date(`${max}T00:00:00`).getTime() - new Date(`${min}T00:00:00`).getTime()) / 86400000);
    const keys = spanDays <= 1000 ? (() => {
      const arr: string[] = [];
      for (let k = min; k <= max; k = addDaysKey(k, 1)) arr.push(k);
      return arr;
    })() : sorted;

    for (const k of keys) {
      const a = autuacoes.get(k) || 0;
      const f = finais.get(k) || 0;
      if (a === 0 && f === 0) continue;
      points.push({ key: k, autuacoes: a, finalizados: f });
    }

    // Marca de meses: primeiro ponto de cada mês
    const monthTicks: string[] = [];
    const seenMonths = new Set<string>();
    for (const p of points) {
      const month = p.key.slice(0, 7);
      if (!seenMonths.has(month)) {
        seenMonths.add(month);
        monthTicks.push(p.key);
      }
    }

    // Marca de dias (janela de no máximo 31 dias): ~8 rótulos + último ponto
    const dayTicks: string[] = [];
    if (spanDays <= 31 && points.length > 0) {
      const step = Math.max(1, Math.ceil(points.length / 8));
      points.forEach((p, i) => {
        if (i % step === 0) dayTicks.push(p.key);
      });
      const last = points[points.length - 1].key;
      if (!dayTicks.includes(last)) dayTicks.push(last);
    }

    return { points, spanDays, dayTicks, monthTicks };
  }, [processes]);

  // Eixo X da evolução: dias se a janela do gráfico for de no máximo 1 mês (31 dias), senão meses
  const evoDayAxis = byDay.spanDays <= 31;
  const evoTickFormat = (k: string): string => {
    if (evoDayAxis) return `${k.slice(8, 10)}/${k.slice(5, 7)}`;
    const month = k.slice(5, 7);
    const isFirst = k === byDay.monthTicks[0];
    return `${MONTH_NAMES[parseInt(month, 10) - 1]}${isFirst || month === '01' ? '/' + k.slice(2, 4) : ''}`;
  };

  const recent = useMemo(
    () => [...processes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5),
    [processes]
  );

  const kpis = [
    { label: 'Total de Processos', value: total, color: '#009C60', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', path: '/processos' },
    { label: 'Em Andamento', value: emAndamento, color: '#6366F1', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', path: '/processos' },
    { label: 'Finalizados', value: finalizados, color: '#8DC63F', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', path: '/processos' },
    { label: 'Com Resumo', value: comResumo, color: '#29ABE2', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', path: '/processos' },
    { label: 'Sem Resumo', value: semResumo, color: '#F59E0B', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', path: '/processos/sem-resumo' },
    { label: 'Processos Parados', value: stalledCount, color: '#6B7280', icon: 'M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z', path: '/parados' },
  ];

  const hasPeriod = dateFrom !== defaultFrom || Boolean(dateTo);
  const cardCls = 'bg-white rounded-xl border border-gray-100 p-6';

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
              onClick={() => { setDateFrom(defaultFrom); setDateTo(''); }}
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpis.map((kpi) => (
              <button
                key={kpi.label}
                onClick={() => navigate(kpi.path)}
                className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-500 text-[11px] font-medium uppercase tracking-wide">{kpi.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      {kpi.value ?? '—'}
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

          {/* Evolução + Últimos processos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Evolução de Autuações e Finalizados</h2>
              <p className="text-xs text-gray-400 mb-4">Autuações (azul) e finalizados por dia — último andamento na data (verde)</p>
              {byDay.points.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={byDay.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="key"
                      ticks={evoDayAxis ? byDay.dayTicks : byDay.monthTicks}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={evoTickFormat}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      labelFormatter={(k) => {
                        const [y, m, d] = String(k).split('-');
                        return `${d}/${m}/${y}`;
                      }}
                      formatter={(value, name) => [String(value), String(name)]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="autuacoes" name="Autuações" stroke="#29ABE2" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="finalizados" name="Finalizados" stroke="#009C60" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">Sem dados de autuação no período.</p>
              )}
            </div>

            <div className={cardCls}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Últimos Processos{hasPeriod ? ' (período)' : ' Cadastrados'}
                  </h2>
                  <p className="text-xs text-gray-400">Mais recentes primeiro</p>
                </div>
                <button
                  onClick={() => navigate('/processos')}
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
                      href={'/processo/' + p.id}
                      onClick={(e) => { e.preventDefault(); navigate('/processo/' + p.id); }}
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

          {/* Top Unidades + Top Tipos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Processos por Unidade</h2>
              <p className="text-xs text-gray-400 mb-4">Top 10 · apenas processos em andamento{hasPeriod ? ' no período' : ''}</p>
              {byUnit.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, byUnit.length * 30)}>
                  <BarChart data={byUnit} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width="auto" interval={0} />
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

            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>Top Tipos de Processo</h2>
              <p className="text-xs text-gray-400 mb-4">10 tipos mais frequentes no período</p>
              {byTipo.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, byTipo.length * 30)}>
                  <BarChart data={byTipo} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      width={tipoTickWidth}
                      interval={0}
                      tick={(props: any) => (
                        <Text
                          {...props}
                          x={0}
                          textAnchor="start"
                          maxLines={2}
                          style={{ fontSize: '10px', fontFamily: "'Inter', sans-serif" }}
                        >
                          {String(props.payload?.value ?? '')}
                        </Text>
                      )}
                    />
                    <Tooltip formatter={(value) => [String(value), 'Processos']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
                    <Bar dataKey="value" radius={4} fill="#29ABE2" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum tipo no período.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
