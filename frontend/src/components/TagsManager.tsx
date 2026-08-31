import { useState, useEffect } from 'react';
import { listTags, createTag, updateTag, deleteTag } from '../api';
import type { Tag } from '../types';
import { useDialog } from './ui/Dialog';

const PRESET_COLORS = ['#EF4444', '#F59E0B', '#8DC63F', '#009C60', '#29ABE2', '#6366F1', '#8B5CF6', '#EC4899', '#374151'];

export default function TagsManager() {
  const dialog = useDialog();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#009C60');
  const [error, setError] = useState('');

  useEffect(() => {
    listTags().then((t) => setTags(t)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openCreate = () => { setEditingTag(null); setName(''); setColor('#009C60'); setError(''); setShowModal(true); };
  const openEdit = (t: Tag) => { setEditingTag(t); setName(t.name); setColor(t.color); setError(''); setShowModal(true); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setError('');
    try {
      if (editingTag) {
        const updated = await updateTag(editingTag.id, name, color);
        setTags(tags.map((t) => (t.id === editingTag.id ? updated : t)));
      } else {
        const created = await createTag(name, color);
        setTags([...tags, created]);
      }
      setShowModal(false);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar tag.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTag(id);
      setTags(tags.filter((t) => t.id !== id));
    } catch (e: any) {
      dialog.error(e?.message || 'Erro ao excluir tag.');
    }
  };

  return (
    <div className="p-8 max-w-2xl" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>Tags</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie as etiquetas para categorizar processos</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ background: '#009C60' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nova Tag
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ background: t.color }} />
            <span className="flex-1 text-sm font-medium text-gray-800">{t.name}</span>
            <span
              className="text-xs font-medium px-3 py-1 rounded-full text-white"
              style={{ background: t.color }}
            >
              {t.name}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => openEdit(t)}
                className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {tags.length === 0 && (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {loading ? 'Carregando tags…' : 'Nenhuma tag criada ainda.'}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {editingTag ? 'Editar Tag' : 'Nova Tag'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Urgente"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        background: c,
                        outline: color === c ? `3px solid ${c}` : undefined,
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer border-0"
                  />
                  <span className="text-xs text-gray-500">Ou escolha uma cor personalizada</span>
                </div>
              </div>
              {name && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Preview:</span>
                  <span className="text-xs font-medium px-3 py-1 rounded-full text-white" style={{ background: color }}>
                    {name}
                  </span>
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-red-600 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: '#009C60' }}
              >
                {editingTag ? 'Salvar' : 'Criar Tag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
