-- CreateTable
CREATE TABLE "process_resumo_fonte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "process_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "process_resumo_fonte_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "process_resumo_fonte_process_id_key" ON "process_resumo_fonte"("process_id");
