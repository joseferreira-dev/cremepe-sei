interface Props {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [1];

  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');

  pages.push(total);
  return pages;
}

export default function Pagination({ page, totalPages, total, perPage, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        Mostrando {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1 text-xs border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Anterior
        </button>
        {pages.map((n, i) =>
          n === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-gray-400">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onPageChange(n)}
              className="px-3 py-1 text-xs border rounded transition-colors"
              style={n === page ? { background: '#009C60', color: 'white', borderColor: '#009C60' } : {}}
            >
              {n}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1 text-xs border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
