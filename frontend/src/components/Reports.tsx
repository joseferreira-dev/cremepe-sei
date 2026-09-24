import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Process, ProcessStatus } from '../types';
import { listProcesses, listUnidades, type SeiUnidade } from '../api';
import { formatDataPtBR } from '../utils/date';
import Spinner from './ui/Spinner';
import MultiSelectDialog from './ui/MultiSelectDialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Row as ExcelRow, Font as ExcelFont, FillPattern as ExcelFillPattern } from 'exceljs';
import {
  PieChart, Pie, Cell, Legend, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

const STATUS_LABELS: Record<ProcessStatus, string> = {
  em_andamento: 'Em Andamento',
  finalizado: 'Finalizado',
  pendente: 'Pendente',
  sobrestado: 'Sobrestado',
};

const STATUS_COLORS: Record<string, string> = {
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

const UNIT_COLORS = ['#009C60', '#29ABE2', '#8DC63F', '#F59E0B', '#6366F1'];
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  status: string;
  unit: string[];
  nivelAcesso: string;
  resumo: string;
  tipos: string[];
}

const emptyFilters: ReportFilters = {
  dateFrom: '',
  dateTo: '',
  status: 'all',
  unit: [],
  nivelAcesso: 'all',
  resumo: 'all',
  tipos: [],
};

const EXPORT_FIELDS = [
  { key: 'numeroSei', label: 'Número SEI' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'especificacao', label: 'Especificação' },
  { key: 'dataAutuacao', label: 'Data Autuação' },
  { key: 'status', label: 'Status' },
  { key: 'unidadeAtual', label: 'Unidade Atual' },
  { key: 'unidades', label: 'Unidades' },
  { key: 'nivelAcesso', label: 'Nível de Acesso' },
  { key: 'comResumo', label: 'Com Resumo' },
  { key: 'resumoIa', label: 'Resumo IA' },
  { key: 'tags', label: 'Tags' },
] as const;

type ExportFieldKey = (typeof EXPORT_FIELDS)[number]['key'];

const ALL_EXPORT_FIELDS: ExportFieldKey[] = EXPORT_FIELDS.map((f) => f.key);

function exportValue(p: Process, key: ExportFieldKey): string {
  switch (key) {
    case 'numeroSei': return p.numeroSei;
    case 'tipo': return p.tipo || '';
    case 'especificacao': return p.especificacao || '';
    case 'dataAutuacao': return formatDataPtBR(p.dataAutuacao);
    case 'status': return STATUS_LABELS[p.status] ?? p.status;
    case 'unidadeAtual': return p.unidadeAtual?.sigla || '';
    case 'unidades': return p.unidades.map((u) => u.sigla).join(' | ');
    case 'nivelAcesso': return p.nivelAcesso || 'Não informado';
    case 'comResumo': return p.resumoIa ? 'Sim' : 'Não';
    case 'resumoIa': return (p.resumoIa || '').replace(/\s+/g, ' ').trim();
    case 'tags': return p.tags.map((t) => t.name).join(' | ');
    default: return '';
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function fetchAll(filters: ReportFilters): Promise<Process[]> {
  const items: Process[] = [];
  for (let page = 1; ; page++) {
    const res = await listProcesses({
      page,
      limit: 500,
      status: filters.status,
      unit: filters.unit.length > 0 ? filters.unit.join(',') : 'all',
      nivelAcesso: filters.nivelAcesso,
      resumo: filters.resumo,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    });
    items.push(...res.processes);
    if (page >= (res.totalPages || 1)) break;
  }
  if (filters.tipos.length > 0) {
    return items.filter((p) => filters.tipos.includes(p.tipo || ''));
  }
  return items;
}

function monthKey(dataAutuacao: string): string | null {
  const m = dataAutuacao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}`;
}

function dayKey(dataAutuacao: string): string | null {
  const m = dataAutuacao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(';')
    )
    .join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(0)}%` : '0%';
}

const selectCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30';

export default function Reports() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ReportFilters>(emptyFilters);
  const [applied, setApplied] = useState<ReportFilters>(emptyFilters);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [units, setUnits] = useState<SeiUnidade[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [resumoDialogOpen, setResumoDialogOpen] = useState(false);
  const [exportFields, setExportFields] = useState<ExportFieldKey[]>(ALL_EXPORT_FIELDS);
  const [exporting, setExporting] = useState(false);
  const [unitScope, setUnitScope] = useState<'all' | 'em_andamento'>('em_andamento');
  const [listPage, setListPage] = useState(1);
  const [listPerPage, setListPerPage] = useState(10);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  useEffect(() => {
    listUnidades().then(setUnits).catch(() => setUnits([]));
  }, []);

  const generate = useCallback(async (filters: ReportFilters) => {
    setLoading(true);
    setApplied(filters);
    setListPage(1);
    try {
      const items = await fetchAll(filters);
      setProcesses(items);
      setGeneratedAt(new Date().toLocaleString('pt-BR'));
      setTipos((prev) => {
        const set = new Set(prev);
        for (const p of items) if (p.tipo) set.add(p.tipo);
        return Array.from(set).sort();
      });
    } catch {
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generate(emptyFilters);
  }, [generate]);

  const total = processes.length;
  const emAndamento = processes.filter((p) => p.status === 'em_andamento').length;
  const finalizados = processes.filter((p) => p.status === 'finalizado').length;
  const comResumo = processes.filter((p) => p.resumoIa).length;
  const semResumo = total - comResumo;

  const byStatus = useMemo(() => {
    const counts = processes.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([key, value]) => ({
        name: STATUS_LABELS[key as ProcessStatus] ?? key,
        value,
        key,
        color: STATUS_COLORS[key] ?? '#6B7280',
      }))
      .sort((a, b) => b.value - a.value);
  }, [processes]);

  const byMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of processes) {
      const k = monthKey(p.dataAutuacao || '');
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        const [y, m] = key.split('-');
        return { key, name: `${MONTH_NAMES[parseInt(m, 10) - 1]}/${y.slice(2)}`, value };
      });
  }, [processes]);

  const byDay = useMemo(() => {
    const counts = new Map<string, number>();
    let min = '';
    let max = '';
    for (const p of processes) {
      const k = dayKey(p.dataAutuacao || '');
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
      if (!min || k < min) min = k;
      if (!max || k > max) max = k;
    }
    if (!min || !max) return { points: [] as { key: string; value: number; monthTick: string }[], monthTicks: [] as string[] };

    const points: { key: string; value: number; monthTick: string }[] = [];
    const monthTicks: string[] = [];
    const seenMonths = new Set<string>();
    const spanDays = Math.round((new Date(`${max}T00:00:00`).getTime() - new Date(`${min}T00:00:00`).getTime()) / 86400000);
    const fill = spanDays <= 1000;

    if (fill) {
      for (let k = min; k <= max; k = addDaysKey(k, 1)) {
        const month = k.slice(0, 7);
        const isFirstOfMonth = k.endsWith('-01') || !seenMonths.has(month);
        if (!seenMonths.has(month)) {
          seenMonths.add(month);
          monthTicks.push(k);
        }
        points.push({
          key: k,
          value: counts.get(k) || 0,
          monthTick: isFirstOfMonth ? `${MONTH_NAMES[parseInt(month.slice(5, 7), 10) - 1]}` : '',
        });
      }
    } else {
      const sortedKeys = Array.from(counts.keys()).sort();
      for (const k of sortedKeys) {
        const month = k.slice(0, 7);
        const isFirst = !seenMonths.has(month);
        if (isFirst) {
          seenMonths.add(month);
          monthTicks.push(k);
        }
        points.push({
          key: k,
          value: counts.get(k) || 0,
          monthTick: isFirst ? `${MONTH_NAMES[parseInt(month.slice(5, 7), 10) - 1]}` : '',
        });
      }
    }

    const tickSet = new Set(monthTicks);
    return {
      points: points.map((pt) => ({
        ...pt,
        monthTick: tickSet.has(pt.key)
          ? `${MONTH_NAMES[parseInt(pt.key.slice(5, 7), 10) - 1]}${pt.key.slice(5, 7) === '01' || pt.key === monthTicks[0] ? '/' + pt.key.slice(2, 4) : ''}`
          : '',
      })),
      monthTicks,
    };
  }, [processes]);

  const byUnit = useMemo(() => {
    const source =
      unitScope === 'em_andamento'
        ? processes.filter((p) => p.status === 'em_andamento')
        : processes;
    const counts: Record<string, number> = {};
    for (const p of source) {
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
  }, [processes, unitScope]);

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

  const byNivel = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of processes) {
      const n = p.nivelAcesso || 'Não informado';
      counts[n] = (counts[n] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [processes]);

  const maxNivel = Math.max(1, ...byNivel.map((n) => n.value));

  const statusRows = byStatus.map((s) => {
    const resumeCount = processes.filter((p) => p.status === s.key && p.resumoIa).length;
    return { ...s, resumeCount };
  });

  const sortedList = useMemo(
    () => [...processes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [processes]
  );
  const listTotalPages = Math.max(1, Math.ceil(sortedList.length / listPerPage));
  const safeListPage = Math.min(listPage, listTotalPages);
  const pageItems = sortedList.slice((safeListPage - 1) * listPerPage, safeListPage * listPerPage);

  const hasDraftFilters =
    draft.dateFrom !== '' ||
    draft.dateTo !== '' ||
    draft.status !== 'all' ||
    draft.unit.length > 0 ||
    draft.nivelAcesso !== 'all' ||
    draft.resumo !== 'all' ||
    draft.tipos.length > 0;

  const setDraftField = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const clearDraft = () => setDraft(emptyFilters);

  const applyPreset = (days?: number, yearStart?: boolean) => {
    if (yearStart) {
      setDraft((d) => ({ ...d, dateFrom: `${new Date().getFullYear()}-01-01`, dateTo: '' }));
    } else if (days) {
      setDraft((d) => ({ ...d, dateFrom: daysAgo(days), dateTo: '' }));
    }
  };

  const exportProcessosCsv = () => {
    if (exportFields.length === 0) return;
    const header = exportFields.map((k) => EXPORT_FIELDS.find((f) => f.key === k)!.label);
    const rows = processes.map((p) => exportFields.map((k) => exportValue(p, k)));
    downloadCsv(`relatorio-processos-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const exportProcessosPdf = async () => {
    if (exportFields.length === 0 || processes.length === 0) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Processos — CREMEPE SEI', 14, 15);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90);
      doc.text(`Gerado em ${generatedAt} · ${processes.length} processo(s)`, 14, 22);
      const filtros = [
        applied.dateFrom || applied.dateTo
          ? `Período: ${applied.dateFrom || '…'} a ${applied.dateTo || '…'}`
          : null,
        applied.status !== 'all' ? `Status: ${STATUS_LABELS[applied.status as ProcessStatus] ?? applied.status}` : null,
        applied.unit.length > 0 ? `Unidades: ${applied.unit.join(', ')}` : null,
        applied.nivelAcesso !== 'all' ? `Nível: ${applied.nivelAcesso}` : null,
        applied.resumo !== 'all' ? `Resumo: ${applied.resumo === '1' ? 'com' : 'sem'}` : null,
        applied.tipos.length > 0 ? `Tipos: ${applied.tipos.join(', ')}` : null,
      ].filter(Boolean) as string[];
      if (filtros.length > 0) doc.text(filtros.join(' · '), 14, 27);

      const head = [exportFields.map((k) => EXPORT_FIELDS.find((f) => f.key === k)!.label)];
      const body = processes.map((p) => exportFields.map((k) => exportValue(p, k)));
      autoTable(doc, {
        head,
        body,
        startY: 32,
        margin: { top: 30, left: 10, right: 10, bottom: 14 },
        styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: [0, 156, 96], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 248, 246] },
        didDrawPage: () => {
          const pages = doc.getNumberOfPages();
          doc.setFontSize(9);
          doc.setTextColor(140);
          doc.text(
            `Página ${pages} · CREMEPE SEI`,
            pageW - 14,
            pageH - 7,
            { align: 'right' }
          );
        },
      });
      doc.save(`relatorio-listagem-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const filterLines = (): string[] =>
    [
      applied.dateFrom || applied.dateTo
        ? `Período: ${applied.dateFrom || '…'} a ${applied.dateTo || '…'}`
        : null,
      applied.status !== 'all' ? `Status: ${STATUS_LABELS[applied.status as ProcessStatus] ?? applied.status}` : null,
      applied.unit.length > 0 ? `Unidades: ${applied.unit.join(', ')}` : null,
      applied.nivelAcesso !== 'all' ? `Nível: ${applied.nivelAcesso}` : null,
      applied.resumo !== 'all' ? `Resumo: ${applied.resumo === '1' ? 'com' : 'sem'}` : null,
      applied.tipos.length > 0 ? `Tipos: ${applied.tipos.join(', ')}` : null,
    ].filter(Boolean) as string[];

  const exportResumoPdf = async () => {
    if (total === 0) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      const green: [number, number, number] = [0, 156, 96];

      const addFooter = () => {
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
          doc.setPage(i);
          doc.setFontSize(9);
          doc.setTextColor(140);
          doc.text(`Página ${i}/${pages} · CREMEPE SEI`, pageW - margin, pageH - 7, { align: 'right' });
        }
      };

      const sectionTitle = (title: string, sub: string, y: number): number => {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30);
        doc.text(title, margin, y);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(sub, margin, y + 5);
        return y + 9;
      };

      const table = (
        head: string[][],
        body: (string | number)[][],
        startY: number
      ): number => {
        autoTable(doc, {
          head,
          body,
          startY,
          margin: { top: 30, left: margin, right: margin, bottom: 14 },
          styles: { fontSize: 9.5, cellPadding: 2.2 },
          headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 248, 246] },
        });
        return ((doc as any).lastAutoTable?.finalY ?? startY) + 8;
      };

      // Cabeçalho
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20);
      doc.text('Relatório Resumo — CREMEPE SEI', margin, 15);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90);
      doc.text(`Gerado em ${generatedAt} · ${total} processo(s)`, margin, 22);
      const linhas = filterLines();
      if (linhas.length > 0) doc.text(linhas.join(' · '), margin, 27);

      let y = linhas.length > 0 ? 34 : 28;

      // Indicadores
      y = sectionTitle('Indicadores', 'Visão geral do recorte atual', y);
      y = table(
        [['Indicador', 'Valor', '% do total']],
        [
          ['Total', total, '100%'],
          ['Em Andamento', emAndamento, pct(emAndamento, total)],
          ['Finalizados', finalizados, pct(finalizados, total)],
          ['Com Resumo', comResumo, pct(comResumo, total)],
          ['Sem Resumo', semResumo, pct(semResumo, total)],
        ],
        y
      );

      // Status
      y = sectionTitle('Distribuição por Status', 'Quantidade, proporção e cobertura de resumo IA', y);
      y = table(
        [['Status', 'Qtd', '%', 'Com resumo', 'Sem resumo']],
        statusRows.map((s) => [s.name, s.value, pct(s.value, total), s.resumeCount, s.value - s.resumeCount]),
        y
      );

      // Unidades
      if (byUnit.length > 0) {
        y = sectionTitle('Processos por Unidade', `Top ${byUnit.length} · ${unitScope === 'em_andamento' ? 'em andamento' : 'todos os status'}`, y);
        y = table(
          [['Unidade', 'Quantidade']],
          byUnit.map((u) => [u.name, u.value]),
          y
        );
      }

      // Tipos
      if (byTipo.length > 0) {
        y = sectionTitle('Top Tipos de Processo', '10 tipos mais frequentes no recorte', y);
        y = table(
          [['Tipo', 'Quantidade']],
          byTipo.map((t) => [t.name, t.value]),
          y
        );
      }

      // Nível de acesso
      y = sectionTitle('Nível de Acesso', 'Distribuição no recorte atual', y);
      y = table(
        [['Nível', 'Quantidade', '%']],
        byNivel.map((n) => [n.name, n.value, pct(n.value, total)]),
        y
      );

      // Evolução mensal
      if (byMonth.length > 0) {
        y = sectionTitle('Evolução de Autuações', 'Processos autuados por mês', y);
        table(
          [['Mês', 'Autuações']],
          byMonth.map((m) => [m.name, m.value]),
          y
        );
      }

      addFooter();
      doc.save(`relatorio-resumo-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const exportResumoPlanilha = async () => {
    if (total === 0) return;
    setExporting(true);
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Resumo');

      // 5 colunas — todas as tabelas compartilham a mesma largura
      // (alinhadas com "Distribuição por Status", a mais larga)
      const COLS = 5;
      ws.columns = [
        { width: 36 }, // rótulo (Status/Indicador/Unidade/Tipo/Nível/Mês)
        { width: 14 }, // Qtd/Valor/Quantidade
        { width: 14 }, // % / % do total
        { width: 16 }, // Com resumo
        { width: 16 }, // Sem resumo
      ];
      ws.views = [{ showGridLines: false }];

      const GREEN = 'FF009C60';
      const LIGHT = 'FFE8F6F0';
      const DARK = 'FF065F46';
      const ALT = ['FFFFFFFF', 'FFF5F8F6'];
      const LINE = 'FFD7E5DE';
      const thin = { style: 'thin' as const, color: { argb: LINE } };
      const border = { top: thin, left: thin, bottom: thin, right: thin };
      const fillOf = (argb: string): ExcelFillPattern => ({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb },
      });

      const styleRow = (
        row: ExcelRow,
        opts: {
          fill?: string;
          font?: Partial<ExcelFont>;
          horizontal?: 'left' | 'right' | 'center';
          wrap?: boolean;
        }
      ) => {
        for (let i = 1; i <= COLS; i++) {
          const c = row.getCell(i);
          if (opts.fill) c.fill = fillOf(opts.fill);
          c.font = { name: 'Calibri', size: 12, ...opts.font } as ExcelFont;
          c.alignment = {
            vertical: 'middle',
            horizontal: opts.horizontal ?? 'left',
            wrapText: opts.wrap ?? false,
          };
          c.border = border;
        }
      };

      const mergeRow = (row: ExcelRow) => ws.mergeCells(row.number, 1, row.number, COLS);

      const spacer = () => {
        const r = ws.addRow([]);
        r.height = 7;
      };

      const sectionTitleRow = (title: string) => {
        const r = ws.addRow([title, '', '', '', '']);
        styleRow(r, { fill: LIGHT, font: { bold: true, size: 13, color: { argb: DARK } } });
        mergeRow(r);
        r.height = 22;
      };

      const headerRow = (headers: string[]) => {
        const values: string[] = [];
        for (let i = 0; i < COLS; i++) values.push(headers[i] ?? '');
        const r = ws.addRow(values);
        styleRow(r, { fill: GREEN, font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } } });
        r.height = 20;
      };

      const dataRows = (rows: (string | number)[][], rightFrom: number) => {
        rows.forEach((row, idx) => {
          const values: (string | number)[] = [];
          for (let i = 0; i < COLS; i++) values.push(row[i] ?? '');
          const r = ws.addRow(values);
          styleRow(r, {
            fill: ALT[idx % 2],
            font: { color: { argb: 'FF111827' } },
            wrap: true,
          });
          // numéricos alinhados à direita a partir da coluna indicada
          for (let i = rightFrom; i <= COLS; i++) {
            if (row[i - 1] !== undefined && row[i - 1] !== '') {
              r.getCell(i).alignment = { vertical: 'middle', horizontal: 'right' };
            }
          }
          r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        });
      };

      // Cabeçalho
      const titleRow = ws.addRow(['Relatório Resumo — CREMEPE SEI', '', '', '', '']);
      styleRow(titleRow, { fill: GREEN, font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } } });
      mergeRow(titleRow);
      titleRow.height = 30;

      const linhas = filterLines();
      const metaLines = [`Gerado em: ${generatedAt}`, `Total de processos: ${total}`, ...linhas];
      for (const line of metaLines) {
        const r = ws.addRow([line, '', '', '', '']);
        styleRow(r, {
          fill: 'FFFFFFFF',
          font: { size: 11, color: { argb: 'FF4B5563' } },
        });
        mergeRow(r);
        r.height = 18;
      }
      spacer();

      // Indicadores
      sectionTitleRow('Indicadores');
      headerRow(['Indicador', 'Valor', '% do total']);
      dataRows(
        [
          ['Total', total, '100%'],
          ['Em Andamento', emAndamento, pct(emAndamento, total)],
          ['Finalizados', finalizados, pct(finalizados, total)],
          ['Com Resumo', comResumo, pct(comResumo, total)],
          ['Sem Resumo', semResumo, pct(semResumo, total)],
        ],
        2
      );
      spacer();

      // Distribuição por Status (tabela âncora de 5 colunas)
      sectionTitleRow('Distribuição por Status');
      headerRow(['Status', 'Qtd', '%', 'Com resumo', 'Sem resumo']);
      dataRows(
        statusRows.map((s) => [s.name, s.value, pct(s.value, total), s.resumeCount, s.value - s.resumeCount]),
        2
      );
      spacer();

      if (byUnit.length > 0) {
        sectionTitleRow(
          `Processos por Unidade — Top ${byUnit.length} (${unitScope === 'em_andamento' ? 'em andamento' : 'todos os status'})`
        );
        headerRow(['Unidade', 'Quantidade']);
        dataRows(byUnit.map((u) => [u.name, u.value]), 2);
        spacer();
      }

      if (byTipo.length > 0) {
        sectionTitleRow('Top Tipos de Processo');
        headerRow(['Tipo', 'Quantidade']);
        dataRows(byTipo.map((t) => [t.name, t.value]), 2);
        spacer();
      }

      sectionTitleRow('Nível de Acesso');
      headerRow(['Nível', 'Quantidade', '% do total']);
      dataRows(byNivel.map((n) => [n.name, n.value, pct(n.value, total)]), 2);
      spacer();

      if (byMonth.length > 0) {
        sectionTitleRow('Evolução de Autuações');
        headerRow(['Mês', 'Autuações']);
        dataRows(byMonth.map((m) => [m.name, m.value]), 2);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-resumo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const cardCls = 'bg-white rounded-xl border border-gray-100 p-5';
  const titleCls = 'text-sm font-semibold text-gray-800 mb-1';
  const subCls = 'text-xs text-gray-400 mb-4';

  return (
    <div className="p-8 space-y-5" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Relatórios
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure os filtros e gere análises sob demanda
            {generatedAt && !loading && (
              <span className="text-gray-400"> · gerado em {generatedAt}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setExportDialogOpen(true)}
            disabled={total === 0 || exporting}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar listagem
          </button>
          <button
            onClick={() => setResumoDialogOpen(true)}
            disabled={total === 0 || exporting}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ background: '#009C60' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar resumo
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Sidebar de filtros */}
        <aside className="w-full lg:w-72 shrink-0 bg-white rounded-xl border border-gray-100 border-t-[3px] border-t-[#009C60] p-5 lg:sticky lg:top-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Filtros
            </h2>
            {hasDraftFilters && (
              <button
                onClick={clearDraft}
                className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Limpar
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Período (autuação)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                { label: '30 dias', days: 30 },
                { label: '90 dias', days: 90 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.days)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => applyPreset(undefined, true)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Este ano
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-400 mb-0.5">De</label>
                <input
                  type="date"
                  value={draft.dateFrom}
                  onChange={(e) => setDraftField('dateFrom', e.target.value)}
                  className={selectCls + ' text-xs px-2'}
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-0.5">Até</label>
                <input
                  type="date"
                  value={draft.dateTo}
                  onChange={(e) => setDraftField('dateTo', e.target.value)}
                  className={selectCls + ' text-xs px-2'}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
            <select value={draft.status} onChange={(e) => setDraftField('status', e.target.value)} className={selectCls}>
              <option value="all">Todos os status</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="finalizado">Finalizado</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Unidade</label>
            <button
              onClick={() => setUnitDialogOpen(true)}
              className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm transition-colors ${
                draft.unit.length > 0
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="truncate">
                {draft.unit.length === 0
                  ? 'Todas as unidades'
                  : draft.unit.length === 1
                    ? draft.unit[0]
                    : `${draft.unit.length} unidades selecionadas`}
              </span>
              <svg className="w-3.5 h-3.5 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Tipo de processo</label>
            <button
              onClick={() => setTypeDialogOpen(true)}
              className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm transition-colors ${
                draft.tipos.length > 0
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="truncate">
                {draft.tipos.length === 0
                  ? 'Todos os tipos'
                  : draft.tipos.length === 1
                    ? draft.tipos[0]
                    : `${draft.tipos.length} tipos selecionados`}
              </span>
              <svg className="w-3.5 h-3.5 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Nível de acesso</label>
            <select
              value={draft.nivelAcesso}
              onChange={(e) => setDraftField('nivelAcesso', e.target.value)}
              className={selectCls}
            >
              <option value="all">Todos os níveis</option>
              <option value="Público">Público</option>
              <option value="Restrito">Restrito</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Resumo IA</label>
            <select value={draft.resumo} onChange={(e) => setDraftField('resumo', e.target.value)} className={selectCls}>
              <option value="all">Todos</option>
              <option value="1">Com resumo</option>
              <option value="0">Sem resumo</option>
            </select>
          </div>

          <button
            onClick={() => generate(draft)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white rounded-lg py-2.5 transition-opacity disabled:opacity-60"
            style={{ background: '#009C60' }}
          >
            {loading ? (
              <Spinner size="w-4 h-4" color="#fff" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            )}
            Gerar relatório
          </button>
        </aside>

        {/* Resultados */}
        <div className="flex-1 min-w-0 space-y-5">
          {loading && processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 bg-white rounded-xl border border-gray-100">
              <Spinner size="w-9 h-9" color="#009C60" />
              <p className="text-sm text-gray-600">Gerando relatório…</p>
            </div>
          ) : (
            <>
              {/* Faixa de indicadores compacta (≠ cards do Dashboard) */}
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
                {[
                  { label: 'Total', value: total, color: '#111827' },
                  { label: 'Em andamento', value: `${emAndamento} (${pct(emAndamento, total)})`, color: STATUS_COLORS.em_andamento },
                  { label: 'Finalizados', value: `${finalizados} (${pct(finalizados, total)})`, color: STATUS_COLORS.finalizado },
                  { label: 'Com resumo', value: `${comResumo} (${pct(comResumo, total)})`, color: '#29ABE2' },
                  { label: 'Sem resumo', value: `${semResumo} (${pct(semResumo, total)})`, color: '#F59E0B' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-xs text-gray-500">{s.label}:</span>
                    <span className="text-sm font-bold" style={{ color: s.color, fontFamily: "'Outfit', sans-serif" }}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>

              {total === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
                  <p className="text-sm text-gray-500">Nenhum processo corresponde aos filtros aplicados.</p>
                  <button
                    onClick={() => { clearDraft(); generate(emptyFilters); }}
                    className="mt-3 text-xs font-medium hover:underline"
                    style={{ color: '#009C60' }}
                  >
                    Gerar relatório sem filtros →
                  </button>
                </div>
              ) : (
                <>
                  {/* Distribuição por Status + Processos por Unidade (alturas compatíveis) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className={`${cardCls} flex flex-col h-[420px]`}>
                      <h2 className={titleCls}>Distribuição por Status</h2>
                      <p className={subCls}>Proporção dos processos no recorte atual</p>
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={byStatus}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={55}
                              outerRadius={90}
                              paddingAngle={2}
                            >
                              {byStatus.map((entry) => (
                                <Cell key={entry.key} fill={entry.color} />
                              ))}
                            </Pie>
                            <RTooltip formatter={(value, name) => [String(value), String(name)]} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className={`${cardCls} flex flex-col h-[420px]`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className={titleCls}>Processos por Unidade</h2>
                          <p className={subCls + '!mb-0'}>Top 10 · {unitScope === 'em_andamento' ? 'em andamento' : 'todos os status'}</p>
                        </div>
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                          {(['em_andamento', 'all'] as const).map((scope) => (
                            <button
                              key={scope}
                              onClick={() => setUnitScope(scope)}
                              className={`text-[11px] px-2 py-1 transition-colors ${
                                unitScope === scope ? 'text-white' : 'text-gray-500 hover:bg-gray-50'
                              }`}
                              style={unitScope === scope ? { background: '#009C60' } : {}}
                            >
                              {scope === 'em_andamento' ? 'Andamento' : 'Todos'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 mt-3">
                        {byUnit.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byUnit} layout="vertical" margin={{ left: 0, right: 16 }}>
                              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width="auto" interval={0} />
                              <RTooltip formatter={(value) => [String(value), 'Processos']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f3f4f6' }} />
                              <Bar dataKey="value" radius={4}>
                                {byUnit.map((_, i) => (
                                  <Cell key={i} fill={UNIT_COLORS[i % UNIT_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-sm text-gray-400 text-center py-8">Nenhum processo no escopo.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cobertura (25%) + Nível (25%) + Resumo por Status (50%) */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                    {/* Cobertura do Resumo IA */}
                    <div className={`lg:col-span-1 ${cardCls} flex flex-col`}>
                      <h2 className={titleCls}>Cobertura do Resumo IA</h2>
                      <p className={subCls}>Processos com e sem resumo gerado</p>
                      <div className="flex-1 flex flex-col justify-center space-y-3.5">
                        {[
                          { name: 'Com resumo', value: comResumo, color: '#29ABE2' },
                          { name: 'Sem resumo', value: semResumo, color: '#F59E0B' },
                        ].map((n) => (
                          <div key={n.name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-700">{n.name}</span>
                              <span className="text-sm font-bold text-gray-900">
                                {n.value}
                                <span className="text-xs font-normal text-gray-400 ml-1.5">{pct(n.value, total)}</span>
                              </span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-2.5">
                              <div
                                className="h-2.5 rounded-full transition-all"
                                style={{
                                  width: `${(n.value / Math.max(1, comResumo, semResumo)) * 100}%`,
                                  background: n.color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Nível de Acesso — barras com porcentagens */}
                    <div className={`lg:col-span-1 ${cardCls} flex flex-col`}>
                      <h2 className={titleCls}>Nível de Acesso</h2>
                      <p className={subCls}>Distribuição no recorte atual</p>
                      <div className="flex-1 flex flex-col justify-center space-y-3.5">
                        {byNivel.map((n) => (
                          <div key={n.name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-700">{n.name}</span>
                              <span className="text-sm font-bold text-gray-900">
                                {n.value}
                                <span className="text-xs font-normal text-gray-400 ml-1.5">{pct(n.value, total)}</span>
                              </span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-2.5">
                              <div
                                className="h-2.5 rounded-full transition-all"
                                style={{
                                  width: `${(n.value / maxNivel) * 100}%`,
                                  background: NIVEL_COLORS[n.name] ?? '#009C60',
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resumo por Status (tabela analítica) — 50% */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          Resumo por Status
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">Tabela analítica do recorte atual</p>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">%</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Com resumo</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sem resumo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusRows.map((s) => (
                            <tr key={s.key} className="border-b border-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                                  <span className="text-sm text-gray-800">{s.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900">{s.value}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{pct(s.value, total)}</td>
                              <td className="px-4 py-3 text-sm" style={{ color: '#29ABE2' }}>{s.resumeCount}</td>
                              <td className="px-4 py-3 text-sm text-amber-600">{s.value - s.resumeCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Evolução de Autuações — largura total */}
                  <div className={cardCls}>
                    <h2 className={titleCls}>Evolução de Autuações</h2>
                    <p className={subCls}>Processos autuados por dia (eixo X em meses)</p>
                    {byDay.points.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={byDay.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="key"
                            ticks={byDay.monthTicks}
                            tick={{ fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(k: string) => {
                              const month = k.slice(5, 7);
                              const isYearStart = month === '01' || k === byDay.monthTicks[0];
                              return `${MONTH_NAMES[parseInt(month, 10) - 1]}${isYearStart ? '/' + k.slice(2, 4) : ''}`;
                            }}
                          />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                          <RTooltip
                            labelFormatter={(k) => {
                              const [y, m, d] = String(k).split('-');
                              return `${d}/${m}/${y}`;
                            }}
                            formatter={(value) => [String(value), 'Autuações']}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                          />
                          <Line type="monotone" dataKey="value" stroke="#009C60" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-12">Sem datas de autuação no recorte.</p>
                    )}
                  </div>

                  {/* Top Tipos — largura total */}
                  <div className={cardCls}>
                    <h2 className={titleCls}>Top Tipos de Processo</h2>
                    <p className={subCls}>10 tipos mais frequentes no recorte</p>
                    {byTipo.length > 0 ? (
                      <ResponsiveContainer width="100%" height={Math.max(220, byTipo.length * 36)}>
                        <BarChart data={byTipo} layout="vertical" margin={{ left: 0, right: 16 }}>
                          <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width="auto"
                            interval={0}
                          />
                          <RTooltip
                            formatter={(value) => [String(value), 'Processos']}
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                            cursor={{ fill: '#f3f4f6' }}
                          />
                          <Bar dataKey="value" radius={4} fill="#29ABE2" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-8">Sem tipos no recorte.</p>
                    )}
                  </div>

                  {/* Lista de processos */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          Processos do Relatório
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">{sortedList.length} processo(s) · ordenados por cadastro</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={listPerPage}
                          onChange={(e) => { setListPerPage(Number(e.target.value)); setListPage(1); }}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                        >
                          {[10, 25, 50].map((n) => (
                            <option key={n} value={n}>{n}/pág</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setListPage((p) => Math.max(1, p - 1))}
                            disabled={safeListPage <= 1}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                          >
                            ←
                          </button>
                          <span className="text-xs text-gray-500 px-1">
                            {safeListPage}/{listTotalPages}
                          </span>
                          <button
                            onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
                            disabled={safeListPage >= listTotalPages}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-green-800" style={{ background: '#009C60' }}>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Número SEI</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">Especificação</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Tipo</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Unidade</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Autuação</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap">Resumo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageItems.map((p) => (
                            <tr
                              key={p.id}
                              onClick={() => navigate(`/process/${p.id}`)}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{p.numeroSei}</td>
                              <td className="px-4 py-3 text-gray-800 max-w-[280px] truncate">{p.especificacao || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate">{p.tipo || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                                  style={{ background: STATUS_COLORS[p.status] ?? '#6B7280' }}
                                >
                                  {STATUS_LABELS[p.status] ?? p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                {p.unidades[0]?.sigla || p.unidadeAtual?.sigla || '—'}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {formatDataPtBR(p.dataAutuacao)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: p.resumoIa ? '#009C60' : '#F59E0B' }}
                                >
                                  {p.resumoIa ? 'Sim' : 'Não'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {pageItems.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-sm text-gray-400 text-center">
                                Nenhum processo na página atual.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialog de tipos */}
      <MultiSelectDialog
        open={typeDialogOpen}
        title="Filtrar por tipo"
        options={tipos}
        selected={draft.tipos}
        searchPlaceholder="Buscar tipo…"
        emptyLabel="Nenhum tipo disponível"
        onApply={(sel) => setDraftField('tipos', sel)}
        onClose={() => setTypeDialogOpen(false)}
      />

      {/* Dialog de unidades */}
      <MultiSelectDialog
        open={unitDialogOpen}
        title="Filtrar por unidade"
        options={units.map((u) => u.sigla)}
        selected={draft.unit}
        searchPlaceholder="Buscar unidade…"
        emptyLabel="Nenhuma unidade disponível"
        onApply={(sel) => setDraftField('unit', sel)}
        onClose={() => setUnitDialogOpen(false)}
      />

      {/* Dialog de seleção de campos de exportação */}
      {exportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setExportDialogOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[480px] flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Campos de exportação</h3>
                <p className="text-xs text-gray-400 mt-0.5">Escolha os campos e o formato</p>
              </div>
              <button onClick={() => setExportDialogOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
              <input
                type="checkbox"
                checked={exportFields.length === EXPORT_FIELDS.length}
                onChange={(e) => setExportFields(e.target.checked ? [...ALL_EXPORT_FIELDS] : [])}
                className="rounded"
                style={{ accentColor: '#009C60' }}
              />
              {exportFields.length === EXPORT_FIELDS.length ? 'Desmarcar todos' : 'Marcar todos'}
            </label>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5">
              {EXPORT_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 py-1.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input
                    type="checkbox"
                    checked={exportFields.includes(f.key)}
                    onChange={() => {
                      setExportFields((prev) =>
                        prev.includes(f.key) ? prev.filter((k) => k !== f.key) : [...prev, f.key]
                      );
                    }}
                    className="rounded"
                    style={{ accentColor: '#009C60' }}
                  />
                  <span className="truncate">{f.label}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{exportFields.length} campo(s)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (exportFields.length === 0) return;
                    exportProcessosCsv();
                    setExportDialogOpen(false);
                  }}
                  disabled={exportFields.length === 0}
                  className="text-xs font-medium px-4 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  CSV
                </button>
                <button
                  onClick={async () => {
                    if (exportFields.length === 0) return;
                    setExportDialogOpen(false);
                    await exportProcessosPdf();
                  }}
                  disabled={exportFields.length === 0 || exporting}
                  className="text-xs font-medium px-4 py-1.5 rounded-lg text-white disabled:opacity-40"
                  style={{ background: '#009C60' }}
                >
                  PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de exportação de resumo (CSV/PDF) */}
      {resumoDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setResumoDialogOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Exportar resumo</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Indicadores, status, unidades, tipos, nível e evolução mensal
                </p>
              </div>
              <button onClick={() => setResumoDialogOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-4">
              <button
                onClick={async () => {
                  setResumoDialogOpen(false);
                  await exportResumoPlanilha();
                }}
                disabled={exporting}
                className="text-xs font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                {exporting ? 'Gerando…' : 'Planilha'}
              </button>
              <button
                onClick={async () => {
                  setResumoDialogOpen(false);
                  await exportResumoPdf();
                }}
                disabled={exporting}
                className="text-xs font-medium px-4 py-2 rounded-lg text-white disabled:opacity-40"
                style={{ background: '#009C60' }}
              >
                {exporting ? 'Gerando…' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
