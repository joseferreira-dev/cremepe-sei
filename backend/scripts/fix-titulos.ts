import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hasHtml(s: string): boolean {
  return (
    /<[^>]*>/.test(s) ||
    /&(?:lt|gt|amp|quot|#39|apos|nbsp|\#?\d+);/i.test(s)
  );
}

function cleanSeiText(s: string): string {
  let prev = '';
  let pass = 0;
  while (prev !== s && pass < 4) {
    prev = s;
    s = s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&amp;/g, '&');
    pass++;
  }
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const procs = await prisma.process.findMany({
    select: { id: true, numeroSei: true, especificacao: true, tipo: true, assuntos: true, interessados: true },
  });

  let total = 0;

  for (const p of procs) {
    const data: Record<string, any> = {};
    const mudancas: string[] = [];

    if (typeof p.especificacao === 'string' && hasHtml(p.especificacao)) {
      const novo = cleanSeiText(p.especificacao);
      if (novo !== p.especificacao) {
        data.especificacao = novo;
        mudancas.push('titulo');
      }
    }
    if (typeof p.tipo === 'string' && hasHtml(p.tipo)) {
      data.tipo = cleanSeiText(p.tipo);
      mudancas.push('tipo');
    }
    for (const campo of ['assuntos', 'interessados'] as const) {
      const v = p[campo];
      if (typeof v === 'string' && hasHtml(v)) {
        let arr: any[] = [];
        try { arr = JSON.parse(v); } catch { arr = []; }
        const novoArr = arr.map((item) => {
          const txt = typeof item === 'string' ? item : (item?.descricao ?? item?.nome);
          if (typeof txt === 'string' && hasHtml(txt)) {
            const limpo = cleanSeiText(txt);
            return typeof item === 'string' ? limpo : { ...item, descricao: limpo, nome: limpo };
          }
          return item;
        });
        const novoJson = JSON.stringify(novoArr);
        if (novoJson !== v) {
          data[campo] = novoJson;
          mudancas.push(campo);
        }
      }
    }

    if (mudancas.length > 0 && (data.especificacao !== undefined || data.tipo !== undefined)) {
      total++;
      console.log(`- ${p.numeroSei}`);
      if (data.especificacao !== undefined) {
        console.log(`    ANTES : ${p.especificacao}`);
        console.log(`    DEPOIS: ${data.especificacao}`);
      }
      if (data.tipo !== undefined) {
        console.log(`    TIPO antes : ${p.tipo}`);
        console.log(`    TIPO depois: ${data.tipo}`);
      }
      await prisma.process.update({ where: { id: p.id }, data });
    }
  }

  console.log(`\nTotal de títulos corrigidos: ${total}`);
}

main().finally(() => prisma.$disconnect());