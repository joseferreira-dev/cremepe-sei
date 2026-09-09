import { Router, Request, Response } from "express";
import multer from "multer";
import { unlink, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "../db/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { consultarProcedimento, listarAndamentos, listarUnidades, isProcessoConcluido, montarUnidadesParaBusca } from "../services/sei.js";
import { gerarResumo } from "../services/gemini.js";
import { extrairTexto } from "../services/fileExtractor.js";

const UPLOAD_DIR = join(process.cwd(), "uploads");

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".odt", ".txt", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"];
    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${ext}`));
    }
  },
});

const router = Router();

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
      tipo = "",
      nivelAcesso = "",
      dateFrom = "",
      dateTo = "",
      sort = "createdAt",
      dir = "desc",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 10));
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
      where.AND = [{ resumoIa: { not: null } }, { resumoIa: { not: "" } }];
    } else if (resumo === "0") {
      where.resumoIa = null;
    }

    if (tipo && tipo !== "all") {
      where.tipo = tipo;
    }

    if (nivelAcesso && nivelAcesso !== "all") {
      where.nivelAcesso = nivelAcesso;
    }

    if (dateFrom || dateTo) {
      const processes_all = await prisma.process.findMany({
        where: { ...where },
        select: { id: true, dataAutuacao: true },
      });
      const ids = processes_all.filter((p) => {
        if (!p.dataAutuacao) return false;
        const d = p.dataAutuacao.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      }).map((p) => p.id);
      where.id = ids.length > 0 ? { in: ids } : "__NO_MATCH__";
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

// Find processes that have THIS process as annexed (reverse relationship)
router.get("/:id/pais", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const allProcesses = await prisma.process.findMany({
      select: { id: true, numeroSei: true, tipo: true, statusSistema: true, procedimentosAnexados: true },
    });

    const pais = allProcesses.filter((p) => {
      if (p.id === process.id) return false;
      try {
        const anexados = JSON.parse(p.procedimentosAnexados || "[]");
        return anexados.some((a: any) => a.numero === process.numeroSei);
      } catch {
        return false;
      }
    });

    res.json({
      pais: pais.map((p) => ({ id: p.id, numero: p.numeroSei, tipo: p.tipo, statusSistema: p.statusSistema })),
    });
  } catch (error: any) {
    res.status(500).json({ error: `Erro ao buscar processos pai: ${error.message}` });
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

    // Busca andamentos: unidades abertas ou cascata completa (para processos finalizados)
    let andamentosData: any[] = [];
    const unidadesParaBuscar = unidades.length > 0
      ? unidades.map((u) => ({ IdUnidade: u.id, Sigla: u.sigla, Descricao: u.descricao }))
      : montarUnidadesParaBusca(null, [], await listarUnidades().catch(() => []));
    try {
      andamentosData = await listarAndamentos(numeroSei, unidadesParaBuscar);
    } catch {
      // Falha ao buscar andamentos não impede o cadastro
    }

    // Detecta se processo está concluído
    const concluido = isProcessoConcluido(
      unidades,
      seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null,
      (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
      (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
    );

    // Otimização: herança - busca apenas processos finalizados
    let paiFinalizado = false;
    if (!concluido) {
      const finalizedProcs = await prisma.process.findMany({
        where: { statusSistema: "finalizado" },
        select: { procedimentosAnexados: true },
      });
      for (const other of finalizedProcs) {
        try {
          const anexados = JSON.parse(other.procedimentosAnexados || "[]");
          if (anexados.some((a: any) => a.numero === numeroSei)) {
            paiFinalizado = true;
            break;
          }
        } catch { /* ignore */ }
      }
    }

    const processo = await prisma.process.create({
      data: {
        numeroSei,
        tipo: seiData.TipoProcedimento?.Nome || null,
        especificacao: seiData.Especificacao || null,
        dataAutuacao: seiData.DataAutuacao || null,
        nivelAcesso: seiData.NivelAcesso || null,
        linkSei: seiData.LinkAcesso || null,
        statusSistema: (concluido || paiFinalizado) ? "finalizado" : "em_andamento",
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

    // Busca unidades UMA ÚNICA VEZ antes do loop (cachê de 5min)
    let todasUnidadesGlobal: any[] = [];
    try {
      todasUnidadesGlobal = await listarUnidades();
    } catch { /* ignore */ }

    const results: { numero: string; status: string; mensagem: string; processId?: string }[] = [];

    // Importação paralela com concorrência limitada (5 simultâneos)
    const CONCURRENCY = 5;
    const processarNumero = async (num: string) => {
      try {
        const existing = await prisma.process.findUnique({ where: { numeroSei: num } });
        if (existing) {
          return { numero: num, status: "skipped", mensagem: "Já cadastrado.", processId: existing.id };
        }

        let seiData;
        try {
          seiData = await consultarProcedimento(num);
        } catch {
          return { numero: num, status: "error", mensagem: "Processo não encontrado no SEI." };
        }

        const unidadesAbertasBatch = (seiData.UnidadesProcedimentoAberto || []).map((u) => ({
          id: u.Unidade.IdUnidade,
          sigla: u.Unidade.Sigla,
          descricao: u.Unidade.Descricao,
        }));

        if (userRole !== "admin") {
          const hasAccess = unidadesAbertasBatch.some((u: any) => userUnitSiglas.includes(u.sigla));
          if (!hasAccess) {
            return { numero: num, status: "error", mensagem: "Processo não encontrado nas suas unidades vinculadas." };
          }
        }

        // Busca andamentos: unidades abertas ou cascata completa (para processos finalizados)
        let andamentosBatch: any[] = [];
        let unidadesComDadosBatch: string[] = [];
        const unidadesParaBuscarBatch = unidadesAbertasBatch.length > 0
          ? unidadesAbertasBatch.map((u) => ({ IdUnidade: u.id, Sigla: u.sigla, Descricao: u.descricao }))
          : montarUnidadesParaBusca(null, [], todasUnidadesGlobal);
        try {
          andamentosBatch = await listarAndamentos(num, unidadesParaBuscarBatch);
          if (andamentosBatch.length > 0) {
            unidadesComDadosBatch = Array.from(new Set(andamentosBatch.map((a: any) => a.Unidade?.IdUnidade).filter(Boolean)));
          }
        } catch { /* falha não impede importação */ }

        const concluidoBatch = isProcessoConcluido(
          unidadesAbertasBatch,
          seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null,
          (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
          (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
        );

        // Otimização: herança - busca apenas processos finalizados
        let paiFinalizadoBatch = false;
        if (!concluidoBatch) {
          const finalizedProcs = await prisma.process.findMany({
            where: { statusSistema: "finalizado" },
            select: { procedimentosAnexados: true },
          });
          for (const other of finalizedProcs) {
            try {
              const anexados = JSON.parse(other.procedimentosAnexados || "[]");
              if (anexados.some((a: any) => a.numero === num)) {
                paiFinalizadoBatch = true;
                break;
              }
            } catch { /* ignore */ }
          }
        }

        const processo = await prisma.process.create({
          data: {
            numeroSei: num,
            tipo: seiData.TipoProcedimento?.Nome || null,
            especificacao: seiData.Especificacao || null,
            statusSistema: (concluidoBatch || paiFinalizadoBatch) ? "finalizado" : "em_andamento",
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
            unidades: JSON.stringify(unidadesAbertasBatch),
            unidadeSincronizacao: unidadesComDadosBatch.length > 0 ? JSON.stringify(unidadesComDadosBatch.map((id) => ({ id }))) : null,
            andamentos: JSON.stringify(andamentosBatch.map((a) => ({
              id: a.IdAndamento,
              descricao: a.Descricao,
              dataHora: a.DataHora,
              usuario: a.Usuario?.Nome || "",
              unidade: a.Unidade?.Sigla || "",
            }))),
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

        return { numero: num, status: "success", mensagem: "Importado com sucesso.", processId: processo.id };
      } catch (err: any) {
        return { numero: num, status: "error", mensagem: err.message };
      }
    };

    // Executa em paralelo com concorrência limitada
    const numerosLimpos = numeros.map((n: string) => n.trim()).filter(Boolean);
    for (let i = 0; i < numerosLimpos.length; i += CONCURRENCY) {
      const lote = numerosLimpos.slice(i, i + CONCURRENCY);
      const resultadosLote = await Promise.all(lote.map(processarNumero));
      results.push(...resultadosLote);
    }

    const successes = results.filter((r) => r.status === "success").length;
    const errors = results.filter((r) => r.status === "error").length;

    await prisma.syncLog.create({
      data: {
        tipo: "batch",
        status: errors === 0 ? "success" : "error",
        mensagem: `Importação em lote: ${numeros.length} processos processados, ${successes} importados, ${errors} falhas.`,
      },
    });

    res.json({ results, summary: { total: numeros.length, successes, errors } });
  } catch (error) {
    console.error("[PROCESSES] Import error:", error);
    res.status(500).json({ error: "Erro na importação em lote." });
  }
});

// Batch sync with concurrency limit
router.post("/sync-batch", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "Lista de IDs é obrigatória." });
      return;
    }

    const CONCURRENCY = 5;
    const results: { id: string; status: string; mensagem: string }[] = [];

    const syncOne = async (id: string) => {
      try {
        const proc = await prisma.process.findUnique({ where: { id } });
        if (!proc) return { id, status: "error", mensagem: "Processo não encontrado." };

        // Pula processos finalizados (raramente voltam a ser abertos)
        if (proc.statusSistema === "finalizado") {
          return { id, status: "skipped", mensagem: "Processo já finalizado." };
        }

        // Extrai unidadeAtualId do processo salvo no banco
        let unidadeAtualId: string | undefined;
        try {
          const ua = proc.unidadeAtual ? JSON.parse(proc.unidadeAtual) : null;
          unidadeAtualId = ua?.id;
        } catch { /* ignore */ }

        const seiData = await consultarProcedimento(proc.numeroSei, unidadeAtualId);
        const unidadesAbertas = (seiData.UnidadesProcedimentoAberto || []).map((u) => ({
          id: u.Unidade.IdUnidade,
          sigla: u.Unidade.Sigla,
          descricao: u.Unidade.Descricao,
        }));
        const unidadesReais = [...unidadesAbertas];

        // Compara UltimoAndamento com o salvo no banco
        const ultimoAndamentoNovo = seiData.UltimoAndamento?.Descricao || null;
        const ultimoAndamentoAntigo = proc.ultimoAndamento
          ? JSON.parse(proc.ultimoAndamento).descricao
          : null;
        const andamentoMudou = ultimoAndamentoNovo !== ultimoAndamentoAntigo;
        const andamentosVazios = !proc.andamentos || JSON.parse(proc.andamentos || "[]").length === 0;

        let andamentosSync: any[] = [];
        let unidadesComDados: string[] = [];

        if (andamentoMudou || andamentosVazios) {
          // Busca andamentos se mudou ou se estavam vazios (importação inicial sem unidades abertas)
          let todasUnidades: any[] = [];
          try { todasUnidades = await listarUnidades(); } catch { /* ignore */ }
          const unidadesParaBuscar = montarUnidadesParaBusca(proc.unidadeSincronizacao, unidadesAbertas, todasUnidades);

          if (unidadesParaBuscar.length > 0) {
            try {
              andamentosSync = await listarAndamentos(proc.numeroSei, unidadesParaBuscar);
              if (andamentosSync.length > 0) {
                unidadesComDados = Array.from(new Set(andamentosSync.map((a: any) => a.Unidade?.IdUnidade).filter(Boolean)));
              }
            } catch { /* ignore */ }
          }
        }

        const andamentosSyncParsed = andamentosSync.map((a) => ({
          id: a.IdAndamento, descricao: a.Descricao, dataHora: a.DataHora,
          usuario: a.Usuario?.Nome || "", unidade: a.Unidade?.Sigla || "",
        }));
        const ultimoAndSync = andamentosSyncParsed.length > 0 ? andamentosSyncParsed[0] : null;

        // Só verifica herança se tem procedimentosRelacionados
        let paiFinalizado = false;
        const relatedNumeros = (seiData.ProcedimentosRelacionados || []).map((p) => p.ProcedimentoFormatado);
        const anexadosNumeros = (seiData.ProcedimentosAnexados || []).map((p) => p.ProcedimentoFormatado);
        const soRelacionados = relatedNumeros.filter((n) => !anexadosNumeros.includes(n));

        const parentStatusMap = new Map<string, string>();
        if (soRelacionados.length > 0) {
          const parents = await prisma.process.findMany({ where: { numeroSei: { in: soRelacionados } }, select: { numeroSei: true, statusSistema: true } });
          for (const p of parents) parentStatusMap.set(p.numeroSei, p.statusSistema);

          // Verifica se todos os pais são finalizados
          const todosPaisFinalizados = soRelacionados.every((n) => parentStatusMap.get(n) === "finalizado");
          if (todosPaisFinalizados) {
            paiFinalizado = true;
          }

          // Se nenhum pai está finalizado, verifica herança (processo pai que anexa este)
          if (!paiFinalizado) {
            const allProcs = await prisma.process.findMany({
              where: { id: { not: proc.id }, statusSistema: "finalizado" },
              select: { procedimentosAnexados: true },
            });
            for (const other of allProcs) {
              try {
                const anexados = JSON.parse(other.procedimentosAnexados || "[]");
                if (anexados.some((a: any) => a.numero === proc.numeroSei)) {
                  paiFinalizado = true;
                  break;
                }
              } catch { /* ignore */ }
            }
          }
        }

        const concluido = isProcessoConcluido(
          unidadesReais,
          ultimoAndSync || (seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null),
          (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
          (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
          parentStatusMap,
        );

        // Se nada mudou e não há herança de status, pula update
        if (!andamentoMudou && !paiFinalizado && concluido === (proc.statusSistema === "finalizado")) {
          return { id: proc.id, status: "skipped", mensagem: "Sem alterações." };
        }

        await prisma.process.update({
          where: { id: proc.id },
          data: {
            tipo: seiData.TipoProcedimento?.Nome || proc.tipo,
            especificacao: seiData.Especificacao || proc.especificacao,
            nivelAcesso: seiData.NivelAcesso || proc.nivelAcesso,
            linkSei: seiData.LinkAcesso || proc.linkSei,
            statusSistema: (concluido || paiFinalizado) ? "finalizado" : proc.statusSistema === "finalizado" ? "finalizado" : "em_andamento",
            assuntos: JSON.stringify(seiData.Assuntos?.map((a) => a.Descricao) || []),
            interessados: JSON.stringify(seiData.Interessados?.map((i) => i.Nome) || []),
            unidadeAtual: seiData.UnidadeAtual ? JSON.stringify({ id: seiData.UnidadeAtual.IdUnidade, sigla: seiData.UnidadeAtual.Sigla, descricao: seiData.UnidadeAtual.Descricao }) : proc.unidadeAtual,
            unidades: JSON.stringify(unidadesReais),
            andamentos: andamentosSync.length > 0
              ? JSON.stringify(andamentosSync.map((a) => ({ id: a.IdAndamento, descricao: a.Descricao, dataHora: a.DataHora, usuario: a.Usuario?.Nome || "", unidade: a.Unidade?.Sigla || "" })))
              : proc.andamentos,
            unidadeSincronizacao: unidadesComDados.length > 0 ? JSON.stringify(unidadesComDados.map((id) => ({ id }))) : proc.unidadeSincronizacao,
            procedimentosRelacionados: JSON.stringify((seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: p.TipoProcedimento?.Nome || "" }))),
            procedimentosAnexados: JSON.stringify((seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: p.TipoProcedimento?.Nome || "" }))),
            ultimoAndamento: seiData.UltimoAndamento ? JSON.stringify({ descricao: seiData.UltimoAndamento.Descricao, dataHora: seiData.UltimoAndamento.DataHora, usuario: seiData.UltimoAndamento.Usuario?.Nome || "", unidade: seiData.UltimoAndamento.Unidade?.Sigla || "" }) : proc.ultimoAndamento,
            sincronizadoEm: new Date(),
          },
        });

        return { id: proc.id, status: "success", mensagem: "Sincronizado." };
      } catch (err: any) {
        return { id, status: "error", mensagem: err.message };
      }
    };

    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const lote = ids.slice(i, i + CONCURRENCY);
      const resultadosLote = await Promise.all(lote.map(syncOne));
      results.push(...resultadosLote);
    }

    res.json({ results, total: ids.length });
  } catch (error) {
    console.error("[PROCESSES] Batch sync error:", error);
    res.status(500).json({ error: "Erro na sincronização em lote." });
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
      // Extrai unidadeAtualId do processo salvo no banco
      let unidadeAtualId: string | undefined;
      try {
        const ua = process.unidadeAtual ? JSON.parse(process.unidadeAtual) : null;
        unidadeAtualId = ua?.id;
      } catch { /* ignore */ }

      seiData = await consultarProcedimento(process.numeroSei, unidadeAtualId);
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

    const unidadesAbertas = (seiData.UnidadesProcedimentoAberto || []).map((u) => ({
      id: u.Unidade.IdUnidade,
      sigla: u.Unidade.Sigla,
      descricao: u.Unidade.Descricao,
    }));

    // Unidades reais = apenas as abertas no SEI (para salvar no banco)
    const unidadesReais = [...unidadesAbertas];

    // Compara UltimoAndamento com o salvo no banco
    const ultimoAndamentoNovo = seiData.UltimoAndamento?.Descricao || null;
    const ultimoAndamentoAntigo = process.ultimoAndamento
      ? JSON.parse(process.ultimoAndamento).descricao
      : null;
    const andamentoMudou = ultimoAndamentoNovo !== ultimoAndamentoAntigo;
    const andamentosVazios = !process.andamentos || JSON.parse(process.andamentos || "[]").length === 0;

    let andamentosSync: any[] = [];
    let unidadesComDados: string[] = [];

    if (andamentoMudou || andamentosVazios) {
      // Busca andamentos se mudou ou se estavam vazios (importação inicial sem unidades abertas)
      let todasUnidades: any[] = [];
      try {
        todasUnidades = await listarUnidades();
      } catch { /* ignore */ }
      const unidadesParaBuscar = montarUnidadesParaBusca(
        process.unidadeSincronizacao,
        unidadesAbertas,
        todasUnidades,
      );

      if (unidadesParaBuscar.length > 0) {
        try {
          andamentosSync = await listarAndamentos(process.numeroSei, unidadesParaBuscar);
          if (andamentosSync.length > 0) {
            const unidadesComAndamentos = new Set(andamentosSync.map((a: any) => a.Unidade?.IdUnidade).filter(Boolean));
            unidadesComDados = Array.from(unidadesComAndamentos);
          }
        } catch (err: any) {
          console.warn(`[SYNC] ${process.numeroSei}: falha ao listar andamentos: ${err.message}`);
        }
      }
    }

    // Detecta se processo está concluído
    const andamentosSyncParsed = andamentosSync.map((a) => ({
      id: a.IdAndamento, descricao: a.Descricao, dataHora: a.DataHora,
      usuario: a.Usuario?.Nome || "", unidade: a.Unidade?.Sigla || "",
    }));
    const ultimoAndSync = andamentosSyncParsed.length > 0 ? andamentosSyncParsed[0] : null;

    // Busca status dos processos pai no banco (só se tem procedimentosRelacionados)
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
      unidadesReais,
      ultimoAndSync || (seiData.UltimoAndamento ? { descricao: seiData.UltimoAndamento.Descricao } : null),
      (seiData.ProcedimentosRelacionados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
      (seiData.ProcedimentosAnexados || []).map((p) => ({ id: p.IdProcedimento, numero: p.ProcedimentoFormatado, tipo: "" })),
      parentStatusMap,
    );

    // Herança de status: se algum processo pai (que anexou este) está finalizado, este também fica
    let paiFinalizado = false;
    if (!concluido && relatedNumeros.length > 0) {
      const allProcs = await prisma.process.findMany({
        where: { id: { not: process.id }, statusSistema: "finalizado" },
        select: { procedimentosAnexados: true },
      });
      for (const other of allProcs) {
        try {
          const anexados = JSON.parse(other.procedimentosAnexados || "[]");
          if (anexados.some((a: any) => a.numero === process.numeroSei)) {
            paiFinalizado = true;
            break;
          }
        } catch { /* ignore */ }
      }
    }

    const updated = await prisma.process.update({
      where: { id: process.id },
      data: {
        tipo: seiData.TipoProcedimento?.Nome || process.tipo,
        especificacao: seiData.Especificacao || process.especificacao,
        nivelAcesso: seiData.NivelAcesso || process.nivelAcesso,
        linkSei: seiData.LinkAcesso || process.linkSei,
        statusSistema: (concluido || paiFinalizado) ? "finalizado" : process.statusSistema === "finalizado" ? "finalizado" : "em_andamento",
        assuntos: JSON.stringify(seiData.Assuntos?.map((a) => a.Descricao) || []),
        interessados: JSON.stringify(seiData.Interessados?.map((i) => i.Nome) || []),
        unidadeAtual: seiData.UnidadeAtual ? JSON.stringify({
          id: seiData.UnidadeAtual.IdUnidade,
          sigla: seiData.UnidadeAtual.Sigla,
          descricao: seiData.UnidadeAtual.Descricao,
        }) : process.unidadeAtual,
        unidades: JSON.stringify(unidadesReais),
        andamentos: andamentosSync.length > 0
          ? JSON.stringify(andamentosSync.map((a) => ({ id: a.IdAndamento, descricao: a.Descricao, dataHora: a.DataHora, usuario: a.Usuario?.Nome || "", unidade: a.Unidade?.Sigla || "" })))
          : process.andamentos,
        unidadeSincronizacao: unidadesComDados.length > 0 ? JSON.stringify(unidadesComDados.map((id) => ({ id }))) : process.unidadeSincronizacao,
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

// Save AI summary to process
router.post("/:id/resumo/save", async (req: Request, res: Response) => {
  try {
    const process = await prisma.process.findUnique({ where: { id: req.params.id } });
    if (!process) {
      res.status(404).json({ error: "Processo não encontrado." });
      return;
    }

    const { resumo } = req.body;
    if (!resumo || typeof resumo !== "string" || !resumo.trim()) {
      res.status(400).json({ error: "Resumo não fornecido." });
      return;
    }

    const updated = await prisma.process.update({
      where: { id: process.id },
      data: {
        resumoIa: resumo.trim(),
        resumoGeradoEm: new Date(),
      },
    });

    res.json({ process: updated });
  } catch (error: any) {
    console.error("[RESUMO] Save error:", error);
    res.status(500).json({ error: `Erro ao salvar resumo: ${error.message}` });
  }
});

// Generate AI summary (preview only)
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

    if (textoCompleto.length > 90000) {
      res.status(413).json({ error: "Texto excessivo. Envie menos arquivos ou reduza o texto para gerar o resumo." });
      return;
    }

    const resumo = await gerarResumo(textoCompleto);

    res.json({ resumo });
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

// Generate AI summary from SEI documents (first 3 oldest)
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
