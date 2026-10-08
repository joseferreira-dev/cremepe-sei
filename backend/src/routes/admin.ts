import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { buscarUnidadesDoUsuario, listarUnidades, testarConexao } from "../services/sei.js";
import { SEI_CONFIG_KEYS, carregarSeiConfig, seiConfig, type SeiConfigEfetiva } from "../config/seiConfig.js";
import { registrarAuditoria } from "../utils/audit.js";
import { env } from "../config/env.js";
import { statSync } from "fs";
import { join } from "path";

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

/** Mascara da chave de acesso SEI — nunca devolvida em claro pelo GET. */
const CHAVE_MASCARADA = "********";
const SENHA_MINIMA = 8;

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

router.get("/usuarios", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        authSource: true,
        username: true,
        active: true,
        createdAt: true,
        units: {
          select: { id: true, unitId: true, unitSigla: true, unitDesc: true },
          orderBy: { unitSigla: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

router.post("/usuarios", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, authSource, username } = req.body;

    if (!name || !email) {
      res.status(400).json({ error: "Nome e e-mail são obrigatórios." });
      return;
    }

    if (authSource !== "ad") {
      if (!password) {
        res.status(400).json({ error: "Senha é obrigatória para usuários locais." });
        return;
      }
      if (String(password).length < SENHA_MINIMA) {
        res.status(400).json({ error: `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` });
        return;
      }
    }

    // Username: identificador de login de todos os usuários (sem @).
    // Se não informado, deriva do prefixo do e-mail.
    let usernameLimpo = typeof username === "string" ? username.trim() : "";
    if (usernameLimpo && usernameLimpo.includes("@")) {
      res.status(400).json({ error: "Username não deve conter '@'." });
      return;
    }
    if (!usernameLimpo) {
      usernameLimpo = email.includes("@") ? email.split("@")[0] : String(email);
    }
    const usernameExiste = await prisma.user.findUnique({ where: { username: usernameLimpo } });
    if (usernameExiste) {
      res.status(409).json({ error: `Username "${usernameLimpo}" já está em uso.` });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "E-mail já cadastrado." });
      return;
    }

    const passwordHash = authSource === "ad" ? "" : await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: role || "assistente",
        authSource: authSource === "ad" ? "ad" : "local",
        username: usernameLimpo,
      },
      select: { id: true, name: true, email: true, role: true, authSource: true, username: true, active: true, createdAt: true },
    });

    await registrarAuditoria(req, "criar usuário", email, `papel: ${user.role} · autenticação: ${user.authSource} · username: ${usernameLimpo}`);
    res.status(201).json({ ...user, units: [] });
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

router.put("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    const { name, email, role, active, password, username } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    // Proteções contra auto-bloqueio do administrador
    if (req.user!.userId === req.params.id) {
      if (active === false) {
        res.status(403).json({ error: "Você não pode desativar a própria conta." });
        return;
      }
      if (role && role !== "admin") {
        res.status(403).json({ error: "Você não pode remover o próprio perfil de administrador." });
        return;
      }
    }

    const updateData: any = {};
    const mudancas: string[] = [];

    if (user.authSource === "ad") {
      if (name && name !== user.name) {
        res.status(403).json({ error: "Usuários do Active Directory não podem ter o nome alterado via sistema." });
        return;
      }
      if (email && email !== user.email) {
        res.status(403).json({ error: "Usuários do Active Directory não podem ter o e-mail alterado via sistema." });
        return;
      }
      if (password) {
        res.status(403).json({ error: "Usuários do Active Directory têm a senha controlada pelo AD e não podem alterá-la no sistema." });
        return;
      }
    } else {
      if (name && name !== user.name) {
        updateData.name = name;
        mudancas.push(`nome: "${user.name}" → "${name}"`);
      }
      if (email && email !== user.email) {
        updateData.email = email;
        mudancas.push(`e-mail: ${user.email} → ${email}`);
      }
    }

    // Username (identificador de login) — editável para todos os perfis
    if (username !== undefined) {
      const limpo = String(username).trim();
      if (!limpo) {
        res.status(400).json({ error: "Username é obrigatório." });
        return;
      }
      if (limpo.includes("@")) {
        res.status(400).json({ error: "Username não deve conter '@'." });
        return;
      }
      if (limpo !== user.username) {
        const conflito = await prisma.user.findUnique({ where: { username: limpo } });
        if (conflito) {
          res.status(409).json({ error: `Username "${limpo}" já está em uso.` });
          return;
        }
        updateData.username = limpo;
        mudancas.push(`username: ${user.username} → ${limpo}`);
      }
    }

    if (role && role !== user.role) {
      updateData.role = role;
      mudancas.push(`papel: ${user.role} → ${role}`);
    }

    if (typeof active === "boolean" && active !== user.active) {
      updateData.active = active;
      mudancas.push(active ? "reativado" : "desativado");
    }

    if (password) {
      if (String(password).length < SENHA_MINIMA) {
        res.status(400).json({ error: `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` });
        return;
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
      mudancas.push("senha redefinida");
    }

    if (mudancas.length === 0) {
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        authSource: user.authSource,
        active: user.active,
        createdAt: user.createdAt,
      });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
    });

    await registrarAuditoria(req, "atualizar usuário", user.email, mudancas.join(" · "));
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});

router.delete("/usuarios/:id", async (req: Request, res: Response) => {
  try {
    if (req.user!.userId === req.params.id) {
      res.status(403).json({ error: "Você não pode excluir a própria conta." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    await prisma.userUnit.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });

    await registrarAuditoria(req, "excluir usuário", user.email, `nome: ${user.name} · papel: ${user.role}`);
    res.json({ message: "Usuário excluído com sucesso." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

router.post("/usuarios/:id/sincronizar-unidades", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    await prisma.userUnit.deleteMany({ where: { userId: req.params.id } });

    let unidades;
    if (user.role === "admin") {
      unidades = await listarUnidades();
    } else {
      const sigla = user.username;
      unidades = await buscarUnidadesDoUsuario(sigla);
    }

    for (const u of unidades) {
      await prisma.userUnit.create({
        data: { userId: req.params.id, unitId: u.IdUnidade, unitSigla: u.Sigla, unitDesc: u.Descricao },
      });
    }

    await prisma.user.update({ where: { id: req.params.id }, data: { unitsSyncedAt: new Date() } });

    await registrarAuditoria(req, "sincronizar unidades", user.email, `${unidades.length} unidade(s) via SEI`);
    res.json({ synced: unidades.length });
  } catch (error: any) {
    console.error("[ADMIN] Sync units error:", error);
    res.status(500).json({ error: `Erro ao sincronizar unidades: ${error.message}` });
  }
});

/** Atribuição manual de unidades (substitui o conjunto atual do usuário). */
router.post("/usuarios/:id/unidades", async (req: Request, res: Response) => {
  try {
    const { unidades } = req.body;
    if (!Array.isArray(unidades)) {
      res.status(400).json({ error: "Lista de unidades é obrigatória." });
      return;
    }

    const vistas = new Set<string>();
    const limpas: { unitId: string; unitSigla: string; unitDesc: string }[] = [];
    for (const u of unidades) {
      if (!u || typeof u.unitId !== "string" || typeof u.unitSigla !== "string" || !u.unitId || !u.unitSigla) {
        res.status(400).json({ error: "Formato inválido de unidade (esperado unitId/unitSigla)." });
        return;
      }
      if (vistas.has(u.unitId)) continue;
      vistas.add(u.unitId);
      limpas.push({
        unitId: u.unitId,
        unitSigla: u.unitSigla.trim(),
        unitDesc: typeof u.unitDesc === "string" ? u.unitDesc : "",
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    await prisma.userUnit.deleteMany({ where: { userId: req.params.id } });
    if (limpas.length > 0) {
      await prisma.userUnit.createMany({
        data: limpas.map((u) => ({ userId: req.params.id, ...u })),
      });
    }

    await prisma.user.update({ where: { id: req.params.id }, data: { unitsSyncedAt: new Date() } });

    await registrarAuditoria(req, "atribuir unidades", user.email, `${limpas.length} unidade(s) manualmente`);
    res.json({ synced: limpas.length });
  } catch (error: any) {
    console.error("[ADMIN] Set units error:", error);
    res.status(500).json({ error: `Erro ao salvar unidades: ${error.message}` });
  }
});

// ---------------------------------------------------------------------------
// Registros de sincronização (logs) — com filtros, paginação e responsável
// ---------------------------------------------------------------------------

router.get("/registros", async (req: Request, res: Response) => {
  try {
    const {
      tipo = "",
      status = "",
      search = "",
      page = "1",
      limit = "20",
      dateFrom = "",
      dateTo = "",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (tipo && tipo !== "all") where.tipo = tipo;
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { numeroSei: { contains: search } },
        { mensagem: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.executedAt = {};
      if (dateFrom) where.executedAt.gte = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) where.executedAt.lte = new Date(`${dateTo}T23:59:59.999`);
    }

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({ where, orderBy: { executedAt: "desc" }, skip, take: limitNum }),
      prisma.syncLog.count({ where }),
    ]);

    const userIds = Array.from(new Set(logs.map((l) => l.userId).filter(Boolean))) as string[];
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const nomes = new Map(users.map((u) => [u.id, u.name]));

    res.json({
      logs: logs.map((l) => ({ ...l, userName: l.userId ? nomes.get(l.userId) ?? null : null })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    });
  } catch (error) {
    console.error("[ADMIN] Logs error:", error);
    res.status(500).json({ error: "Erro ao listar registros." });
  }
});

// ---------------------------------------------------------------------------
// Auditoria de administração
// ---------------------------------------------------------------------------

router.get("/auditoria", async (req: Request, res: Response) => {
  try {
    const { search = "", page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { userName: { contains: search } },
        { acao: { contains: search } },
        { alvo: { contains: search } },
        { detalhe: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limitNum }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    });
  } catch (error) {
    console.error("[ADMIN] Auditoria error:", error);
    res.status(500).json({ error: "Erro ao listar auditoria." });
  }
});

// ---------------------------------------------------------------------------
// Configurações do WebService SEI
// ---------------------------------------------------------------------------

router.get("/configuracoes", async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.configuration.findMany();
    const result: Record<string, string> = {};
    configs.forEach((c) => {
      // A chave de acesso nunca sai em claro
      result[c.key] = c.key === SEI_CONFIG_KEYS.identificacaoServico && c.value ? CHAVE_MASCARADA : c.value;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar configurações." });
  }
});

router.put("/configuracoes", async (req: Request, res: Response) => {
  try {
    const configs = req.body;
    if (!configs || typeof configs !== "object") {
      res.status(400).json({ error: "Configurações inválidas." });
      return;
    }

    const permitidas = new Set<string>(Object.values(SEI_CONFIG_KEYS));
    const alteradas: string[] = [];

    for (const [key, value] of Object.entries(configs)) {
      if (!permitidas.has(key) || typeof value !== "string") continue;
      // Chave mascarada ou vazia → mantém a valor atual (nunca grava a máscara)
      if (key === SEI_CONFIG_KEYS.identificacaoServico && (value === CHAVE_MASCARADA || !value.trim())) continue;

      const limpo = value.trim();
      await prisma.configuration.upsert({
        where: { key },
        update: { value: limpo },
        create: { key, value: limpo },
      });
      alteradas.push(key);
    }

    if (alteradas.length > 0) {
      await carregarSeiConfig();
      await registrarAuditoria(req, "salvar configurações SEI", alteradas.join(", "));
    }

    res.json({ message: "Configurações salvas com sucesso." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao salvar configurações." });
  }
});

/** Teste real de conexão com o SEI (aceita valores do formulário ainda não salvos). */
router.post("/testar-conexao", async (req: Request, res: Response) => {
  try {
    const { url, siglaSistema, identificacaoServico, idUnidade } = req.body || {};
    const overrides: Partial<SeiConfigEfetiva> = {};
    if (typeof url === "string" && url.trim()) overrides.url = url.trim();
    if (typeof siglaSistema === "string" && siglaSistema.trim()) overrides.siglaSistema = siglaSistema.trim();
    if (typeof identificacaoServico === "string" && identificacaoServico.trim() && identificacaoServico !== CHAVE_MASCARADA) {
      overrides.identificacaoServico = identificacaoServico.trim();
    }
    if (typeof idUnidade === "string" && idUnidade.trim()) overrides.idUnidade = idUnidade.trim();

    const resultado = await testarConexao(overrides);
    if (!resultado.ok) {
      res.status(422).json({ error: resultado.erro || "Falha ao contatar o SEI." });
      return;
    }
    res.json({ ok: true, unidades: resultado.unidades });
  } catch (error: any) {
    res.status(500).json({ error: `Erro ao testar conexão: ${error.message}` });
  }
});

// ---------------------------------------------------------------------------
// Sistema (visão geral operacional)
// ---------------------------------------------------------------------------

router.get("/sistema", async (_req: Request, res: Response) => {
  try {
    const [usuarios, usuariosAtivos, processos, syncLogs, auditLogs, chaveNoBanco] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.process.count(),
      prisma.syncLog.count(),
      prisma.auditLog.count(),
      prisma.configuration.findUnique({ where: { key: SEI_CONFIG_KEYS.identificacaoServico } }),
    ]);

    let tamanhoBanco: number | null = null;
    try {
      const caminho = env.DATABASE_URL.replace(/^file:/, "").replace(/^\.\//, "");
      for (const candidato of [join(process.cwd(), "prisma", caminho), join(process.cwd(), caminho)]) {
        try {
          tamanhoBanco = statSync(candidato).size;
          break;
        } catch {
          /* tenta o próximo */
        }
      }
    } catch {
      /* tamanho indisponível */
    }

    res.json({
      saude: "ok",
      node: process.version,
      banco: { caminho: env.DATABASE_URL, tamanhoBytes: tamanhoBanco },
      contagens: { usuarios, usuariosAtivos, processos, syncLogs, auditLogs },
      seiConfig: {
        url: seiConfig.url,
        siglaSistema: seiConfig.siglaSistema,
        idUnidade: seiConfig.idUnidade,
        chaveDefinida: Boolean(seiConfig.identificacaoServico),
        chaveOrigem: chaveNoBanco && chaveNoBanco.value ? "banco" : "env",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: `Erro ao montar visão do sistema: ${error.message}` });
  }
});

export default router;
