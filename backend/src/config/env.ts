import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load backend .env first (server/auth/db settings)
config({ path: resolve(__dirname, "../.env") });
// Then load root .env (SEI + LLM credentials) as fallback
config({ path: resolve(__dirname, "../../.env") });

export const env = {
  SEI_URL: process.env.SEI_URL || "https://sei.cfm.org.br/sei/ws/SeiWS.php",
  SEI_SIGLA_SISTEMA: process.env.SEI_SIGLA_SISTEMA || "IntWeb",
  SEI_IDENTIFICACAO_SERVICO: process.env.SEI_IDENTIFICACAO_SERVICO || "",
  // Unidade padrão é opcional. Quando ausente (ou vazio), a busca de processos
  // é feita em todas as unidades CREMEPE retornadas por listarUnidades.
  SEI_ID_UNIDADE: process.env.SEI_ID_UNIDADE || "",

  LLM_PROVIDER: process.env.LLM_PROVIDER || "gemini",
  LLM_API_KEY: process.env.LLM_API_KEY || "",
  // Lista de modelos separada por vírgula (em ordem de preferência). A geração
  // tenta cada modelo, em sequência, até obter sucesso (fallback em caso de
  // limite de uso, indisponibilidade ou remoção do modelo).
  LLM_MODEL: process.env.LLM_MODEL
    || "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash",
  LLM_BASE_URL: process.env.LLM_BASE_URL || "",

  JWT_SECRET: process.env.JWT_SECRET || "cremepe-sei-dev-secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",

  LDAP_URL: process.env.LDAP_URL || "",
  LDAP_BASE_DN: process.env.LDAP_BASE_DN || "",
  LDAP_DOMAIN: process.env.LDAP_DOMAIN || "",

  HOST: process.env.HOST || "127.0.0.1",
  PORT: parseInt(process.env.PORT || "8000", 10),

  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
};
