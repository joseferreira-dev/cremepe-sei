import { useState, useEffect } from 'react';

interface MultiSelectDialogProps {
  open: boolean;
  title: string;
  options: string[];
  selected: string[];
  onApply: (selected: string[]) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
}

export default function MultiSelectDialog({
  open,
  title,
  options,
  selected,
  onApply,
  onClose,
  searchPlaceholder = 'Buscar…',
  emptyLabel = 'Nenhum item encontrado',
}: MultiSelectDialogProps) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selected));
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setLocalSelected(new Set(selected));
      setSearch('');
    }
  }, [open, selected]);

  const filtered = options.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  const allChecked = filtered.length > 0 && filtered.every((t) => localSelected.has(t));

  const toggle = (t: string) => {
    const next = new Set(localSelected);
    next.has(t) ? next.delete(t) : next.add(t);
    setLocalSelected(next);
  };

  const toggleAll = () => {
    const next = new Set(localSelected);
    if (allChecked) {
      filtered.forEach((t) => next.delete(t));
    } else {
      filtered.forEach((t) => next.add(t));
    }
    setLocalSelected(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[420px] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              autoFocus
            />
          </div>
        </div>
        <label className="flex items-center gap-2 px-4 py-2 text-xs text-gray-600 cursor-pointer hover:bg-gray-50 border-b border-gray-100">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="rounded"
            style={{ accentColor: '#009C60' }}
          />
          {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
        </label>
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">{emptyLabel}</p>
          )}
          {filtered.map((t) => (
            <label key={t} className="flex items-center gap-2 py-1.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1">
              <input
                type="checkbox"
                checked={localSelected.has(t)}
                onChange={() => toggle(t)}
                className="rounded"
                style={{ accentColor: '#009C60' }}
              />
              <span className="truncate">{t}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">{localSelected.size} selecionado(s)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onApply([]); onClose(); }}
              className="text-xs text-gray-500 hover:text-red-500 px-3 py-1.5"
            >
              Limpar
            </button>
            <button
              onClick={() => { onApply(Array.from(localSelected)); onClose(); }}
              className="text-xs text-white px-4 py-1.5 rounded-lg font-medium"
              style={{ background: '#009C60' }}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
