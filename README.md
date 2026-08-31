# CREMEPE SEI

Sistema de Gestão Inteligente de Processos do **CREMEPE** (Conselho Regional de Medicina de Pernambuco), integrado ao **SEI** (Sistema Eletrônico de Informações) via WebService SOAP e com resumos gerados por **IA**.

## Tecnologias

- **Frontend**: React 19 + Vite 8 + TypeScript + Tailwind CSS v4
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + SQLite
- **Integrações**: WebService SOAP do SEI, API de LLM (Google Gemini) para resumos

## Estrutura do projeto

```
.
├── frontend/            # Aplicação web (React + Vite + Tailwind)
│   ├── src/             # Código-fonte (componentes, api, types)
│   ├── index.html       # HTML shell
│   ├── vite.config.ts   # Configuração do Vite
│   └── package.json     # Dependências e scripts do frontend
│
├── backend/             # API REST (Express + Prisma + SQLite)
│   ├── src/             # Código-fonte (rotas, serviços, middleware)
│   ├── prisma/          # Schema do banco e seed
│   └── package.json     # Dependências e scripts do backend
│
├── .env                 # Credenciais SEI + LLM (raiz)
└── README.md
```

## Pré-requisitos

- **Node.js** ≥ 20 (recomendado Node 22+)
- **pnpm** (ou npm) para gerenciar dependências
- Acesso ao WebService do SEI (credenciais em `.env`)
- Chave de API para o provedor de LLM (em `.env`)

## Configuração de ambiente

### 1. Variáveis de ambiente

Crie/edite os arquivos `.env` conforme os exemplos abaixo.

**`backend/.env`** (configuração do servidor e banco):

```env
# SEI WebService
SEI_URL=https://sei.cfm.org.br/sei/ws/SeiWS.php
SEI_SIGLA_SISTEMA=IntWeb
SEI_IDENTIFICACAO_SERVICO=<sua-chave-de-acesso>
SEI_ID_UNIDADE=110002083

# LLM
LLM_PROVIDER=gemini
LLM_API_KEY=<sua-api-key>
LLM_MODEL=gemini-2.5-flash
LLM_BASE_URL=

# Auth
JWT_SECRET=<segredo-jwt>
JWT_EXPIRES_IN=24h

# Server
HOST=127.0.0.1
PORT=8000

# Database (SQLite)
DATABASE_URL=file:./dev.db
```

**`.env`** (raiz) — pode conter as mesmas credenciais SEI/LLM como fallback; o backend carrega primeiro `backend/.env` e depois `.env` da raiz.

**`frontend/.env`** (opcional) — URL da API usada pelo frontend:

```env
VITE_API_URL=http://127.0.0.1:8000/api
```

Se não definida, o frontend usa `http://127.0.0.1:8000/api` por padrão.

### 2. Backend

```bash
cd backend
pnpm install

# Aplicar migrações e criar o banco (SQLite)
pnpm prisma migrate dev
# ou, se já houver migração:
pnpm prisma db push

# Executar o seed (usuários e tags iniciais)
pnpm prisma db seed

# Iniciar o servidor na porta 8000
pnpm dev
```

O seed cria o usuário administrador padrão:

- **E-mail**: `admin@cremepe.org.br`
- **Senha**: `admin123`

> ⚠️ Altere a senha do administrador em produção.

### 3. Frontend

```bash
cd frontend
pnpm install

# Rodar em desenvolvimento (hot reload)
pnpm dev
```

O frontend roda em `http://localhost:8443` (ou na porta definida em `PORT`).

Para produção:

```bash
cd frontend
pnpm build        # gera a pasta dist/
pnpm preview      # serve o build (porta 8443 por padrão)
```

## Scripts úteis

### Backend (`backend/`)

| Script                    | Descrição                                 |
| ------------------------- | ----------------------------------------- |
| `pnpm dev`                | Inicia o servidor em modo desenvolvimento |
| `pnpm build`              | Compila o TypeScript para`dist/`          |
| `pnpm start`              | Executa o build compilado                 |
| `pnpm prisma migrate dev` | Aplica migrações do banco                 |
| `pnpm prisma db seed`     | Popula o banco com dados iniciais         |

### Frontend (`frontend/`)

| Script         | Descrição                                |
| -------------- | ---------------------------------------- |
| `pnpm dev`     | Servidor de desenvolvimento (hot reload) |
| `pnpm build`   | Build de produção para`dist/`            |
| `pnpm preview` | Serve o build de produção localmente     |

## Como acessar

1. Inicie o backend (porta `8000`).
2. Inicie o frontend (porta `8443`).
3. Acesse `http://localhost:8443` no navegador.
4. Faça login com as credenciais do administrador.

## Funcionalidades

- **Autenticação JWT** com perfis (admin, protocolo, analista, gestor)
- **Consulta e importação de processos** do SEI via WebService SOAP (`consultarProcedimento`)
- **Importação em lote** de números de processo
- **Resumos executivos gerados por IA** a partir de documentos (PDF, DOCX, ODT, imagens)
- **Tags** para categorização de processos
- **Anotações** por usuário
- **Dashboard e relatórios** com gráficos
- **Administração** de usuários, logs de sincronização e configurações SEI

## Notas

- O WebService do SEI retorna **HTTP 500** para _SOAP faults_ (ex.: processo não encontrado); o backend converte isso em uma resposta de erro limpa.
- A consulta ao SEI é permitida apenas por **número de processo individual**; não há endpoint de listagem no SEI.
