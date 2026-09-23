import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hasHtml(s: string): boolean {
  return (
    /<[^>]*>/.test(s) ||
    /&(?:lt|gt|amp|quot|#39|apos|nbsp);/i.test(s)
  );
}

function cleanSeiText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Fix {
  numeroSei: string;
  andamentos: number;
  ultimoAndamento: boolean;
}

async function main() {
  const procs = await prisma.process.findMany({
    select: { id: true, numeroSei: true, andamentos: true, ultimoAndamento: true },
  });

  const fixes: Fix[] = [];

  for (const p of procs) {
    let changed = false;
    let andamentoFixCount = 0;
    let ultimoChanged = false;

    let andamentos: any[] = [];
    try { andamentos = JSON.parse(p.andamentos || '[]'); } catch { andamentos = []; }
    const andamentosNovos = andamentos.map((a) => {
      if (a && typeof a.descricao === 'string' && hasHtml(a.descricao)) {
        changed = true;
        andamentoFixCount++;
        return { ...a, descricao: cleanSeiText(a.descricao) };
      }
      return a;
    });

    let ultimo: any = null;
    if (p.ultimoAndamento) {
      try { ultimo = JSON.parse(p.ultimoAndamento); } catch { ultimo = null; }
    }
    let ultimoNovo: any = ultimo;
    if (ultimo && typeof ultimo.descricao === 'string' && hasHtml(ultimo.descricao)) {
      changed = true;
      ultimoChanged = true;
      ultimoNovo = { ...ultimo, descricao: cleanSeiText(ultimo.descricao) };
    }

    if (changed) {
      await prisma.process.update({
        where: { id: p.id },
        data: {
          andamentos: JSON.stringify(andamentosNovos),
          ultimoAndamento: ultimoNovo ? JSON.stringify(ultimoNovo) : p.ultimoAndamento,
        },
      });
      fixes.push({ numeroSei: p.numeroSei, andamentos: andamentoFixCount, ultimoAndamento: ultimoChanged });
    }
  }

  console.log(`Total de processos corrigidos: ${fixes.length}`);
  for (const f of fixes) {
    const partes = [
      ...(f.ultimoAndamento ? ['ultimo andamento'] : []),
      ...(f.andamentos > 0 ? [`${f.andamentos} andamento(s)`] : []),
    ];
    console.log(`- ${f.numeroSei}  ->  ${partes.length ? partes.join(', ') : '-'}`);
  }
}

main().finally(() => prisma.$disconnect());