import { useState, useEffect } from 'react';
import type { Page } from '../App';
import type { User, Process, ProcessStatus, Annotation } from '../types';
import { getProcess, listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, syncProcess, updateProcess, generateSummary, saveSummary, listTags, deleteProcess, findProcessByNumero, createProcess, listDocumentos, getDocumentoLink, type DocumentoFromAndamento } from '../api';
import { formatDataPtBR } from '../utils/date';
import { useDialog } from './ui/Dialog';

interface Props {
  processId: string | null;
  navigateTo: (page: Page, id?: string) => void;
  user: User;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_andamento: { label: 'Em Andamento', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
  sobrestado: { label: 'Sobrestado', color: '#374151', bg: '#F3F4F6' },
};

export default function ProcessDetails({ processId, navigateTo, user }: Props) {
  const dialog = useDialog();
  const [process, setProcess] = useState<Process | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'sei' | 'resumo' | 'andamentos' | 'documentos' | 'anotacoes' | 'tags' | 'relacionados'>('sei');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newAnnotation, setNewAnnotation] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editAnnotationText, setEditAnnotationText] = useState('');
  const [availTags, setAvailTags] = useState(process?.tags ?? []);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [resumoManualText, setResumoManualText] = useState('');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumo, setResumo] = useState('');
  const [resumoPreview, setResumoPreview] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const [showEditResumoModal, setShowEditResumoModal] = useState(false);
  const [editResumoText, setEditResumoText] = useState('');
  const [savingEditResumo, setSavingEditResumo] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [documentos, setDocumentos] = useState<DocumentoFromAndamento[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    if (!processId) { setNotFound(true); return; }
    setNotFound(false);
    getProcess(processId)
      .then((p) => {
        setProcess(p);
        setResumo(p.resumoIa ?? '');
      })
      .catch(() => setNotFound(true));
    listAnnotations(processId).then((a) => setAnnotations(Array.isArray(a) ? a : [])).catch(() => {});
    listTags().then((t) => setAvailTags(t)).catch(() => {});
  }, [processId]);

  useEffect(() => {
    if (tab === 'documentos' && processId && documentos.length === 0 && !docsLoading) {
      setDocsLoading(true);
      listDocumentos(processId)
        .then(setDocumentos)
        .catch(() => {})
        .finally(() => setDocsLoading(false));
    }
  }, [tab, processId]);

  if (notFound || !process) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Processo não encontrado ou carregando…</p>
        <button onClick={() => navigateTo('processes')} className="mt-4 text-sm" style={{ color: '#009C60' }}>
          ← Voltar para lista
        </button>
      </div>
    );
  }

  const acessoRestrito = (process as any).acessoRestrito === true;

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
      setTab('resumo');
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
      const updated = await syncProcess(process.id);
      setProcess(updated);
      dialog.success('Processo sincronizado com o SEI.');
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
      navigateTo('processes');
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

  const allTabs = [
    { id: 'sei', label: 'Dados SEI' },
    { id: 'resumo', label: 'Resumo' },
    { id: 'andamentos', label: 'Andamentos' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'anotacoes', label: `Anotações (${annotations.length})` },
    { id: 'tags', label: 'Tags' },
    { id: 'relacionados', label: 'Processos Relacionados' },
  ] as const;

  const tabs = allTabs;

  const handleClickRelated = async (numero: string) => {
    const existing = await findProcessByNumero(numero);
    if (existing) {
      navigateTo('process-details', existing.id);
      return;
    }
    const ok = await dialog.confirm(
      `O processo ${numero} não está cadastrado no sistema. Deseja cadastrá-lo agora?`,
      { title: 'Processo não encontrado' }
    );
    if (!ok) return;
    try {
      const created = await createProcess(numero);
      navigateTo('process-details', created.id);
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao cadastrar processo.');
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-5xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={() => navigateTo('processes')} className="hover:underline" style={{ color: '#009C60' }}>
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
          <p className="text-amber-800 text-sm">
            Acesso restrito —可视化受限，仅可查看基本信息。
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4">
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

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-6 py-3.5 text-sm font-medium transition-all border-b-2 ${
                tab === t.id
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              style={tab === t.id ? { borderBottomColor: '#009C60', color: '#009C60' } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* SEI data */}
          {tab === 'sei' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Field label="Tipo" value={process.tipo} />
                {process.dataAutuacao && <Field label="Data de Autuação" value={formatDataPtBR(process.dataAutuacao)} />}
                <Field label="Nível de Acesso" value={process.nivelAcesso || '—'} />
                {process.linkSei && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Link SEI</p>
                    <a
                      href={process.linkSei}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline break-all"
                    >
                      {process.linkSei}
                    </a>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Assuntos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {process.assuntos.length > 0 ? process.assuntos.map((a) => (
                      <span key={a} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">{a}</span>
                    )) : <span className="text-xs text-gray-400">—</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Interessados</p>
                  <div className="space-y-1">
                    {process.interessados.length > 0 ? process.interessados.map((i) => (
                      <p key={i} className="text-sm text-gray-800">{i}</p>
                    )) : <span className="text-xs text-gray-400">—</span>}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Unidades</p>
                  {(process.unidades.length > 0 ? process.unidades : [process.unidadeAtual]).filter(Boolean).length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {(process.unidades.length > 0 ? process.unidades : [process.unidadeAtual]).filter(Boolean).map((u, i) => (
                        <div key={i}>
                          <p className="text-sm font-semibold text-gray-800">{u.sigla}</p>
                          <p className="text-xs text-gray-500">{u.descricao}</p>
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Último Andamento</p>
                  {process.ultimoAndamento.descricao ? (
                    <>
                      <p className="text-sm text-gray-800">{process.ultimoAndamento.descricao}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {process.ultimoAndamento.dataHora && formatDataPtBR(process.ultimoAndamento.dataHora, true)}
                        {process.ultimoAndamento.usuario && ` · ${process.ultimoAndamento.usuario}`}
                        {process.ultimoAndamento.unidade && ` · ${process.ultimoAndamento.unidade}`}
                      </p>
                    </>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Última Sincronização</p>
                  <p className="text-sm text-gray-600">{process.sincronizadoEm ? formatDataPtBR(process.sincronizadoEm, true) : '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Resumo IA */}
          {tab === 'resumo' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Resumo</h3>
                <div className="flex items-center gap-2">
                  {resumo && (
                    <button
                      onClick={() => { setShowEditResumoModal(true); setEditResumoText(resumo); }}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar
                    </button>
                  )}
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg"
                    style={{ background: '#29ABE2' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {resumo ? 'Regenerar Resumo' : 'Gerar Resumo com IA'}
                  </button>
                </div>
              </div>
              {resumo ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#29ABE2' }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium text-blue-700">Resumo gerado por IA</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{resumo}</p>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-sm">Nenhum resumo gerado ainda.</p>
                  <p className="text-xs mt-1">Clique em "Gerar Resumo com IA" e envie os documentos iniciais do processo.</p>
                </div>
              )}
            </div>
          )}

          {/* Andamentos */}
          {tab === 'andamentos' && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Histórico de Andamentos
              </h3>
              {process.andamentos.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Nenhum andamento registrado neste processo.</p>
                  <p className="text-xs mt-1">Faça uma sincronização para buscar os andamentos no SEI.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {process.andamentos.map((and, idx) => (
                    <div key={and.id || idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full border-2 border-white shrink-0" style={{ background: '#009C60' }} />
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
                            <span className="text-xs text-gray-500">
                              — {and.usuario}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-1 leading-relaxed">{and.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documentos */}
          {tab === 'documentos' && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Documentos do Processo
              </h3>
              {docsLoading ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="animate-spin w-8 h-8 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <p className="text-sm">Buscando documentos no SEI…</p>
                </div>
              ) : documentos.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-sm">Nenhum documento encontrado nos andamentos.</p>
                  <p className="text-xs mt-1">Faça uma sincronização para buscar os andamentos no SEI.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documentos.filter((d) => d.tipo !== 'excluido').map((doc) => (
                    <div key={doc.idDocumento} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group">
                      <div className="w-8 h-8 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: '#29ABE2' }}>
                        📄
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-800">{doc.idDocumento}</span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">{doc.tipo}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{doc.descricao}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const link = await getDocumentoLink(process.id, doc.idDocumento);
                            window.open(link, '_blank');
                          } catch {
                            if (process.linkSei) window.open(process.linkSei, '_blank');
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Abrir no SEI
                      </button>
                    </div>
                  ))}
                  {documentos.filter((d) => d.tipo === 'excluido').length > 0 && (
                    <details className="mt-4">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                        {documentos.filter((d) => d.tipo === 'excluido').length} documento(s) excluído(s)
                      </summary>
                      <div className="space-y-1 mt-2">
                        {documentos.filter((d) => d.tipo === 'excluido').map((doc) => (
                          <div key={doc.idDocumento} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400">
                            <span className="font-mono line-through">{doc.idDocumento}</span>
                            <span>—</span>
                            <span>{doc.descricao}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Anotações */}
          {tab === 'anotacoes' && (
            <div>
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
                  {annotations.map((ann) => (
                    <div key={ann.id} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
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
          )}

          {/* Tags */}
          {tab === 'tags' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Tags associadas a este processo:</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {process.tags.map((t) => (
                  <div key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-medium" style={{ background: t.color }}>
                    {t.name}
                    <button
                      onClick={() => handleToggleTag(t.id)}
                      className="ml-1 opacity-70 hover:opacity-100"
                      title="Remover tag"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mb-3">Adicionar tag:</p>
              <div className="flex flex-wrap gap-2">
                {availTags.filter((t) => !process.tags.find((x) => x.id === t.id)).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleToggleTag(t.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors"
                    style={{ borderColor: t.color, color: t.color }}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Processos Relacionados */}
          {tab === 'relacionados' && (
            <div>
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Processos Anexados
                </h3>
                <p className="text-xs text-gray-500 mb-3">Processos que estão anexados (incluídos) neste processo:</p>
                {process.procedimentosAnexados.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Nenhum processo anexado.</p>
                ) : (
                  <div className="space-y-2">
                    {process.procedimentosAnexados.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleClickRelated(p.numero)}
                        className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left group"
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform" style={{ background: '#E0F2FE' }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#0369A1" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">{p.numero}</p>
                          {p.tipo && <p className="text-xs text-gray-500 truncate">{p.tipo}</p>}
                        </div>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Anexado</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Processos que incluem este
                </h3>
                <p className="text-xs text-gray-500 mb-3">Processos nos quais este processo está anexado:</p>
                {(() => {
                  const anexadosIds = new Set(process.procedimentosAnexados.map((p) => p.id));
                  const pais = process.procedimentosRelacionados.filter((p) => !anexadosIds.has(p.id));
                  return pais.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Não está anexado em nenhum outro processo.</p>
                  ) : (
                    <div className="space-y-2">
                      {pais.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleClickRelated(p.numero)}
                          className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-left group"
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform" style={{ background: '#FEF3C7' }}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#92400E" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono font-semibold text-gray-800 group-hover:text-amber-700 transition-colors">{p.numero}</p>
                            {p.tipo && <p className="text-xs text-gray-500 truncate">{p.tipo}</p>}
                          </div>
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Processo pai</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {process.procedimentosRelacionados.length === 0 && process.procedimentosAnexados.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Nenhum processo relacionado encontrado.</p>
                  <p className="text-xs mt-1">Faça uma sincronização para buscar os dados no SEI.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
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

              {/* Texto manual */}
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

              {/* Upload de arquivos */}
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
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Pré-visualização do Resumo
              </h2>
              <button onClick={() => { setShowPreviewModal(false); setResumoPreview(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="bg-gray-50 rounded-xl p-5">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{resumoPreview}</p>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => { setShowPreviewModal(false); setResumoPreview(null); }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowPreviewModal(false); setShowUploadModal(true); }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Editar e Regenerar
              </button>
              <button
                onClick={handleSaveResume}
                disabled={savingResume}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#009C60' }}
              >
                {savingResume ? 'Salvando…' : 'Confirmar e Salvar'}
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
              <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}
