import { Router, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { unlink, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "../db/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { consultarProcedimento, listarAndamentos, listarUnidades, isProcessoConcluido, consultarDocumento, extrairDocumentos, obterLinkDocumento } from "../services/sei.js";
import type { DocumentoFromAndamento } from "../services/sei.js";
import { gerarResumo } from "../services/gemini.js";
import { extrairTexto } from "../services/fileExtractor.js";
import { AppError } from "../utils/errors.js";

const UPLOAD_DIR = join(process.cwd(), "uploads");

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".odt", ".txt", ".jpg", ".jpeg", ".png"];
    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${ext}`));
    }
  },
});

const router = Router();

// Rota de teste pública (remover depois)
router.get("/test-documento/:idDocumento", async (req: Request, res: Response) => {
  try {
    const { idDocumento } = req.params;
    const unidades = await listarUnidades();
    let lastError: any = null;

    for (const unidade of unidades) {
      try {
        const doc = await consultarDocumento(idDocumento, unidade.IdUnidade);
        res.json({
          documento: doc,
          unidadeConsulta: unidade.Sigla,
        });
        return;
      } catch (err: any) {
        lastError = err;
      }
    }

    res.status(404).json({ error: `Documento não encontrado: ${lastError?.message}` });
  } catch (error: any) {
    console.error("[TEST] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.use(authMiddleware);

// List processes with pagination, search, and filters
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      page = "1",
      limit = "10",
      search = "",
      status = "",
      unit = "",
      resumo = "",
      sort = "createdAt",
      dir = "desc",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const userRole = user?.role || "assistente";

    const userUnits = await prisma.userUnit.findMany({ where: { userId: req.user!.userId } });
    const userUnitSiglas = userUnits.map((u) => u.unitSigla);

    const where: any = {};

    if (search) {
      where.OR = [
        { numeroSei: { contains: search } },
        { especificacao: { contains: search } },
        { interessados: { contains: search } },
        { assuntos: { contains: search } },
        { resumoIa: { contains: search } },
      ];
    }

    if (status && status !== "all") {
      where.statusSistema = status;
    }

    if (unit && unit !== "all") {
      where.unidadeAtual = { contains: `"sigla":"${unit}"` };
    }

    if (resumo === "1") {
      where.resumoIa = { not: null };
      where.resumoIa = { not: "" };
    } else if (resumo === "0") {
      where.resumoIa = null;
    }

    if (userRole !== "admin") {
      if (userRole === "assistente") {
        if (userUnitSiglas.length === 0) {
          where.id = "__NO_ACCESS__";
        } else {
          const userUnitConditions = userUnitSiglas.map((sigla) => ({
            unidades: { contains: `"sigla":"${sigla}"` },
          }));
          if (where.OR) {
            where.AND = [{ OR: where.OR }, { OR: userUnitConditions }];
            delete where.OR;
          } else {
            where.OR = userUnitConditions;
          }
        }
      }
    }

    const orderBy: any = {};
    const sortField = sort === "numeroSei" ? "numeroSei"
      : sort === "especificacao" ? "especificacao"
      : sort === "dataAutuacao" ? "dataAutuacao"
      : "createdAt";
    orderBy[sortField] = dir === "asc" ? "asc" : "desc";

    const [processes, total] = await Promise.all([
      prisma.process.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: { tags: { include: { tag: true } } },
      }),
      prisma.process.count({ where }),
    ]);

    const formatted = processes.map((p) => ({
      ...p,
      assuntos: JSON.parse(p.assuntos || "[]"),
      interessados: JSON.parse(p.interessados || "[]"),
      unidadeAtual: p.unidadeAtual ? JSON.parse(p.unidadeAtual) : null,
      unidades: JSON.parse(p.unidades || "[]"),
      andamentos: JSON.parse(p.andamentos || "[]"),
      procedimentosRelacionados: JSON.parse(p.procedimentosRelacionados || "[]"),
      procedimentosAnexados: JSON.parse(p.procedimentosAnexados || "[]"),
      ultimoAndamento: p.ultimoAndamento ? JSON.parse(p.ultimoAndamento) : null,
      tags: p.tags.map((pt) => pt.tag),
    }));

    res.json({
      processes: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("[PROCESSES] List error:", error);
    res.status(500).json({ error: "Erro ao listar processos." });
  }
});

// Get process details
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({
      where: { id: req.params.id },
      include: {
        tags: { include: { tag: true } },
        annotations: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const userRole = user?.role || "assistente";

    if (userRole !== "admin") {
      const userUnits = await prisma.userUnit.findMany({ where: { userId: req.user!.userId } });
      const userUnitSiglas = userUnits.map((u) => u.unitSigla);

      const processUnidades = JSON.parse(process.unidades || "[]");
      const processUnidadeAtual = process.unidadeAtual ? JSON.parse(process.unidadeAtual) : null;
      const allProcessSiglas = [
        ...processUnidades.map((u: any) => u.sigla),
        ...(processUnidadeAtual?.sigla ? [processUnidadeAtual.sigla] : []),
      ];
      const isInUserUnits = allProcessSiglas.some((s: string) => userUnitSiglas.includes(s));

      if (userRole === "assistente") {
        if (!isInUserUnits) {
          res.status(403).json({ error: "Acesso negado a este processo." });
          return;
        }
      } else if (userRole === "analista") {
        if (process.nivelAcesso?.includes("Restrito") && !isInUserUnits) {
          const unidades = JSON.parse(process.unidades || "[]");
          res.json({
            id: process.id,
            numeroSei: process.numeroSei,
            nivelAcesso: process.nivelAcesso,
            statusSistema: process.statusSistema,
            unidades,
            acessoRestrito: true,
          });
          return;
        }
      }
    }

    res.json({
      ...process,
      assuntos: JSON.parse(process.assuntos || "[]"),
      interessados: JSON.parse(process.interessados || "[]"),
      unidadeAtual: process.unidadeAtual ? JSON.parse(process.unidadeAtual) : null,
      unidades: JSON.parse(process.unidades || "[]"),
      andamentos: JSON.parse(process.andamentos || "[]"),
      procedimentosRelacionados: JSON.parse(process.procedimentosRelacionados || "[]"),
      procedimentosAnexados: JSON.parse(process.procedimentosAnexados || "[]"),
      ultimoAndamento: process.ultimoAndamento ? JSON.parse(process.ultimoAndamento) : null,
      tags: process.tags.map((pt) => pt.tag),
    });
  } catch (error) {
    console.error("[PROCESSES] Get error:", error);
    res.status(500).json({ error: "Erro ao buscar processo." });
  }
});

// List all andamentos (movements) of a process from SEI
router.get("/:id/andamentos", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    let unidades;
    try {
      unidades = await listarUnidades();
    } catch {
      res.status(500).json({ error: "Erro ao listar unidades do SEI." });
      return;
    }

    if (unidades.length === 0) {
      res.json({ andamentos: [] });
      return;
    }

    const andamentos = await listarAndamentos(process.numeroSei, unidades);
    res.json({ andamentos });
  } catch (error: any) {
    console.error("[ANDAMENTOS] List error:", error);
    res.status(500).json({ error: `Erro ao listar andamentos: ${error.message}` });
  }
});

// List documents extracted from andamentos
router.get("/:id/documentos", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const documentos = JSON.parse(process.documentos || "[]");
    res.json({ documentos });
  } catch (error: any) {
    console.error("[DOCUMENTOS] List error:", error);
    res.status(500).json({ error: `Erro ao listar documentos: ${error.message}` });
  }
});

// Get direct link to a document in SEI
router.get("/:id/documentos/:numeroDocumento/link", async (req: Request, res: Response) => {
  try {
    const { numeroDocumento } = req.params;
    const link = await obterLinkDocumento(numeroDocumento);
    if (!link) {
      res.status(404).json({ error: "Link do documento não encontrado no SEI." });
      return;
    }
    res.json({ link });
  } catch (error: any) {
    console.error("[DOCUMENTOS] Link error:", error);
    res.status(500).json({ error: `Erro ao obter link: ${error.message}` });
  }
});

// Create process manually
router.post("/", async (req: Request, res: Response) => {
  try {
    const { numeroSei } = req.body;

    if (!numeroSei) {
      res.status(400).json({ error: "Número do processo é obrigatório." });
      return;
    }

    const existing = await prisma.process.findUnique({ where: { numeroSei } });
    if (existing) {
      res.status(409).json({ error: "Processo já cadastrado." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const userRole = user?.role || "assistente";

    const userUnits = await prisma.userUnit.findMany({ where: { userId: req.user!.userId } });
    const userUnitSiglas = userUnits.map((u) => u.unitSigla);

    let seiData;
    try {
      seiData = await consultarProcedimento(numeroSei);
    } catch (seiError: any) {
      res.status(422).json({ error: `Erro ao consultar SEI: ${seiError.message}` });
      return;
    }

    const unidades = (seiData.UnidadesProcedimentoAberto || []).map((u) => ({
      id: u.Unidade.IdUnidade,
      sigla: u.Unidade.Sigla,
      descricao: u.Unidade.Descricao,
    }));

    if (userRole !== "admin") {
      const hasAccess = unidades.some((u) => userUnitSiglas.includes(u.sigla));
      if (!hasAccess) {
        res.status(403).json({ error: "Processo não encontrado nas suas unidades vinculadas." });
        return;
      }
    }

    // Busca andamentos de todas as unidades abertas do processo
    let andamentosData: any[] = [];
    if (unidades.length > 0) {
      try {
        const seiUnidades = unidades.map((u) => ({ IdUnidade: u.id, Sigla: u.sigla, Descricao: u.descricao }));
        andamentosData = await listarAndamentos(numeroSei, seiUnidades);
      } catch {
        // Falha ao buscar andamentos não impede o cadastro
      }
    }

    const documentosInitial = extrairDocumentos(andamentosData as any);

    // Detecta se processo está concluído
    const concluido = isProcessoConcluido(
      unidades,
      seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null,
      (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
      (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
    );

    const processo = await prisma.process.create({
      data: {
        numeroSei,
        tipo: seiData.TipoProcedimento?.Nome || null,
        especificacao: seiData.Especificacao || null,
        dataAutuacao: seiData.DataAutuacao || null,
        nivelAcesso: seiData.NivelAcesso || null,
        linkSei: seiData.LinkAcesso || null,
        statusSistema: concluido ? "finalizado" : "em_andamento",
        assuntos: JSON.stringify(seiData.Assuntos?.map((a) => a.Descricao) || []),
        interessados: JSON.stringify(seiData.Interessados?.map((i) => i.Nome) || []),
        unidadeAtual: seiData.UnidadeAtual ? JSON.stringify({
          id: seiData.UnidadeAtual.IdUnidade,
          sigla: seiData.UnidadeAtual.Sigla,
          descricao: seiData.UnidadeAtual.Descricao,
        }) : null,
        unidades: JSON.stringify(unidades),
        andamentos: JSON.stringify(andamentosData.map((a) => ({
          id: a.IdAndamento,
          descricao: a.Descricao,
          dataHora: a.DataHora,
          usuario: a.Usuario?.Nome || "",
          unidade: a.Unidade?.Sigla || "",
        }))),
        documentos: JSON.stringify(documentosInitial),
        procedimentosRelacionados: JSON.stringify((seiData.ProcedimentosRelacionados || []).map((p) => ({
          id: p.IdProcedimento,
          numero: p.ProcedimentoFormatado,
          tipo: p.TipoProcedimento?.Nome || "",
        }))),
        procedimentosAnexados: JSON.stringify((seiData.ProcedimentosAnexados || []).map((p) => ({
          id: p.IdProcedimento,
          numero: p.ProcedimentoFormatado,
          tipo: p.TipoProcedimento?.Nome || "",
        }))),
        ultimoAndamento: seiData.UltimoAndamento ? JSON.stringify({
          descricao: seiData.UltimoAndamento.Descricao,
          dataHora: seiData.UltimoAndamento.DataHora,
          usuario: seiData.UltimoAndamento.Usuario?.Nome || "",
          unidade: seiData.UltimoAndamento.Unidade?.Sigla || "",
        }) : null,
        sincronizadoEm: new Date(),
      },
    });

    await prisma.syncLog.create({
      data: {
        processId: processo.id,
        numeroSei,
        tipo: "manual",
        status: "success",
        mensagem: "Processo cadastrado com sucesso via SEI.",
      },
    });

    res.status(201).json(processo);
  } catch (error) {
    console.error("[PROCESSES] Create error:", error);
    res.status(500).json({ error: "Erro ao cadastrar processo." });
  }
});

// Batch import
router.post("/import", async (req: Request, res: Response) => {
  try {
    const { numeros } = req.body;

    if (!Array.isArray(numeros) || numeros.length === 0) {
      res.status(400).json({ error: "Lista de números é obrigatória." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const userRole = user?.role || "assistente";

    const userUnits = await prisma.userUnit.findMany({ where: { userId: req.user!.userId } });
    const userUnitSiglas = userUnits.map((u) => u.unitSigla);

    const results: { numero: string; status: string; mensagem: string; processId?: string }[] = [];

    for (const numero of numeros) {
      const num = numero.trim();
      try {
        const existing = await prisma.process.findUnique({ where: { numeroSei: num } });
        if (existing) {
          results.push({ numero: num, status: "skipped", mensagem: "Já cadastrado.", processId: existing.id });
          continue;
        }

        let seiData;
        try {
          seiData = await consultarProcedimento(num);
        } catch {
          results.push({ numero: num, status: "error", mensagem: "Processo não encontrado no SEI." });
          continue;
        }

        const unidadesBatch = (seiData.UnidadesProcedimentoAberto || []).map((u) => ({
          id: u.Unidade.IdUnidade,
          sigla: u.Unidade.Sigla,
          descricao: u.Unidade.Descricao,
        }));

        if (userRole !== "admin") {
          const hasAccess = unidadesBatch.some((u: any) => userUnitSiglas.includes(u.sigla));
          if (!hasAccess) {
            results.push({ numero: num, status: "error", mensagem: "Processo não encontrado nas suas unidades vinculadas." });
            continue;
          }
        }

        let andamentosBatch: any[] = [];
        if (unidadesBatch.length > 0) {
          try {
            const seiUnidadesBatch = unidadesBatch.map((u) => ({ IdUnidade: u.id, Sigla: u.sigla, Descricao: u.descricao }));
            andamentosBatch = await listarAndamentos(num, seiUnidadesBatch);
          } catch { /* falha não impede importação */ }
        }

        const documentosBatch = extrairDocumentos(andamentosBatch as any);

        const concluidoBatch = isProcessoConcluido(
          unidadesBatch,
          seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null,
          (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
          (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
        );

        const processo = await prisma.process.create({
          data: {
            numeroSei: num,
            tipo: seiData.TipoProcedimento?.Nome || null,
            especificacao: seiData.Especificacao || null,
            statusSistema: concluidoBatch ? "finalizado" : "em_andamento",
            dataAutuacao: seiData.DataAutuacao || null,
            nivelAcesso: seiData.NivelAcesso || null,
            linkSei: seiData.LinkAcesso || null,
            assuntos: JSON.stringify(seiData.Assuntos?.map((a) => a.Descricao) || []),
            interessados: JSON.stringify(seiData.Interessados?.map((i) => i.Nome) || []),
            unidadeAtual: seiData.UnidadeAtual ? JSON.stringify({
              id: seiData.UnidadeAtual.IdUnidade,
              sigla: seiData.UnidadeAtual.Sigla,
              descricao: seiData.UnidadeAtual.Descricao,
            }) : null,
            unidades: JSON.stringify(unidadesBatch),
            andamentos: JSON.stringify(andamentosBatch.map((a) => ({
              id: a.IdAndamento,
              descricao: a.Descricao,
              dataHora: a.DataHora,
              usuario: a.Usuario?.Nome || "",
              unidade: a.Unidade?.Sigla || "",
            }))),
            documentos: JSON.stringify(documentosBatch),
            procedimentosRelacionados: JSON.stringify((seiData.ProcedimentosRelacionados || []).map((p) => ({
              id: p.IdProcedimento,
              numero: p.ProcedimentoFormatado,
              tipo: p.TipoProcedimento?.Nome || "",
            }))),
            procedimentosAnexados: JSON.stringify((seiData.ProcedimentosAnexados || []).map((p) => ({
              id: p.IdProcedimento,
              numero: p.ProcedimentoFormatado,
              tipo: p.TipoProcedimento?.Nome || "",
            }))),
            ultimoAndamento: seiData.UltimoAndamento ? JSON.stringify({
              descricao: seiData.UltimoAndamento.Descricao,
              dataHora: seiData.UltimoAndamento.DataHora,
              usuario: seiData.UltimoAndamento.Usuario?.Nome || "",
              unidade: seiData.UltimoAndamento.Unidade?.Sigla || "",
            }) : null,
            sincronizadoEm: new Date(),
          },
        });

        results.push({ numero: num, status: "success", mensagem: "Importado com sucesso.", processId: processo.id });
      } catch (err: any) {
        results.push({ numero: num, status: "error", mensagem: err.message });
      }
    }

    const successes = results.filter((r) => r.status === "success").length;
    const errors = results.filter((r) => r.status === "error").length;

    await prisma.syncLog.create({
      data: {
        tipo: "batch",
        status: errors === 0 ? "success" : "success",
        mensagem: `Importação em lote: ${numeros.length} processos processados, ${successes} importados, ${errors} falhas.`,
      },
    });

    res.json({ results, summary: { total: numeros.length, successes, errors } });
  } catch (error) {
    console.error("[PROCESSES] Import error:", error);
    res.status(500).json({ error: "Erro na importação em lote." });
  }
});

// Sync with SEI
router.post("/:id/sync", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    let seiData;
    try {
      seiData = await consultarProcedimento(process.numeroSei);
    } catch (err: any) {
      await prisma.syncLog.create({
        data: {
          processId: process.id,
          numeroSei: process.numeroSei,
          tipo: "manual",
          status: "error",
          mensagem: `Erro ao sincronizar: ${err.message}`,
        },
      });
      res.status(422).json({ error: `Erro ao consultar SEI: ${err.message}` });
      return;
    }

    const unidadesSync = (seiData.UnidadesProcedimentoAberto || []).map((u) => ({
      id: u.Unidade.IdUnidade,
      sigla: u.Unidade.Sigla,
      descricao: u.Unidade.Descricao,
    }));

    let andamentosSync: any[] = [];
    if (unidadesSync.length > 0) {
      try {
        const seiUnidadesSync = unidadesSync.map((u) => ({ IdUnidade: u.id, Sigla: u.sigla, Descricao: u.descricao }));
        andamentosSync = await listarAndamentos(process.numeroSei, seiUnidadesSync);
      } catch { /* falha não impede sincronização */ }
    }

    const documentosExistentes: DocumentoFromAndamento[] = JSON.parse(process.documentos || "[]");
    const andamentosParaExtrair = andamentosSync.map((a) => ({
      IdAndamento: a.IdAndamento,
      Descricao: a.Descricao,
      DataHora: a.DataHora,
      Usuario: a.Usuario ? { Sigla: a.Usuario.Sigla || "", Nome: a.Usuario.Nome || "" } : null,
      Unidade: a.Unidade ? { IdUnidade: a.Unidade.IdUnidade || "", Sigla: a.Unidade.Sigla || "", Descricao: a.Unidade.Descricao || "" } : null,
    }));
    const novosDocumentos = extrairDocumentos(andamentosParaExtrair as any);
    const docsMap = new Map<string, DocumentoFromAndamento>();
    for (const d of documentosExistentes) docsMap.set(d.idDocumento, d);
    for (const d of novosDocumentos) {
      if (!docsMap.has(d.idDocumento)) docsMap.set(d.idDocumento, d);
    }
    const documentosFinais = Array.from(docsMap.values());

    // Detecta se processo está concluído
    const andamentosSyncParsed = andamentosSync.map((a) => ({
      id: a.IdAndamento, descricao: a.Descricao, dataHora: a.DataHora,
      usuario: a.Usuario?.Nome || "", unidade: a.Unidade?.Sigla || "",
    }));
    const ultimoAndSync = andamentosSyncParsed.length > 0 ? andamentosSyncParsed[0] : null;

    // Busca status dos processos pai no banco (para verificar se todos são concluídos)
    const anexadosNumeros = (seiData.ProcedimentosAnexados || []).map((p) => p.ProcedimentoFormatado);
    const relatedNumeros = (seiData.ProcedimentosRelacionados || [])
      .map((p) => p.ProcedimentoFormatado)
      .filter((num) => !anexadosNumeros.includes(num));

    const parentStatusMap = new Map<string, string>();
    if (relatedNumeros.length > 0) {
      const parents = await prisma.process.findMany({
        where: { numeroSei: { in: relatedNumeros } },
        select: { numeroSei: true, statusSistema: true },
      });
      for (const p of parents) {
        parentStatusMap.set(p.numeroSei, p.statusSistema);
      }
    }

    const concluido = isProcessoConcluido(
      unidadesSync,
      ultimoAndSync || (seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null),
      (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
      (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
      parentStatusMap,
    );

    const updated = await prisma.process.update({
      where: { id: process.id },
      data: {
        tipo: seiData.TipoProcedimento?.Nome || process.tipo,
        especificacao: seiData.Especificacao || process.especificacao,
        nivelAcesso: seiData.NivelAcesso || process.nivelAcesso,
        linkSei: seiData.LinkAcesso || process.linkSei,
        statusSistema: concluido ? "finalizado" : process.statusSistema === "finalizado" ? "finalizado" : "em_andamento",
        assuntos: JSON.stringify(seiData.Assuntos?.map((a) => a.Descricao) || []),
        interessados: JSON.stringify(seiData.Interessados?.map((i) => i.Nome) || []),
        unidadeAtual: seiData.UnidadeAtual ? JSON.stringify({
          id: seiData.UnidadeAtual.IdUnidade,
          sigla: seiData.UnidadeAtual.Sigla,
          descricao: seiData.UnidadeAtual.Descricao,
        }) : process.unidadeAtual,
        unidades: JSON.stringify(unidadesSync),
        andamentos: JSON.stringify(andamentosSync.map((a) => ({
          id: a.IdAndamento,
          descricao: a.Descricao,
          dataHora: a.DataHora,
          usuario: a.Usuario?.Nome || "",
          unidade: a.Unidade?.Sigla || "",
        }))),
        documentos: JSON.stringify(documentosFinais),
        procedimentosRelacionados: JSON.stringify((seiData.ProcedimentosRelacionados || []).map((p) => ({
          id: p.IdProcedimento,
          numero: p.ProcedimentoFormatado,
          tipo: p.TipoProcedimento?.Nome || "",
        }))),
        procedimentosAnexados: JSON.stringify((seiData.ProcedimentosAnexados || []).map((p) => ({
          id: p.IdProcedimento,
          numero: p.ProcedimentoFormatado,
          tipo: p.TipoProcedimento?.Nome || "",
        }))),
        ultimoAndamento: seiData.UltimoAndamento ? JSON.stringify({
          descricao: seiData.UltimoAndamento.Descricao,
          dataHora: seiData.UltimoAndamento.DataHora,
          usuario: seiData.UltimoAndamento.Usuario?.Nome || "",
          unidade: seiData.UltimoAndamento.Unidade?.Sigla || "",
        }) : process.ultimoAndamento,
        sincronizadoEm: new Date(),
      },
    });

    await prisma.syncLog.create({
      data: {
        processId: process.id,
        numeroSei: process.numeroSei,
        tipo: "manual",
        status: "success",
        mensagem: "Sincronização manual concluída. 1 processo atualizado.",
      },
    });

    const full = await prisma.process.findUnique({
      where: { id: process.id },
      include: { tags: { include: { tag: true } } },
    });

    res.json({
      ...full!,
      assuntos: JSON.parse(full!.assuntos || "[]"),
      interessados: JSON.parse(full!.interessados || "[]"),
      unidadeAtual: full!.unidadeAtual ? JSON.parse(full!.unidadeAtual) : null,
      unidades: JSON.parse(full!.unidades || "[]"),
      andamentos: JSON.parse(full!.andamentos || "[]"),
      procedimentosRelacionados: JSON.parse(full!.procedimentosRelacionados || "[]"),
      procedimentosAnexados: JSON.parse(full!.procedimentosAnexados || "[]"),
      ultimoAndamento: full!.ultimoAndamento ? JSON.parse(full!.ultimoAndamento) : null,
      tags: full!.tags.map((pt) => pt.tag),
    });
  } catch (error) {
    console.error("[PROCESSES] Sync error:", error);
    res.status(500).json({ error: "Erro ao sincronizar com SEI." });
  }
});

// Update process (status, tags)
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { statusSistema, tagIds } = req.body;

    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const updateData: any = {};
    if (statusSistema) updateData.statusSistema = statusSistema;

    const updated = await prisma.process.update({
      where: { id: req.params.id },
      data: updateData,
    });

    if (Array.isArray(tagIds)) {
      await prisma.processTag.deleteMany({ where: { processId: process.id } });
      if (tagIds.length > 0) {
        await prisma.processTag.createMany({
          data: tagIds.map((tagId: string) => ({ processId: process.id, tagId })),
        });
      }
    }

    const full = await prisma.process.findUnique({
      where: { id: req.params.id },
      include: { tags: { include: { tag: true } } },
    });

    res.json({
      ...full!,
      assuntos: JSON.parse(full!.assuntos || "[]"),
      interessados: JSON.parse(full!.interessados || "[]"),
      unidadeAtual: full!.unidadeAtual ? JSON.parse(full!.unidadeAtual) : null,
      unidades: JSON.parse(full!.unidades || "[]"),
      andamentos: JSON.parse(full!.andamentos || "[]"),
      procedimentosRelacionados: JSON.parse(full!.procedimentosRelacionados || "[]"),
      procedimentosAnexados: JSON.parse(full!.procedimentosAnexados || "[]"),
      ultimoAndamento: full!.ultimoAndamento ? JSON.parse(full!.ultimoAndamento) : null,
      tags: full!.tags.map((pt) => pt.tag),
    });
  } catch (error) {
    console.error("[PROCESSES] Update error:", error);
    res.status(500).json({ error: "Erro ao atualizar processo." });
  }
});

// Delete process
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Apenas administradores podem excluir processos." });
      return;
    }

    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    await prisma.process.delete({ where: { id: req.params.id } });
    res.json({ message: "Processo excluído com sucesso." });
  } catch (error) {
    console.error("[PROCESSES] Delete error:", error);
    res.status(500).json({ error: "Erro ao excluir processo." });
  }
});

// Generate AI summary
router.post("/:id/resumo", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const tempPaths: string[] = [];

  try {
    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const textoManual = (req.body.textoManual || "").trim();

    if ((!files || files.length === 0) && !textoManual) {
      res.status(400).json({ error: "Envie arquivos ou digite o texto para gerar o resumo." });
      return;
    }

    let textoCompleto = "";

    // Texto inserido manualmente
    if (textoManual) {
      textoCompleto += `\n--- Texto inserido manualmente ---\n${textoManual}\n`;
    }

    // Texto extraído de arquivos
    for (const file of files) {
      tempPaths.push(file.path);
      try {
        const texto = await extrairTexto(file.path, file.originalname);
        textoCompleto += `\n--- Arquivo: ${file.originalname} ---\n${texto}\n`;
      } catch (err: any) {
        console.warn(`[RESUMO] Falha ao extrair texto de ${file.originalname}: ${err.message}`);
        textoCompleto += `\n--- Arquivo: ${file.originalname} ---\n[Falha na extração do texto]\n`;
      }
    }

    if (!textoCompleto.trim()) {
      res.status(422).json({ error: "Não foi possível extrair texto dos arquivos enviados." });
      return;
    }

    const resumo = await gerarResumo(textoCompleto);

    const updated = await prisma.process.update({
      where: { id: process.id },
      data: {
        resumoIa: resumo,
        resumoGeradoEm: new Date(),
      },
    });

    res.json({ resumo, process: updated });
  } catch (error: any) {
    console.error("[RESUMO] Generation error:", error);
    res.status(500).json({ error: `Erro ao gerar resumo: ${error.message}` });
  } finally {
    for (const p of tempPaths) {
      unlink(p, () => {});
    }
  }
});

// Get AI summary
router.get("/:id/resumo", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({
      where: { id: req.params.id },
      select: { resumoIa: true, resumoGeradoEm: true },
    });

    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    res.json(process);
  } catch (error) {
    console.error("[RESUMO] Get error:", error);
    res.status(500).json({ error: "Erro ao buscar resumo." });
  }
});

// Annotations
router.post("/:id/annotations", async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: "Conteúdo da anotação é obrigatório." });
      return;
    }

    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    const annotation = await prisma.annotation.create({
      data: {
        processId: process.id,
        userId: req.user!.userId,
        userName: user?.name || req.user!.email,
        content: content.trim(),
      },
    });

    res.status(201).json(annotation);
  } catch (error) {
    console.error("[ANNOTATIONS] Create error:", error);
    res.status(500).json({ error: "Erro ao criar anotação." });
  }
});

router.get("/:id/annotations", async (req: Request, res: Response) => {
  try {
    const annotations = await prisma.annotation.findMany({
      where: { processId: req.params.id },
      orderBy: { createdAt: "desc" },
    });

    res.json(annotations);
  } catch (error) {
    console.error("[ANNOTATIONS] List error:", error);
    res.status(500).json({ error: "Erro ao listar anotações." });
  }
});

// Update annotation (only by author)
router.put("/:id/annotations/:annotationId", async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: "Conteúdo da anotação é obrigatório." });
      return;
    }

    const annotation = await prisma.annotation.findUnique({
      where: { id: req.params.annotationId },
    });

    if (!annotation) {
      res.status(404).json({ error: "Anotação não encontrada." });
      return;
    }

    if (annotation.userId !== req.user!.userId) {
      res.status(403).json({ error: "Você só pode editar suas próprias anotações." });
      return;
    }

    const updated = await prisma.annotation.update({
      where: { id: req.params.annotationId },
      data: { content: content.trim() },
    });

    res.json(updated);
  } catch (error) {
    console.error("[ANNOTATIONS] Update error:", error);
    res.status(500).json({ error: "Erro ao atualizar anotação." });
  }
});

// Delete annotation (author or admin)
router.delete("/:id/annotations/:annotationId", async (req: Request, res: Response) => {
  try {
    const annotation = await prisma.annotation.findUnique({
      where: { id: req.params.annotationId },
    });

    if (!annotation) {
      res.status(404).json({ error: "Anotação não encontrada." });
      return;
    }

    if (annotation.userId !== req.user!.userId && req.user!.role !== "admin") {
      res.status(403).json({ error: "Você não tem permissão para excluir esta anotação." });
      return;
    }

    await prisma.annotation.delete({ where: { id: req.params.annotationId } });
    res.json({ message: "Anotação excluída com sucesso." });
  } catch (error) {
    console.error("[ANNOTATIONS] Delete error:", error);
    res.status(500).json({ error: "Erro ao excluir anotação." });
  }
});

export default router;
