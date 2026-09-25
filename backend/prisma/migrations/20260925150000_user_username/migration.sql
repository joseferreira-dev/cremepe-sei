PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'analista',
    "auth_source" TEXT NOT NULL DEFAULT 'local',
    "username" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "units_synced_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("id", "name", "email", "password_hash", "role", "auth_source", "username", "active", "units_synced_at", "created_at", "updated_at")
SELECT "id", "name", "email", "password_hash", "role", "auth_source",
    CASE
        WHEN "auth_source" = 'ad' AND "ad_username" IS NOT NULL AND "ad_username" <> '' THEN "ad_username"
        WHEN instr("email", '@') > 0 THEN substr("email", 1, instr("email", '@') - 1)
        ELSE "email"
    END,
    "active", "units_synced_at", "created_at", "updated_at"
FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;