import { readFileSync } from "fs";
import { extname } from "path";

/**
 * Extrai o texto de um arquivo enviado.
 *
 * @param filePath Caminho do arquivo no disco (pode não ter extensão, pois o
 *                 multer renomeia para um nome temporário aleatório).
 * @param originalName Nome original do arquivo enviado (usado para detectar
 *                     a extensão quando `filePath` não a preserva).
 */
export async function extrairTexto(filePath: string, originalName?: string): Promise<string> {
  const ext = (extname(filePath) || extname(originalName || "") || "").toLowerCase();

  switch (ext) {
    case ".pdf":
      return extrairPdf(filePath);
    case ".docx":
      return extrairDocx(filePath);
    case ".txt":
      return readFileSync(filePath, "utf-8");
    default:
      return `[Arquivo ${ext} - extração não suportada]`;
  }
}

async function extrairPdf(filePath: string): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text || "";
}

async function extrairDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}
