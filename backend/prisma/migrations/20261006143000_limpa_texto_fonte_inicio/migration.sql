-- Texto-fonte do resumo: removia uma linha em branco no início. A montagem
-- antiga (routes/processes.ts) prefixava o primeiro bloco com "\n" sobre uma
-- string vazia, gravando "\n--- Texto inserido manualmente ---". Só o início;
-- o "\n" final é mantido de propósito.
UPDATE "process_resumo_fonte"
SET "texto" = ltrim("texto", char(10))
WHERE substr("texto", 1, 1) = char(10);
