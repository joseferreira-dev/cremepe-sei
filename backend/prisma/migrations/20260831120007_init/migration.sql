-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'analista',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "processes" (
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
    "ultimo_andamento" TEXT,
    "status_sistema" TEXT NOT NULL DEFAULT 'em_analise',
    "resumo_ia" TEXT,
    "resumo_gerado_em" DATETIME,
    "sincronizado_em" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "process_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "annotations_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "process_tags" (
    "process_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("process_id", "tag_id"),
    CONSTRAINT "process_tags_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "process_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "process_id" TEXT,
    "numero_sei" TEXT,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "executed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_logs_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "processes_numero_sei_key" ON "processes"("numero_sei");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_key" ON "configurations"("key");
