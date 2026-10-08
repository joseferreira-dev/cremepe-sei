import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { authMiddleware } from "../middleware/auth.js";
import { ldapBind } from "../services/ldap.js";
import { buscarUnidadesDoUsuario, listarUnidades } from "../services/sei.js";
import { registrarAuditoria } from "../utils/audit.js";
import type { SignOptions } from "jsonwebtoken";

const { sign } = jwt;

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  try {
    const campo = String(req.body.email ?? req.body.usuario ?? "").trim();
    const password = req.body.password;

    if (!campo || !password) {
      res.status(400).json({ error: "Usuário e senha são obrigatórios." });
      return;
    }

    // O login é feito pelo USERNAME (sem @) — mesmo identificador para usuários locais e do AD.
    // Se digitado com "@", o e-mail é usado apenas como alias de consulta.
    const semArroba = !campo.includes("@");
    const tentativaAd = semArroba ? campo : campo.split("@")[0];

    const user = semArroba
      ? await prisma.user.findUnique({ where: { username: campo } })
      : await prisma.user.findUnique({ where: { email: campo } });

    if (user && user.authSource === "ad") {
      // A senha vem do AD: bind com o username (sAMAccountName) da conta
      const idAd = user.username;
      const ldapUser = await ldapBind(idAd, password);
      if (!ldapUser) {
        await registrarAuditoria(req, "login", user.email, `falha: credenciais do Active Directory inválidas (${idAd})`, { userId: user.id, userName: user.name });
        res.status(401).json({ error: "Credenciais inválidas." });
        return;
      }

      if (!user.active) {
        await registrarAuditoria(req, "login", user.email, "falha: conta desativada", { userId: user.id, userName: user.name });
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

      await registrarAuditoria(req, "login", user.email, `autenticação via Active Directory (${idAd})`, { userId: user.id, userName: ldapUser.displayName });

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
        await registrarAuditoria(req, "login", user.email, "falha: senha inválida", { userId: user.id, userName: user.name });
        res.status(401).json({ error: "Credenciais inválidas." });
        return;
      }

      if (!user.active) {
        await registrarAuditoria(req, "login", user.email, "falha: conta desativada", { userId: user.id, userName: user.name });
        res.status(403).json({ error: "Conta desativada. Contate o administrador." });
        return;
      }

      const token = sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
      );

      await registrarAuditoria(req, "login", user.email, "autenticação local", { userId: user.id, userName: user.name });

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

    // Conta ainda não cadastrada → primeiro acesso usando o username informado
    const ldapUser = await ldapBind(tentativaAd, password);
    if (!ldapUser) {
      await registrarAuditoria(req, "login", campo, "falha: usuário não encontrado ou credenciais do Active Directory inválidas", {
        userId: null,
        userName: campo,
      });
      res.status(401).json({ error: "Usuário não encontrado." });
      return;
    }

    // E-mail vem do AD (atributo mail); em caso de colisão, usa o padrão do órgão
    let emailNovo = ldapUser.mail || `${tentativaAd}@cremepe.org.br`;
    const emailEmUso = await prisma.user.findUnique({ where: { email: emailNovo } });
    if (emailEmUso) emailNovo = `${tentativaAd}@cremepe.org.br`;

    const newUser = await prisma.user.create({
      data: {
        name: ldapUser.displayName,
        email: emailNovo,
        passwordHash: "",
        authSource: "ad",
        username: tentativaAd,
        role: "assistente",
      },
    });

    try {
      const unidades = await buscarUnidadesDoUsuario(tentativaAd);
      for (const u of unidades) {
        await prisma.userUnit.create({
          data: { userId: newUser.id, unitId: u.IdUnidade, unitSigla: u.Sigla, unitDesc: u.Descricao },
        });
      }
      await prisma.user.update({ where: { id: newUser.id }, data: { unitsSyncedAt: new Date() } });
    } catch (e) {
      console.warn("[AUTH] Failed to sync units on first login:", e);
    }

      const token = sign(
        { userId: newUser.id, email: newUser.email, role: newUser.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
      );

      await registrarAuditoria(req, "login", newUser.email, `primeiro acesso via Active Directory (${tentativaAd}) — conta criada automaticamente`, {
        userId: newUser.id,
        userName: ldapUser.displayName,
      });

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

router.get("/usuario-atual", authMiddleware, async (req: Request, res: Response) => {
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

router.get("/perfil", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, name: true, email: true, role: true,
        authSource: true, username: true, active: true, createdAt: true, unitsSyncedAt: true,
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

router.put("/perfil", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const alterandoSenha = Boolean(currentPassword || newPassword);

    if (user.authSource === "ad") {
      if (alterandoSenha) {
        res.status(403).json({ error: "Usuários do Active Directory têm a senha controlada pelo AD e não podem alterá-la no sistema." });
        return;
      }
      if (name) {
        res.status(403).json({ error: "Usuários do Active Directory não podem alterar o nome via sistema." });
        return;
      }
      res.status(400).json({ error: "Nada para atualizar." });
      return;
    }

    // ---- Troca de senha (somente locais) ----
    if (alterandoSenha) {
      if (!currentPassword) {
        res.status(400).json({ error: "Informe a senha atual." });
        return;
      }
      if (!newPassword || String(newPassword).length < 8) {
        res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres." });
        return;
      }
      const senhaAtualOk = await bcrypt.compare(String(currentPassword), user.passwordHash);
      if (!senhaAtualOk) {
        res.status(400).json({ error: "Senha atual incorreta." });
        return;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(String(newPassword), 12) },
      });
      await registrarAuditoria(req, "alterar senha", user.email, "troca de senha pelo próprio usuário");
      res.json({ message: "Senha alterada com sucesso." });
      return;
    }

    // ---- Alteração de nome ----
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Nome é obrigatório." });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true, role: true, authSource: true, active: true, createdAt: true },
    });

    if (updated.name !== user.name) {
      await registrarAuditoria(req, "atualizar perfil", user.email, `nome: "${user.name}" → "${updated.name}"`);
    }

    res.json(updated);
  } catch (error) {
    console.error("[AUTH] Profile update error:", error);
    res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
});

router.post("/sincronizar-unidades", authMiddleware, async (req: Request, res: Response) => {
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
      const sigla = user.username;
      unidades = await buscarUnidadesDoUsuario(sigla);
    }

    for (const u of unidades) {
      await prisma.userUnit.create({
        data: { userId, unitId: u.IdUnidade, unitSigla: u.Sigla, unitDesc: u.Descricao },
      });
    }

    await prisma.user.update({ where: { id: userId }, data: { unitsSyncedAt: new Date() } });

    await registrarAuditoria(req, "sincronizar minhas unidades", user.email, `${unidades.length} unidade(s) via SEI`);
    res.json({ synced: unidades.length });
  } catch (error: any) {
    console.error("[AUTH] Sync units error:", error);
    res.status(500).json({ error: `Erro ao sincronizar unidades: ${error.message}` });
  }
});

/** Registra o encerramento da sessão na auditoria (o JWT segue válido até expirar). */
router.post("/logout", authMiddleware, async (req: Request, res: Response) => {
  await registrarAuditoria(req, "logout", req.user!.email, "sessão encerrada pelo usuário");
  res.json({ message: "Sessão encerrada." });
});

/** Estatísticas pessoais do usuário logado. */
router.get("/estatisticas", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const role = user?.role || "assistente";

    const units = await prisma.userUnit.findMany({ where: { userId } });
    const siglas = units.map((u) => u.unitSigla);

    // 1) Processos que o usuário consegue visualizar (mesma regra da listagem:
    //    admin/analista veem todos — inclusive restritos; assistente só as suas unidades)
    let whereAcesso: any = {};
    if (role === "assistente") {
      if (siglas.length === 0) {
        whereAcesso = { id: "__NO_ACCESS__" };
      } else {
        whereAcesso = { OR: siglas.map((s) => ({ unidades: { contains: `"sigla":"${s}"` } })) };
      }
    }

    // 2) Processos disponíveis para as unidades do usuário (qualquer papel)
    const condicoesUnidades = siglas.flatMap((s) => [
      { unidades: { contains: `"sigla":"${s}"` } },
      { unidadeAtual: { contains: `"sigla":"${s}"` } },
    ]);
    const whereUnidades =
      condicoesUnidades.length > 0 ? { OR: condicoesUnidades } : { id: "__SEM_UNIDADES__" };

    const [queTenhoAcesso, dasMinhasUnidades, anotacoes] = await Promise.all([
      prisma.process.count({ where: whereAcesso }),
      prisma.process.count({ where: whereUnidades }),
      prisma.annotation.count({ where: { userId } }),
    ]);

    res.json({ queTenhoAcesso, dasMinhasUnidades, anotacoes });
  } catch (error) {
    console.error("[AUTH] Estatísticas error:", error);
    res.status(500).json({ error: "Erro ao calcular estatísticas." });
  }
});

/** Últimas ações do próprio usuário registradas na auditoria (mesmas do log de auditoria). */
router.get("/atividades", authMiddleware, async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ logs });
  } catch (error) {
    console.error("[AUTH] Atividades error:", error);
    res.status(500).json({ error: "Erro ao buscar atividades." });
  }
});

export default router;
