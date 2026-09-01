import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { authMiddleware, adminOnly } from "../middleware/auth.js";
import { buscarUnidadesDoUsuario, listarUnidades } from "../services/sei.js";

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

// Users
router.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
      orderBy: { name: "asc" },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

router.post("/users", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, authSource } = req.body;

    if (!name || !email) {
      res.status(400).json({ error: "Nome e e-mail são obrigatórios." });
      return;
    }

    if (authSource !== "ad" && !password) {
      res.status(400).json({ error: "Senha é obrigatória para usuários locais." });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "E-mail já cadastrado." });
      return;
    }

    const passwordHash = authSource === "ad" ? "" : await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: role || "analista", authSource: authSource === "ad" ? "ad" : "local" },
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

router.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const { name, email, role, active, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const updateData: any = {};
    if (user.authSource === "ad") {
      if (name && name !== user.name) {
        res.status(403).json({ error: "Usuários do Active Directory não podem ter o nome alterado via sistema." });
        return;
      }
      if (email && email !== user.email) {
        res.status(403).json({ error: "Usuários do Active Directory não podem ter o e-mail alterado via sistema." });
        return;
      }
    } else {
      if (name) updateData.name = name;
      if (email) updateData.email = email;
    }
    if (role) updateData.role = role;
    if (typeof active === "boolean") updateData.active = active;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 12);

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    await prisma.userUnit.deleteMany({ where: { userId: req.params.id } });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: "Usuário excluído com sucesso." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

router.post("/users/:id/sync-units", async (req: Request, res: Response) => {
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
      const sigla = user.email.split("@")[0];
      unidades = await buscarUnidadesDoUsuario(sigla);
    }

    for (const u of unidades) {
      await prisma.userUnit.create({
        data: { userId: req.params.id, unitId: u.IdUnidade, unitSigla: u.Sigla, unitDesc: u.Descricao },
      });
    }

    res.json({ synced: unidades.length });
  } catch (error: any) {
    console.error("[ADMIN] Sync units error:", error);
    res.status(500).json({ error: `Erro ao sincronizar unidades: ${error.message}` });
  }
});

// Sync logs
router.get("/logs", async (req: Request, res: Response) => {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { executedAt: "desc" },
      take: 100,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar logs." });
  }
});

// Configurations
router.get("/config", async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.configuration.findMany();
    const result: Record<string, string> = {};
    configs.forEach((c) => { result[c.key] = c.value; });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar configurações." });
  }
});

router.put("/config", async (req: Request, res: Response) => {
  try {
    const configs = req.body;

    for (const [key, value] of Object.entries(configs)) {
      await prisma.configuration.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }

    res.json({ message: "Configurações salvas com sucesso." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao salvar configurações." });
  }
});

export default router;
