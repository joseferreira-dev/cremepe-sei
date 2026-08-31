/**
 * Formata datas exibidas ao usuário de forma robusta.
 *
 * O SEI retorna `dataAutuacao` e `DataHora` de andamentos no formato brasileiro
 * `DD/MM/AAAA` (e `DD/MM/AAAA HH:mm`), que o `new Date()` do JavaScript não
 * reconhece corretamente (interpreta como MM/DD/AAAA ou retorna "Invalid Date").
 * Esta função trata esses formatos e também datas ISO, evitando "Invalid Date".
 */
export function formatDataPtBR(valor: string | null | undefined, comHora = false): string {
  if (!valor) return '—';
  const v = valor.trim();
  if (!v) return '—';

  // Formato brasileiro: DD/MM/AAAA ou DD/MM/AAAA HH:mm:ss
  const brShort = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brShort) {
    const [, d, m, y] = brShort;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const brFull = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (brFull) {
    const [, d, m, y, hh, mm, ss] = brFull;
    const hora = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}${ss ? `:${ss}` : ''}`;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}${comHora ? ` ${hora}` : ''}`;
  }

  // Datas ISO/UTC e outras reconhecidas pelo Date do JS
  const date = new Date(v);
  if (!isNaN(date.getTime())) {
    return comHora
      ? date.toLocaleString('pt-BR')
      : date.toLocaleDateString('pt-BR');
  }

  // Último recurso: devolve o valor original
  return v;
}
