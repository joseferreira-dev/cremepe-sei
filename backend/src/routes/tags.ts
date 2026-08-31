import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar tags." });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;

    if (!name || !color) {
      res.status(400).json({ error: "Nome e cor são obrigatórios." });
      return;
    }

    const existing = await prisma.tag.findUnique({ where: { name } });
    if (existing) {
      res.status(409).json({ error: "Tag com esse nome já existe." });
      return;
    }

    const tag = await prisma.tag.create({ data: { name, color } });
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar tag." });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;

    const tag = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!tag) {
      res.status(404).json({ error: "Tag não encontrada." });
      return;
    }

    const updated = await prisma.tag.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(color && { color }) },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar tag." });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const tag = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!tag) {
      res.status(404).json({ error: "Tag não encontrada." });
      return;
    }

    await prisma.tag.delete({ where: { id: req.params.id } });
    res.json({ message: "Tag excluída com sucesso." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir tag." });
  }
});

export default router;
