export function cleanSeiText(s: string | null | undefined): string {
  if (!s) return '';
  let prev = '';
  let pass = 0;
  while (prev !== s && pass < 4) {
    prev = s;
    s = s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&amp;/g, '&');
    pass++;
  }
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}