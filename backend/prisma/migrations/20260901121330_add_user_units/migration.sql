-- CreateTable
CREATE TABLE "user_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "unit_sigla" TEXT NOT NULL,
    "unit_desc" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_units_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_units_user_id_unit_id_key" ON "user_units"("user_id", "unit_id");
