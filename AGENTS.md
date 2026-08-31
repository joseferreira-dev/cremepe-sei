# cremepe-sei

Sistema de Gestão de Processos do CREMEPE: frontend em React + Vite + Tailwind CSS, backend em Node + Express + Prisma, integrado ao SEI via SOAP e IA (Gemini).

## Estrutura do projeto

- `frontend/` - Aplicação web (React, Vite, Tailwind CSS v4)
  - `frontend/src/main.tsx` - React entrypoint; importa `src/index.css` e monta `src/App.tsx` no `#root`
  - `frontend/src/App.tsx` - Componente principal da aplicação e ponto de partida usual para UI
  - `frontend/src/index.css` - Entrada global de CSS e import do Tailwind CSS v4
  - `frontend/index.html` - HTML shell do Vite com o `#root` e o script `src/main.tsx`
  - `frontend/package.json` - Dependências e scripts (dev, build, preview, format)
  - `frontend/vite.config.ts` - Config do Vite: React, Tailwind CSS v4 e alias `@` para `src`
  - `frontend/.mise.toml` - Versões do toolchain (Node.js e pnpm)
- `backend/` - API REST (Express + Prisma + SQLite), credenciais em `backend/.env`

## Dev server

Os servidores são iniciados manualmente. Veja o `README.md` na raiz.

## Styling

O projeto usa **Tailwind CSS v4** através do plugin `@tailwindcss/vite` configurado em `frontend/vite.config.ts`. `frontend/src/index.css` importa o Tailwind com `@import 'tailwindcss';`. Use utilitários do Tailwind diretamente no JSX e coloque CSS global ou customização de tema em `frontend/src/index.css`. Não há necessidade de arquivo de config do Tailwind nem PostCSS.

`frontend/src/main.tsx` importa `frontend/src/index.css`, então o ajuste de fontes globais pertence a esse arquivo. Mantenha os `@import` do CSS no topo, seguidos de regras `@font-face` e fontes padrão.