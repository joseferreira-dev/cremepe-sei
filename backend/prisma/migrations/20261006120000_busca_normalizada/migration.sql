-- Busca sem acento: coluna normalizada (minúsculas, sem acentos) dos campos
-- pesquisáveis. O conteúdo é preenchido pela aplicação (backfill no boot +
-- manutenção nos writes) — não há função de normalização no SQLite.
ALTER TABLE "processes" ADD COLUMN "busca_normalizada" TEXT;
