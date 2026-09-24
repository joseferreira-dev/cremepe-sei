import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User, Process, ProcessStatus, Annotation, Tag } from '../types';
import { getProcess, listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, syncProcess, updateProcess, generateSummary, saveSummary, listTags, deleteProcess, findProcessByNumero, createProcess, listProcessosPai, type ProcessoPai } from '../api';
import { formatDataPtBR } from '../utils/date';
import { cleanSeiText } from '../utils/text';
import { useDialog } from './ui/Dialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  user: User;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
  sobrestado: { label: 'Sobrestado', color: '#374151', bg: '#F3F4F6' },
};

const anotacaoLimit = 5;

interface UnidadeLista {
  sigla: string;
  descricao: string;
  aberta: boolean;
}

/** Altura (px) necessária para exibir até 5 unidades — usada como limite de scroll. */
function alturaCincoUnidades(unidades: UnidadeLista[]): number {
  const cinco = unidades.slice(0, 5);
  return cinco.reduce((sum, u, i) => sum + (u.descricao ? 54 : 38) + (i > 0 ? 8 : 0), 0) + 4;
}

function UnidadesLista({ unidades, altura }: { unidades: UnidadeLista[]; altura: number }) {
  if (unidades.length === 0) return <p className="text-sm text-gray-400">—</p>;
  return (
    <div
      className="flex flex-col gap-2 overflow-y-auto pr-1"
      style={unidades.length > 5 ? { maxHeight: `${altura}px` } : undefined}
    >
      {unidades.map((u) => (
        <div
          key={`${u.aberta ? 'aberta' : 'historica'}-${u.sigla}`}
          className="rounded-lg border px-3 py-2"
          style={
            u.aberta
              ? { background: '#ECFDF5', borderColor: '#A7F3D0' }
              : { background: '#F9FAFB', borderColor: '#F3F4F6' }
          }
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: u.aberta ? '#009C60' : '#9CA3AF' }} />
            <p className="text-sm font-semibold text-gray-800">{u.sigla}</p>
            {u.aberta && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ color: '#006B42', background: '#D1FAE5' }}
              >
                Aberta
              </span>
            )}
          </div>
          {u.descricao && <p className="text-xs text-gray-500 mt-0.5">{u.descricao}</p>}
        </div>
      ))}
    </div>
  );
}

export default function ProcessDetails({ user }: Props) {
  const { id: processId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [process, setProcess] = useState<Process | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newAnnotation, setNewAnnotation] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editAnnotationText, setEditAnnotationText] = useState('');
  const [availTags, setAvailTags] = useState<Tag[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [resumoManualText, setResumoManualText] = useState('');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumo, setResumo] = useState('');
  const [resumoPreview, setResumoPreview] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingPreview, setEditingPreview] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const [showEditResumoModal, setShowEditResumoModal] = useState(false);
  const [editResumoText, setEditResumoText] = useState('');
  const [savingEditResumo, setSavingEditResumo] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [processosPai, setProcessosPai] = useState<ProcessoPai[]>([]);
  const [paisLoading, setPaisLoading] = useState(false);
  const [showAllAnotacoes, setShowAllAnotacoes] = useState(false);
  const [showAndamentosDialog, setShowAndamentosDialog] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!processId) { setNotFound(true); return; }
    setNotFound(false);
    setProcessosPai([]);
    getProcess(processId)
      .then((p) => {
        setProcess(p);
        setResumo(p.resumoIa ?? '');
      })
      .catch(() => setNotFound(true));
    listAnnotations(processId).then((a) => setAnnotations(Array.isArray(a) ? a : [])).catch(() => {});
    listTags().then((t) => setAvailTags(t)).catch(() => {});
    listProcessosPai(processId)
      .then(setProcessosPai)
      .catch(() => {})
      .finally(() => setPaisLoading(false));
  }, [processId]);

  if (notFound || !process) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Processo não encontrado ou carregando…</p>
        <button onClick={() => navigate('/processos')} className="mt-4 text-sm" style={{ color: '#009C60' }}>
          ← Voltar para lista
        </button>
      </div>
    );
  }

  const acessoRestrito = Boolean(process.acessoRestrito);

  const cfg = statusConfig[process.status];

  const handleAddAnnotation = async () => {
    if (!newAnnotation.trim() || !process) return;
    try {
      const ann = await createAnnotation(process.id, newAnnotation);
      setAnnotations([ann, ...annotations]);
      setNewAnnotation('');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao salvar anotação.');
    }
  };

  const handleUpdateAnnotation = async () => {
    if (!editingAnnotation || !editAnnotationText.trim() || !process) return;
    try {
      const updated = await updateAnnotation(process.id, editingAnnotation.id, editAnnotationText);
      setAnnotations(annotations.map((a) => (a.id === editingAnnotation.id ? updated : a)));
      setEditingAnnotation(null);
      setEditAnnotationText('');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao atualizar anotação.');
    }
  };

  const handleDeleteAnnotation = async (ann: Annotation) => {
    if (!process) return;
    const ok = await dialog.confirm('Tem certeza que deseja excluir esta anotação?');
    if (!ok) return;
    try {
      await deleteAnnotation(process.id, ann.id);
      setAnnotations(annotations.filter((a) => a.id !== ann.id));
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao excluir anotação.');
    }
  };

  const handleGenerateResume = async () => {
    if (!process) return;
    if (uploadFiles.length === 0 && !resumoManualText.trim()) {
      dialog.alert('Envie arquivos ou digite o texto para gerar o resumo.');
      return;
    }
    setGeneratingResume(true);
    try {
      const { resumo: generated } = await generateSummary(process.id, uploadFiles, resumoManualText);
      setResumoPreview(generated);
      setEditingPreview(false);
      setShowPreviewModal(true);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao gerar resumo.');
    } finally {
      setGeneratingResume(false);
      setShowUploadModal(false);
      setUploadFiles([]);
      setResumoManualText('');
    }
  };

  const handleSaveResume = async () => {
    if (!process || !resumoPreview) return;
    setSavingResume(true);
    try {
      await saveSummary(process.id, resumoPreview);
      setResumo(resumoPreview);
      await getProcess(process.id).then(setProcess);
      setShowPreviewModal(false);
      setResumoPreview(null);
      dialog.success('Resumo salvo com sucesso!');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao salvar resumo.');
    } finally {
      setSavingResume(false);
    }
  };

  const handleSaveEditResumo = async () => {
    if (!process) return;
    if (!editResumoText.trim()) {
      dialog.alert('O resumo não pode estar vazio.');
      return;
    }
    setSavingEditResumo(true);
    try {
      await saveSummary(process.id, editResumoText);
      setResumo(editResumoText);
      await getProcess(process.id).then(setProcess);
      setShowEditResumoModal(false);
      dialog.success('Resumo atualizado com sucesso!');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao salvar resumo.');
    } finally {
      setSavingEditResumo(false);
    }
  };

  const handleSync = async () => {
    if (!process) return;
    setSyncLoading(true);
    try {
      const updated = await syncProcess(process.id) as any;
      setProcess(updated);
      let msg = 'Processo sincronizado com o SEI.';
      if (updated.autoImportados > 0) {
        msg += ` ${updated.autoImportados} processo(s) relacionado(s) importado(s).`;
      }
      dialog.success(msg);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao sincronizar com o SEI.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!process) return;
    const ok = await dialog.confirm(`Excluir o processo ${process.numeroSei}? Esta ação não pode ser desfeita.`, { title: 'Excluir processo' });
    if (!ok) return;
    try {
      await deleteProcess(process.id);
      navigate('/processos');
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao excluir processo.');
    }
  };

  const handleStatusToggle = async () => {
    if (!process) return;
    setStatusSaving(true);
    setStatusError('');
    try {
      const nextStatus = process.status === 'finalizado' ? 'em_andamento' : 'finalizado';
      await updateProcess(process.id, { statusSistema: nextStatus });
      await getProcess(process.id).then(setProcess);
    } catch (e: any) {
      setStatusError(e?.message || 'Erro ao atualizar status.');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleToggleTag = async (tagId: string) => {
    if (!process) return;
    const currentIds = process.tags.map((t) => t.id);
    const nextIds = currentIds.includes(tagId)
      ? currentIds.filter((id) => id !== tagId)
      : [...currentIds, tagId];
    try {
      await updateProcess(process.id, { tagIds: nextIds });
      await getProcess(process.id).then(setProcess);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao atualizar tags.');
    }
  };

  const handleClickRelated = async (numero: string) => {
    const existing = await findProcessByNumero(numero);
    if (existing) {
      navigate('/processo/' + existing.id);
      return;
    }
    try {
      const created = await createProcess(numero);
      navigate('/processo/' + created.id);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao cadastrar processo.');
    }
  };

  // Unidades unificadas: em processos em andamento, as abertas vêm em verde e as
  // históricas (por onde passou e não está mais aberto) em cinza; finalizadas, tudo cinza.
  const unidadesUnificadas: UnidadeLista[] = [];
  const unidadesJaListadas = new Set<string>();
  const addUnidade = (sigla: string | undefined, descricao: string | undefined, aberta: boolean) => {
    const s = (sigla || '').trim();
    if (!s || unidadesJaListadas.has(s)) return;
    unidadesJaListadas.add(s);
    unidadesUnificadas.push({ sigla: s, descricao: (descricao || '').trim(), aberta });
  };
  if (process.status === 'em_andamento') {
    for (const u of process.unidades) addUnidade(u?.sigla, u?.descricao, true);
    addUnidade(process.unidadeAtual?.sigla, process.unidadeAtual?.descricao, true);
  } else {
    for (const u of process.unidades) addUnidade(u?.sigla, u?.descricao, false);
  }
  for (const a of process.andamentos) addUnidade(a.unidade, '', false);

  const anotacoesVisiveis = showAllAnotacoes ? annotations : annotations.slice(0, anotacaoLimit);

  const handleExportPdf = () => {
    if (!process) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const M = 14;
      const GREEN: [number, number, number] = [0, 156, 96];
      const generatedAt = new Date().toLocaleString('pt-BR');
      const dash = '—';
      let y = 0;

      const lastFinalY = (): number | undefined => {
        // jspdf-autotable v5 grava a última tabela (e finalY) em doc.lastAutoTable
        const t = (doc as any).lastAutoTable;
        return typeof t === 'object' && t !== null ? (t.finalY as number | undefined) : undefined;
      };

      const ensureSpace = (h: number) => {
        if (y + h > pageH - 20) {
          doc.addPage();
          y = M + 4;
        }
      };

      const sectionTitle = (title: string) => {
        ensureSpace(16);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...GREEN);
        doc.text(title, M, y);
        doc.setDrawColor(225);
        doc.line(M, y + 1.8, pageW - M, y + 1.8);
        doc.setTextColor(40);
        y += 7;
      };

      const kvTable = (rows: string[][]) => {
        autoTable(doc, {
          head: [['Campo', 'Detalhe']],
          body: rows,
          startY: y,
          margin: { top: M + 10, left: M, right: M, bottom: 16 },
          styles: { fontSize: 9.5, cellPadding: 2, overflow: 'linebreak' },
          headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 248, 246] },
          columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' } },
        });
        y = (lastFinalY() ?? y) + 7;
      };

      const paragraph = (text: string, size = 10) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(size);
        doc.setTextColor(40);
        const lineH = size * 0.42;
        const lines: string[] = doc.splitTextToSize(text, pageW - 2 * M);
        for (const line of lines) {
          ensureSpace(lineH + 2);
          doc.text(line, M, y);
          y += lineH;
        }
        y += 3;
      };

      // ---- Banner ----
      doc.setFillColor(...GREEN);
      doc.rect(0, 0, pageW, 26, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('CREMEPE SEI — Panorama Geral do Processo', M, 12);
      doc.setFontSize(16);
      doc.text(process.numeroSei, pageW - M, 12, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Gerado em ${generatedAt}${user?.name ? ` · ${user.name}` : ''}`, M, 19);
      doc.text(`Status: ${cfg.label}`, pageW - M, 19, { align: 'right' });
      y = 36;

      // ---- Identificação ----
      sectionTitle('Identificação');
      kvTable([
        ['Status', cfg.label],
        ['Tipo', cleanSeiText(process.tipo) || dash],
        ['Especificação', cleanSeiText(process.especificacao) || dash],
        ['Data de autuação', process.dataAutuacao ? formatDataPtBR(process.dataAutuacao) : dash],
        ['Nível de acesso', process.nivelAcesso || dash],
        [
          'Unidade atual',
          process.unidadeAtual?.sigla
            ? `${process.unidadeAtual.sigla}${process.unidadeAtual.descricao ? ` — ${process.unidadeAtual.descricao}` : ''}`
            : dash,
        ],
        [
          'Unidades',
          unidadesUnificadas.length > 0
            ? unidadesUnificadas
                .map((u) => `${u.sigla}${u.descricao ? ` — ${u.descricao}` : ''}${u.aberta ? ' (aberta)' : ''}`)
                .join('; ')
            : dash,
        ],
        ['Tags', process.tags.length > 0 ? process.tags.map((t) => t.name).join(', ') : dash],
        ['Última sincronização', process.sincronizadoEm ? formatDataPtBR(process.sincronizadoEm, true) : dash],
        ['Link SEI', process.linkSei || dash],
        ['Cadastrado em', formatDataPtBR(process.createdAt, true)],
      ]);

      // ---- Resumo IA ----
      sectionTitle('Resumo IA');
      if (process.resumoIa && process.resumoIa.trim()) {
        if (process.resumoGeradoEm) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(120);
          doc.text(`Gerado em ${formatDataPtBR(process.resumoGeradoEm, true)}`, M, y);
          y += 5;
        }
        paragraph(cleanSeiText(process.resumoIa));
      } else {
        paragraph('Nenhum resumo gerado para este processo.', 10);
      }

      // ---- Último andamento ----
      sectionTitle('Último Andamento');
      const ultimo = process.ultimoAndamento;
      kvTable([
        ['Data / Hora', ultimo?.dataHora ? formatDataPtBR(ultimo.dataHora, true) : dash],
        ['Usuário', cleanSeiText(ultimo?.usuario) || dash],
        ['Unidade', cleanSeiText(ultimo?.unidade) || dash],
        ['Descrição', cleanSeiText(ultimo?.descricao) || dash],
      ]);

      // ---- Assuntos e interessados ----
      sectionTitle('Assuntos e Interessados');
      kvTable([
        [
          'Assuntos',
          process.assuntos.length > 0 ? process.assuntos.map((a) => cleanSeiText(a)).filter(Boolean).join('; ') || dash : dash,
        ],
        [
          'Interessados',
          process.interessados.length > 0
            ? process.interessados.map((i) => cleanSeiText(i)).filter(Boolean).join('; ') || dash
            : dash,
        ],
      ]);

      // ---- Andamentos ----
      sectionTitle(`Histórico de Andamentos (${process.andamentos.length})`);
      if (process.andamentos.length > 0) {
        autoTable(doc, {
          head: [['Data / Hora', 'Unidade', 'Usuário', 'Descrição']],
          body: process.andamentos.map((a) => [
            a.dataHora ? formatDataPtBR(a.dataHora, true) : dash,
            cleanSeiText(a.unidade) || dash,
            cleanSeiText(a.usuario) || dash,
            cleanSeiText(a.descricao) || dash,
          ]),
          startY: y,
          margin: { top: M + 10, left: M, right: M, bottom: 16 },
          styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 248, 246] },
          columnStyles: {
            0: { cellWidth: 26 },
            1: { cellWidth: 20 },
            2: { cellWidth: 26 },
          },
        });
        y = (lastFinalY() ?? y) + 7;
      } else {
        paragraph('Nenhum andamento registrado.', 10);
      }

      // ---- Anotações ----
      sectionTitle(`Anotações (${annotations.length})`);
      if (annotations.length > 0) {
        autoTable(doc, {
          head: [['Data', 'Autor', 'Anotação']],
          body: annotations.map((a) => [
            formatDataPtBR(a.createdAt, true),
            a.userName || dash,
            a.content || dash,
          ]),
          startY: y,
          margin: { top: M + 10, left: M, right: M, bottom: 16 },
          styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 248, 246] },
          columnStyles: {
            0: { cellWidth: 26 },
            1: { cellWidth: 32 },
          },
        });
        y = (lastFinalY() ?? y) + 7;
      } else {
        paragraph('Nenhuma anotação registrada.', 10);
      }

      // ---- Relacionados / anexados / pais ----
      const anexadosNumeros = new Set(process.procedimentosAnexados.map((p) => p.numero));
      const relRows: string[][] = [];
      for (const r of process.procedimentosRelacionados) {
        if (anexadosNumeros.has(r.numero)) continue;
        relRows.push(['Relacionado', r.numero, cleanSeiText(r.tipo) || dash]);
      }
      for (const a of process.procedimentosAnexados) {
        relRows.push(['Anexado', a.numero, cleanSeiText(a.tipo) || dash]);
      }
      for (const p of processosPai) {
        relRows.push([
          'Processo pai',
          p.numero,
          `${cleanSeiText(p.tipo || '')}${p.statusSistema === 'finalizado' ? ' · finalizado' : ''}`.trim() || dash,
        ]);
      }
      sectionTitle('Processos Relacionados');
      if (relRows.length > 0) {
        autoTable(doc, {
          head: [['Relação', 'Número', 'Detalhe']],
          body: relRows,
          startY: y,
          margin: { top: M + 10, left: M, right: M, bottom: 16 },
          styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
          headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 248, 246] },
          columnStyles: {
            0: { cellWidth: 30, fontStyle: 'bold' },
            1: { cellWidth: 45 },
          },
        });
        y = (lastFinalY() ?? y) + 7;
      } else {
        paragraph('Nenhum processo relacionado, anexado ou pai.', 10);
      }

      // ---- Rodapé em todas as páginas ----
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setDrawColor(230);
        doc.line(M, pageH - 12, pageW - M, pageH - 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(`Gerado em ${generatedAt}`, M, pageH - 7.5);
        doc.text(`Página ${i} de ${pages} · CREMEPE SEI`, pageW - M, pageH - 7.5, { align: 'right' });
      }

      doc.save(`panorama-processo-${process.numeroSei}.pdf`);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao gerar o PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="p-8 space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigate('/processos')} className="hover:underline" style={{ color: '#009C60' }}>
          Processos
        </button>
        <span>/</span>
        <span className="font-mono text-gray-700">{process.numeroSei}</span>
      </div>

      {/* Header */}
      {acessoRestrito && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-amber-800 text-sm">Acesso restrito</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="font-mono text-xl font-bold text-gray-800">{process.numeroSei}</span>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ color: cfg.color, background: cfg.bg }}
              >
                {cfg.label}
              </span>
              {process.nivelAcesso && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{process.nivelAcesso}</span>
              )}
            </div>
            <p className="text-gray-700 font-medium mb-1">{process.especificacao}</p>
            <p className="text-xs text-gray-500">
              {process.tipo}
              {process.dataAutuacao && ` · Autuado em ${formatDataPtBR(process.dataAutuacao)}`}
            </p>
            {process.tags.length > 0 && (
              <div className="flex gap-2 mt-3">
                {process.tags.map((t) => (
                  <span key={t.id} className="text-white text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: t.color }}>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {process.linkSei && (
              <a
                href={process.linkSei}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white font-medium transition-colors hover:opacity-90"
                style={{ background: '#29ABE2' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Abrir no SEI
              </a>
            )}
            {!acessoRestrito && (
              <>
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  title="Exportar panorama geral do processo em PDF"
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {exportingPdf ? 'Gerando…' : 'Exportar PDF'}
                </button>
                <button
                  onClick={handleSync}
                  disabled={syncLoading}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  <svg className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {syncLoading ? 'Sincronizando…' : 'Sincronizar'}
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {statusError && <p className="text-red-600 text-sm mt-2">{statusError}</p>}
      </div>

      {acessoRestrito && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <p className="text-sm text-gray-600 mb-4">
            Este processo é de acesso restrito e não está nas suas unidades de trabalho. Os dados detalhados são exibidos apenas para administradores ou usuários das unidades vinculadas ao processo.
          </p>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Unidades</p>
            <UnidadesLista unidades={unidadesUnificadas} altura={alturaCincoUnidades(unidadesUnificadas)} />
          </div>
        </div>
      )}

      {!acessoRestrito && (
        <>
          {/* Corpo: informações principais + resumo lateral */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className="xl:col-span-2 space-y-6 xl:order-2">
              {/* Dados do processo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <InfoCard title="Processo">
                  <Dado label="Tipo" value={process.tipo || '—'} />
                  <Dado label="Data de Autuação" value={process.dataAutuacao ? formatDataPtBR(process.dataAutuacao) : '—'} />
                  <Dado label="Nível de Acesso" value={process.nivelAcesso || '—'} />
                  <Dado label="Última Sincronização" value={process.sincronizadoEm ? formatDataPtBR(process.sincronizadoEm, true) : '—'} />
                  {process.linkSei && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Link SEI</p>
                      <a href={process.linkSei} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all line-clamp-2" title={process.linkSei}>
                        {process.linkSei}
                      </a>
                    </div>
                  )}
                </InfoCard>

                <InfoCard title="Unidades">
                  <UnidadesLista unidades={unidadesUnificadas} altura={alturaCincoUnidades(unidadesUnificadas)} />
                </InfoCard>
              </div>

          {/* Último andamento + Relacionados */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Último Andamento
                </h2>
                <button
                  onClick={() => setShowAndamentosDialog(true)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border rounded-lg transition-colors hover:bg-green-50"
                  style={{ color: '#009C60', borderColor: '#009C60' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Ver histórico ({process.andamentos.length})
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Movimentação mais recente registrada no SEI</p>
              {process.ultimoAndamento.descricao ? (
                <>
                  <p className="text-sm text-gray-800 leading-relaxed">{cleanSeiText(process.ultimoAndamento.descricao)}</p>
                  {(process.ultimoAndamento.dataHora || process.ultimoAndamento.usuario || process.ultimoAndamento.unidade) && (
                    <p className="text-xs text-gray-500 mt-2">
                      {process.ultimoAndamento.dataHora && formatDataPtBR(process.ultimoAndamento.dataHora, true)}
                      {process.ultimoAndamento.usuario && ` · ${process.ultimoAndamento.usuario}`}
                      {process.ultimoAndamento.unidade && ` · ${process.ultimoAndamento.unidade}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">Sem andamentos registrados.</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Processos Relacionados
                </h2>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {process.procedimentosAnexados.length + processosPai.length}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                {process.procedimentosAnexados.length} anexado(s) · {processosPai.length} no(s) qual(is) este está incluído
              </p>
              {process.procedimentosAnexados.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Anexados</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {process.procedimentosAnexados.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleClickRelated(p.numero)}
                        className="w-full text-left px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <p className="font-mono text-xs font-semibold text-gray-800 hover:text-blue-700">{p.numero}</p>
                        {p.tipo && <p className="text-[11px] text-gray-500 truncate">{p.tipo}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {processosPai.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Origens (incluem este)</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {processosPai.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleClickRelated(p.numero)}
                        className="w-full text-left px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-semibold text-gray-800 hover:text-amber-700">{p.numero}</p>
                          {p.statusSistema === 'finalizado' && (
                            <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Finalizado</span>
                          )}
                        </div>
                        {p.tipo && <p className="text-[11px] text-gray-500 truncate">{p.tipo}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {process.procedimentosAnexados.length === 0 && processosPai.length === 0 && (
                <p className="text-sm text-gray-400">Nenhum processo relacionado.</p>
              )}
            </div>
          </div>

          {/* Anotações */}
          <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Anotações{annotations.length > 0 && ` (${annotations.length})`}
              </h2>
              {annotations.length > anotacaoLimit && (
                <button
                  onClick={() => setShowAllAnotacoes(!showAllAnotacoes)}
                  className="text-xs font-medium hover:underline"
                  style={{ color: '#009C60' }}
                >
                  {showAllAnotacoes ? 'Mostrar menos' : `Mostrar todas (${annotations.length})`}
                </button>
              )}
            </div>
            <div className="px-6 py-5">
              <div className="mb-5">
                <textarea
                  value={newAnnotation}
                  onChange={(e) => setNewAnnotation(e.target.value)}
                  placeholder="Digite uma anotação, observação ou sugestão de encaminhamento…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  rows={3}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddAnnotation}
                    disabled={!newAnnotation.trim()}
                    className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                    style={{ background: '#009C60' }}
                  >
                    Salvar Anotação
                  </button>
                </div>
              </div>
              {annotations.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Nenhuma anotação ainda.</p>
              ) : (
                <div className="space-y-3">
                  {anotacoesVisiveis.map((ann) => (
                    <div key={ann.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ background: '#009C60' }}
                        >
                          {ann.userName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </div>
                        <span className="text-xs font-semibold text-gray-700">{ann.userName}</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {formatDataPtBR(ann.createdAt, true)}
                        </span>
                        {(ann.userId === user?.id || user?.role === 'admin') && (
                          <div className="flex items-center gap-0.5 ml-2">
                            {ann.userId === user?.id && (
                              <button
                                onClick={() => { setEditingAnnotation(ann); setEditAnnotationText(ann.content); }}
                                className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Editar anotação"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAnnotation(ann)}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Excluir anotação"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                      {editingAnnotation?.id === ann.id ? (
                        <div>
                          <textarea
                            value={editAnnotationText}
                            onChange={(e) => setEditAnnotationText(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30"
                            rows={3}
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => { setEditingAnnotation(null); setEditAnnotationText(''); }}
                              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={handleUpdateAnnotation}
                              disabled={!editAnnotationText.trim()}
                              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
                              style={{ background: '#009C60' }}
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed">{ann.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          </div>

          {/* Resumo IA lateral */}
          <div className="xl:col-span-1 space-y-6 xl:order-1">
            <div className="xl:sticky xl:top-6">
              <section className="bg-white rounded-xl overflow-hidden shadow-lg">
                <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #009C60 0%, #29ABE2 100%)' }} />
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#009C60' }}>
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                          Resumo
                        </h2>
                        <p className="text-[11px] text-gray-400">
                          {process.resumoGeradoEm ? `Gerado em ${formatDataPtBR(process.resumoGeradoEm, true)}` : 'Visão geral executiva do processo'}
                        </p>
                      </div>
                    </div>
                    {resumo && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setShowEditResumoModal(true); setEditResumoText(resumo); }}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Editar
                        </button>
                        <button
                          onClick={() => setShowUploadModal(true)}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg"
                          style={{ background: '#009C60' }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Regenerar Resumo
                        </button>
                      </div>
                    )}
                  </div>
                  {resumo ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#009C60' }}>
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-green-700">Resumo gerado por IA</span>
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{resumo}</p>
                    </div>
                  ) : (
                    <div className="text-center py-8 px-4 rounded-xl border border-dashed border-green-200 bg-green-50/50">
                      <p className="text-sm text-gray-700 font-medium">Nenhum resumo gerado ainda.</p>
                      <p className="text-xs mt-1 text-gray-500">Clique em "Gerar Resumo com IA" e envie os documentos iniciais do processo.</p>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
                        style={{ background: '#009C60' }}
                      >
                        Gerar Resumo
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
          </div>
        </>
      )}

      {acessoRestrito && (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm">Dados detalhados indisponíveis para este processo.</p>
        </div>
      )}

      {/* Histórico de Andamentos Dialog */}
      {showAndamentosDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Histórico de Andamentos{process.andamentos.length > 0 && ` (${process.andamentos.length})`}
              </h2>
              <button onClick={() => setShowAndamentosDialog(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {process.andamentos.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">Nenhum andamento registrado neste processo.</p>
                  <p className="text-xs mt-1">Faça uma sincronização para buscar os andamentos no SEI.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {process.andamentos.map((and, idx) => (
                    <div key={and.id || idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full border-2 border-white shrink-0" style={{ background: idx === 0 ? '#F59E0B' : '#009C60' }} />
                        {idx < process.andamentos.length - 1 && <div className="w-0.5 flex-1 bg-gray-200" />}
                      </div>
                      <div className="pb-6 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">
                            {formatDataPtBR(and.dataHora, true)}
                          </span>
                          {and.unidade && (
                            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {and.unidade}
                            </span>
                          )}
                          {and.usuario && (
                            <span className="text-xs text-gray-500">— {and.usuario}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-1 leading-relaxed">{cleanSeiText(and.descricao)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end p-6 border-t border-gray-100">
              <button
                onClick={() => setShowAndamentosDialog(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Gerar Resumo com IA
              </h2>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Envie documentos e/ou insira o texto do processo. A IA irá gerar um resumo executivo a partir do conteúdo fornecido.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Texto do processo</label>
                <textarea
                  value={resumoManualText}
                  onChange={(e) => setResumoManualText(e.target.value)}
                  placeholder="Cole ou digite o conteúdo do processo aqui…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  rows={5}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Documentos</label>
                <label className="block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-green-400 transition-colors">
                  <svg className="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm text-gray-500">Arraste arquivos ou <span style={{ color: '#009C60' }}>clique para selecionar</span></p>
                  <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, XLS, XLSX, ODT, CSV, imagens (máx. 50 MB cada)</p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.csv,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp"
                    className="hidden"
                    onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                  />
                </label>
              </div>

              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="flex-1 truncate text-gray-700">{f.name}</span>
                      <button
                        onClick={() => setUploadFiles(uploadFiles.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {generatingResume && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-blue-600 mb-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Enviando para a IA e gerando resumo…
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full animate-pulse" style={{ background: '#29ABE2', width: '60%' }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerateResume}
                disabled={(uploadFiles.length === 0 && !resumoManualText.trim()) || generatingResume}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#29ABE2' }}
              >
                {generatingResume ? 'Gerando…' : 'Gerar Resumo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Resumo Modal */}
      {showPreviewModal && resumoPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Pré-visualização do Resumo
              </h2>
              <button onClick={() => { setShowPreviewModal(false); setResumoPreview(null); setEditingPreview(false); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {editingPreview ? (
                <div className="bg-gray-50 rounded-xl p-5">
                  <textarea
                    value={resumoPreview}
                    onChange={(e) => setResumoPreview(e.target.value)}
                    className="w-full h-72 bg-transparent resize-none focus:outline-none text-sm text-gray-800 leading-relaxed"
                    placeholder="Edite o resumo aqui…"
                  />
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-5 max-h-[60vh] overflow-y-auto">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{resumoPreview}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => { setShowPreviewModal(false); setResumoPreview(null); setEditingPreview(false); }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => setEditingPreview(!editingPreview)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Editar
              </button>
              <button
                onClick={() => { setShowPreviewModal(false); setShowUploadModal(true); }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Regenerar
              </button>
              <button
                onClick={handleSaveResume}
                disabled={savingResume || !resumoPreview.trim()}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#009C60' }}
              >
                {savingResume ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Resumo Modal */}
      {showEditResumoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Editar Resumo
              </h2>
              <button onClick={() => setShowEditResumoModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <textarea
                value={editResumoText}
                onChange={(e) => setEditResumoText(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30"
                rows={12}
                placeholder="Edite o resumo aqui…"
              />
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowEditResumoModal(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEditResumo}
                disabled={savingEditResumo || !editResumoText.trim()}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#009C60' }}
              >
                {savingEditResumo ? 'Salvando…' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function Dado({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}