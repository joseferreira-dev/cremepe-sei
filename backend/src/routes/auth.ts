import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { authMiddleware } from "../middleware/auth.js";
import { ldapBind } from "../services/ldap.js";
import { buscarUnidadesDoUsuario, listarUnidades } from "../services/sei.js";
import type { SignOptions } from "jsonwebtoken";

const { sign } = jwt;

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "E-mail e senha são obrigatórios." });
      return;
    }

    const username = email.includes("@") ? email.split("@")[0] : email;

    const user = await prisma.user.findUnique({ where: { email: email.includes("@") ? email : `${email}@cremepe.org.br` } });

    if (user && user.authSource === "ad") {
      const ldapUser = await ldapBind(username, password);
      if (!ldapUser) {
        res.status(401).json({ error: "Credenciais inválidas." });
        return;
      }

      if (!user.active) {
        res.status(403).json({ error: "Conta desativada. Contate o administrador." });
        return;
      }

      if (user.name !== ldapUser.displayName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: ldapUser.displayName },
        });
      }

      const token = sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: ldapUser.displayName,
          email: user.email,
          role: user.role,
          authSource: "ad",
        },
      });
      return;
    }

    if (user && user.authSource === "local") {
      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        res.status(401).json({ error: "Credenciais inválidas." });
        return;
      }

      if (!user.active) {
        res.status(403).json({ error: "Conta desativada. Contate o administrador." });
        return;
      }

      const token = sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          authSource: "local",
        },
      });
      return;
    }

    const ldapUser = await ldapBind(username, password);
    if (!ldapUser) {
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    const newUser = await prisma.user.create({
      data: {
        name: ldapUser.displayName,
        email: `${username}@cremepe.org.br`,
        passwordHash: "",
        authSource: "ad",
        role: "assistente",
      },
    });

    try {
      const unidades = await buscarUnidadesDoUsuario(username);
      for (const u of unidades) {
        await prisma.userUnit.create({
          data: { userId: newUser.id, unitId: u.IdUnidade, unitSigla: u.Sigla, unitDesc: u.Descricao },
        });
      }
    } catch (e) {
      console.warn("[AUTH] Failed to sync units on first login:", e);
    }

    const token = sign(
      { userId: newUser.id, email: newUser.email, role: newUser.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
    );

    res.json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        authSource: "ad",
      },
    });
  } catch (error) {
    console.error("[AUTH] Login error:", error);
    res.status(500).json({ error: "Erro interno ao autenticar." });
  }
});

router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("[AUTH] Me error:", error);
    res.status(500).json({ error: "Erro interno ao buscar usuário." });
  }
});

router.get("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, name: true, email: true, role: true,
        authSource: true, active: true, createdAt: true,
        units: {
          select: { id: true, unitId: true, unitSigla: true, unitDesc: true },
          orderBy: { unitSigla: "asc" },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("[AUTH] Profile error:", error);
    res.status(500).json({ error: "Erro ao buscar perfil." });
  }
});

router.put("/profile", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    if (user.authSource === "ad") {
      res.status(403).json({ error: "Usuários do Active Directory não podem alterar o nome via sistema." });
      return;
    }

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Nome é obrigatório." });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
    });

    res.json(updated);
  } catch (error) {
    console.error("[AUTH] Profile update error:", error);
    res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
});

router.post("/sync-units", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    await prisma.userUnit.deleteMany({ where: { userId } });

    let unidades;
    if (user.role === "admin") {
      unidades = await listarUnidades();
    } else {
      const sigla = user.email.split("@")[0];
      unidades = await buscarUnidadesDoUsuario(sigla);
    }

    for (const u of unidades) {
      await prisma.userUnit.create({
        data: { userId, unitId: u.IdUnidade, unitSigla: u.Sigla, unitDesc: u.Descricao },
      });
    }

    res.json({ synced: unidades.length });
  } catch (error: any) {
    console.error("[AUTH] Sync units error:", error);
    res.status(500).json({ error: `Erro ao sincronizar unidades: ${error.message}` });
  }
});

router.get("/sei-unidades", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const unidades = await listarUnidades();
    res.json({
      unidades: unidades.map((u) => ({
        id: u.IdUnidade,
        sigla: u.Sigla,
        descricao: u.Descricao,
      })),
    });
  } catch (error: any) {
    console.error("[AUTH] Listar unidades SEI error:", error);
    res.status(500).json({ error: `Erro ao listar unidades do SEI: ${error.message}` });
  }
});

export default router;
