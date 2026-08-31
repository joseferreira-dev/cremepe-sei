-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_processes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero_sei" TEXT NOT NULL,
    "tipo" TEXT,
    "especificacao" TEXT,
    "data_autuacao" TEXT,
    "nivel_acesso" TEXT,
    "id_hipotese_legal" TEXT,
    "assuntos" TEXT NOT NULL DEFAULT '[]',
    "interessados" TEXT NOT NULL DEFAULT '[]',
    "unidade_atual" TEXT,
    "unidades" TEXT NOT NULL DEFAULT '[]',
    "ultimo_andamento" TEXT,
    "status_sistema" TEXT NOT NULL DEFAULT 'em_analise',
    "resumo_ia" TEXT,
    "resumo_gerado_em" DATETIME,
    "sincronizado_em" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_processes" ("assuntos", "created_at", "data_autuacao", "especificacao", "id", "id_hipotese_legal", "interessados", "nivel_acesso", "numero_sei", "resumo_gerado_em", "resumo_ia", "sincronizado_em", "status_sistema", "tipo", "ultimo_andamento", "unidade_atual", "updated_at") SELECT "assuntos", "created_at", "data_autuacao", "especificacao", "id", "id_hipotese_legal", "interessados", "nivel_acesso", "numero_sei", "resumo_gerado_em", "resumo_ia", "sincronizado_em", "status_sistema", "tipo", "ultimo_andamento", "unidade_atual", "updated_at" FROM "processes";
DROP TABLE "processes";
ALTER TABLE "new_processes" RENAME TO "processes";
CREATE UNIQUE INDEX "processes_numero_sei_key" ON "processes"("numero_sei");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
