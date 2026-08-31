import { useState } from 'react';
import type { Page } from '../App';
import type { User, ProcessStatus, Annotation } from '../types';
import { mockProcesses, mockTags } from '../data/mock';

interface Props {
  processId: string | null;
  navigateTo: (page: Page, id?: string) => void;
  user: User;
}

const statusConfig: Record<ProcessStatus, { label: string; color: string; bg: string }> = {
  em_analise: { label: 'Em Análise', color: '#1D4ED8', bg: '#DBEAFE' },
  finalizado: { label: 'Finalizado', color: '#065F46', bg: '#D1FAE5' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
  sobrestado: { label: 'Sobrestado', color: '#374151', bg: '#F3F4F6' },
};

export default function ProcessDetails({ processId, navigateTo, user }: Props) {
  const process = mockProcesses.find((p) => p.id === processId);
  const [tab, setTab] = useState<'sei' | 'resumo' | 'anotacoes' | 'tags'>('sei');
  const [annotations, setAnnotations] = useState<Annotation[]>(process?.annotations ?? []);
  const [newAnnotation, setNewAnnotation] = useState('');
  const [tags, setTags] = useState(process?.tags ?? []);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [resumo, setResumo] = useState(process?.resumoIa ?? '');
  const [syncLoading, setSyncLoading] = useState(false);

  if (!process) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Processo não encontrado.</p>
        <button onClick={() => navigateTo('processes')} className="mt-4 text-sm" style={{ color: '#009C60' }}>
          ← Voltar para lista
        </button>
      </div>
    );
  }

  const cfg = statusConfig[process.status];

  const handleAddAnnotation = () => {
    if (!newAnnotation.trim()) return;
    const ann: Annotation = {
      id: `ann-${Date.now()}`,
      processId: process.id,
      userId: user.id,
      userName: user.name,
      content: newAnnotation,
      createdAt: new Date().toISOString(),
    };
    setAnnotations([ann, ...annotations]);
    setNewAnnotation('');
  };

  const handleGenerateResume = async () => {
    setGeneratingResume(true);
    await new Promise((r) => setTimeout(r, 2500));
    setResumo(process.resumoIa || `Resumo gerado automaticamente para o processo ${process.numeroSei}. Com base nos documentos enviados, o processo trata de ${process.especificacao.toLowerCase()}. Interessados: ${process.interessados.join(', ')}. O processo encontra-se atualmente na unidade ${process.unidadeAtual.descricao} para análise e instrução.`);
    setGeneratingResume(false);
    setShowUploadModal(false);
    setUploadFiles([]);
    setTab('resumo');
  };

  const handleSync = async () => {
    setSyncLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSyncLoading(false);
  };

  const tabs = [
    { id: 'sei', label: 'Dados SEI' },
    { id: 'resumo', label: 'Resumo IA' },
    { id: 'anotacoes', label: `Anotações (${annotations.length})` },
    { id: 'tags', label: 'Tags' },
  ] as const;

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
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-lg font-bold text-gray-800">{process.numeroSei}</span>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ color: cfg.color, background: cfg.bg }}
              >
                {cfg.label}
              </span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{process.nivelAcesso}</span>
            </div>
            <p className="mt-2 text-gray-700 font-medium">{process.especificacao}</p>
            <p className="mt-1 text-xs text-gray-500">{process.tipo} · Autuado em {new Date(process.dataAutuacao).toLocaleDateString('pt-BR')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSync}
              disabled={syncLoading}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              <svg className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncLoading ? 'Sincronizando…' : 'Sincronizar com SEI'}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white font-medium" style={{ background: '#009C60' }}>
              {process.status === 'finalizado' ? 'Reabrir Processo' : 'Marcar como Finalizado'}
            </button>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex gap-2 mt-4">
            {tags.map((t) => (
              <span key={t.id} className="text-white text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: t.color }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
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
                <Field label="Data de Autuação" value={new Date(process.dataAutuacao).toLocaleDateString('pt-BR')} />
                <Field label="Nível de Acesso" value={process.nivelAcesso} />
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Assuntos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {process.assuntos.map((a) => (
                      <span key={a} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">{a}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Interessados</p>
                  <div className="space-y-1">
                    {process.interessados.map((i) => (
                      <p key={i} className="text-sm text-gray-800">{i}</p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Unidade Atual</p>
                  <p className="text-sm font-semibold text-gray-800">{process.unidadeAtual.sigla}</p>
                  <p className="text-xs text-gray-500">{process.unidadeAtual.descricao}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Último Andamento</p>
                  <p className="text-sm text-gray-800">{process.ultimoAndamento.descricao}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(process.ultimoAndamento.dataHora).toLocaleString('pt-BR')} · {process.ultimoAndamento.usuario} · {process.ultimoAndamento.unidade}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Última Sincronização</p>
                  <p className="text-sm text-gray-600">{new Date(process.sincronizadoEm).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Resumo IA */}
          {tab === 'resumo' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800" style={{ fontFamily: "'Outfit', sans-serif" }}>Resumo Gerado por IA</h3>
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
              {resumo ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#29ABE2' }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium text-blue-700">Resumo gerado por Google Gemini</span>
                    {process.resumoGeradoEm && (
                      <span className="text-xs text-blue-400 ml-auto">
                        {new Date(process.resumoGeradoEm).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{resumo}</p>
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
                          {new Date(ann.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{ann.content}</p>
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
                {tags.map((t) => (
                  <div key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-medium" style={{ background: t.color }}>
                    {t.name}
                    <button
                      onClick={() => setTags(tags.filter((x) => x.id !== t.id))}
                      className="ml-1 opacity-70 hover:opacity-100"
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
                {mockTags.filter((t) => !tags.find((x) => x.id === t.id)).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTags([...tags, t])}
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
                Envie os documentos iniciais do processo. O Google Gemini irá gerar um resumo executivo a partir do conteúdo extraído.
              </p>
              <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-green-400 transition-colors">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-500">Arraste arquivos aqui ou <span style={{ color: '#009C60' }}>clique para selecionar</span></p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOCX, ODT, imagens (máx. 50 MB cada)</p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.odt,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="flex-1 truncate text-gray-700">{f.name}</span>
                      <span className="text-gray-400 text-xs">{(f.size / 1024).toFixed(0)} KB</span>
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
                    Enviando para o Gemini e gerando resumo…
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
                disabled={uploadFiles.length === 0 || generatingResume}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#29ABE2' }}
              >
                {generatingResume ? 'Gerando…' : 'Gerar Resumo'}
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
