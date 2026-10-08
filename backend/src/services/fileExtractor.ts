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
    case ".doc":
      return extrairDoc(filePath);
    case ".txt":
    case ".csv":
      return readFileSync(filePath, "utf-8");
    case ".xls":
    case ".xlsx":
      return extrairExcel(filePath);
    case ".odt":
      return extrairOdt(filePath);
    case ".jpg":
    case ".jpeg":
    case ".png":
    case ".gif":
    case ".bmp":
    case ".tiff":
    case ".webp":
      return `[Imagem ${ext} — extração de texto via OCR não disponível]`;
    default:
      return `[Arquivo ${ext} — extração não suportada]`;
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

async function extrairDoc(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const buffer = readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    if (result.value && result.value.trim()) {
      return result.value;
    }
  } catch {
    // mammoth não suporta .doc, tentar outra abordagem
  }

  try {
    const XLSX = await import("xlsx");
    const buffer = readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let texto = "";
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const dados = XLSX.utils.sheet_to_csv(sheet);
      if (dados.trim()) {
        texto += `\n--- Planilha: ${sheetName} ---\n${dados}\n`;
      }
    }
    if (texto.trim()) return texto;
  } catch {
    // não é um arquivo Excel
  }

  return "[Arquivo .doc — formato legado. Converta para .docx antes de enviar]";
}

async function extrairExcel(filePath: string): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  let texto = "";
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const dados = XLSX.utils.sheet_to_csv(sheet);
    if (dados.trim()) {
      texto += `\n--- Planilha: ${sheetName} ---\n${dados}\n`;
    }
  }
  return texto.trim() || "[Planilha vazia]";
}

async function extrairOdt(filePath: string): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buffer = readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const content = await zip.file("content.xml")?.async("text");
  if (!content) return "[Não foi possível ler o conteúdo do ODT]";
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
