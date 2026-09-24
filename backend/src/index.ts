import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { errorHandler } from "./utils/errors.js";
import authRoutes from "./routes/auth.js";
import processRoutes from "./routes/processes.js";
import tagRoutes from "./routes/tags.js";
import adminRoutes from "./routes/admin.js";
import seiRoutes from "./routes/sei.js";

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:8443", "http://127.0.0.1:5173", "http://127.0.0.1:8443"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/autenticacao", authRoutes);
app.use("/api/processos", processRoutes);
app.use("/api/etiquetas", tagRoutes);
app.use("/api/administracao", adminRoutes);
app.use("/api/sei", seiRoutes);

app.get("/api/saude", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(errorHandler);

async function main() {
  await prisma.$connect();
  console.log("[DB] SQLite conectado com sucesso.");

  app.listen(env.PORT, env.HOST, () => {
    console.log(`[SERVER] CREMEPE SEI Backend rodando em http://${env.HOST}:${env.PORT}`);
    console.log(`[SERVER] Endpoints disponíveis em /api/*`);
  });
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
