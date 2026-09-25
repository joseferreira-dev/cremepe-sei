import type { Request } from "express";
import { prisma } from "../db/prisma.js";

export interface AutorAuditoria {
  /** `null` registra evento sem usuário (ex.: tentativa de login de conta desconhecida). */
  userId?: string | null;
  userName?: string;
}

/**
 * Registra uma ação no sistema na tabela `audit_logs`.
 *
 * Por padrão o autor vem do `req.user` (rotas autenticadas). Para eventos
 * anteriores à autenticação (login), passe `autor` explicitamente.
 * Best-effort: falha de gravação nunca interrompe a operação principal.
 */
export async function registrarAuditoria(
  req: Request,
  acao: string,
  alvo: string,
  detalhe = "",
  autor?: AutorAuditoria
): Promise<void> {
  try {
    let userId: string | null;
    let userName: string;

    if (autor && "userId" in autor) {
      userId = autor.userId ?? null;
      userName = autor.userName ?? alvo;
    } else if (req.user) {
      userId = req.user.userId;
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      userName = u?.name || req.user.email;
    } else {
      userId = null;
      userName = alvo;
    }

    await prisma.auditLog.create({
      data: { userId, userName, acao, alvo, detalhe },
    });
  } catch (e) {
    console.warn("[AUDIT] Falha ao registrar auditoria:", e);
  }
}
