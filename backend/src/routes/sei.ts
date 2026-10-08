import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { listarUnidades } from "../services/sei.js";

const router = Router();
router.use(authMiddleware);

// Retorna as unidades CREMEPE acessíveis ao serviço (para filtro de busca).
router.get("/unidades", async (_req, res) => {
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
    console.error("[SEI] Listar unidades error:", error);
    res.status(500).json({ error: `Erro ao listar unidades do SEI: ${error.message}` });
  }
});

export default router;
