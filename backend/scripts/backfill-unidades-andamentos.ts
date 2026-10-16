import "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";

type Unidade = { id: string; sigla: string; descricao: string };

/**
 * Repara `processes.unidades` vazias derivando-as dos andamentos já armazenados
 * (mesmo critério do fallback de `unidadesDeHistorico`). O id/descrição de cada
 * sigla é recuperado, quando possível, de processos que já possuem a unidade
 * com dados completos. Processos cujos andamentos não têm sigla ficam intactos.
 */
async function main() {
  const todos = await prisma.process.findMany({
    select: { id: true, numeroSei: true, unidades: true, andamentos: true },
  });

  const enriquecer = new Map<string, Unidade>();
  for (const p of todos) {
    try {
      for (const u of JSON.parse(p.unidades || "[]") as Unidade[]) {
        if (u?.sigla && u.id && !enriquecer.has(u.sigla)) {
          enriquecer.set(u.sigla, { id: u.id, sigla: u.sigla, descricao: u.descricao || "" });
        }
      }
    } catch { /* ignore */ }
  }

  let atualizados = 0;
  let semAndamentos = 0;
  const exemplos: string[] = [];

  for (const p of todos) {
    let unidades: Unidade[] = [];
    try { unidades = JSON.parse(p.unidades || "[]"); } catch { /* treat as empty */ }
    if (unidades.length > 0) continue;

    let andamentos: any[] = [];
    try { andamentos = JSON.parse(p.andamentos || "[]"); } catch { /* ignore */ }

    const mapa = new Map<string, Unidade>();
    for (const a of andamentos) {
      const sigla = typeof a?.unidade === "string" ? a.unidade.trim() : "";
      if (sigla && !mapa.has(sigla)) {
        mapa.set(sigla, enriquecer.get(sigla) || { id: "", sigla, descricao: "" });
      }
    }
    if (mapa.size === 0) { semAndamentos++; continue; }

    const derivadas = Array.from(mapa.values());
    await prisma.process.update({
      where: { id: p.id },
      data: { unidades: JSON.stringify(derivadas) },
    });
    atualizados++;
    if (exemplos.length < 5) {
      exemplos.push(`${p.numeroSei} -> ${derivadas.map((u) => u.sigla).join(", ")}`);
    }
  }

  console.log(`processos lidos: ${todos.length}`);
  console.log(`unidades atualizadas: ${atualizados}`);
  console.log(`sem sigla aproveitável nos andamentos (intactos): ${semAndamentos}`);
  for (const e of exemplos) console.log(`  exemplo: ${e}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
