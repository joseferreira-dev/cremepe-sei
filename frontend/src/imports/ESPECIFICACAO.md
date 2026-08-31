# Especificação do Sistema **CREMEPE SEI**  
Sistema Web para Gestão Inteligente de Processos no SEI  

---

## Sumário

1. [Visão Geral](#1-visão-geral)  
2. [Objetivos e Benefícios](#2-objetivos-e-benefícios)  
3. [Público-Alvo e Perfis de Usuário](#3-público-alvo-e-perfis-de-usuário)  
4. [Requisitos Funcionais](#4-requisitos-funcionais)  
5. [Requisitos Não Funcionais](#5-requisitos-não-funcionais)  
6. [Arquitetura Proposta](#6-arquitetura-proposta)  
7. [Modelo de Dados](#7-modelo-de-dados)  
8. [Fluxos de Uso](#8-fluxos-de-uso)  
9. [Especificação das Telas (UI)](#9-especificação-das-telas-ui)  
10. [Integração com o SEI – WebService SOAP](#10-integração-com-o-sei--webservice-soap)  
11. [Integração com IA – Google Gemini](#11-integração-com-ia--google-gemini)  
12. [API Backend (Node.js) – Endpoints Planejados](#12-api-backend-nodejs--endpoints-planejados)  
13. [Segurança e Autenticação](#13-segurança-e-autenticação)  
14. [Plano de Implementação e Próximos Passos](#14-plano-de-implementação-e-próximos-passos)  

---

## 1. Visão Geral

O **CREMEPE SEI** é um sistema web auxiliar que visa otimizar a gestão de processos do Conselho Regional de Medicina de Pernambuco (CREMEPE), integrando-se ao Sistema Eletrônico de Informações (SEI) utilizado pelo órgão.

A ferramenta resolve três dores principais:

- **Encaminhamento incorreto** – com resumos gerados por IA, o usuário rapidamente entende o assunto do processo e decide o setor correto.
- **Acúmulo de documentos** – o resumo automático sintetiza o conteúdo essencial, agilizando a análise inicial.
- **Busca ineficiente** – o sistema oferece busca avançada por palavras‑chave, assuntos, interessados, setores, datas, etc., além de filtros personalizados.

Para contornar a limitação da API do SEI (que não permite listar processos), o sistema permitirá:

- Cadastro **manual** de um processo (número do SEI) para busca e indexação.
- **Importação em lote** via arquivo CSV/planilha com uma lista de números de processo.
- Sincronização periódica ou sob demanda para atualizar o status e andamentos.

---

## 2. Objetivos e Benefícios

| Objetivo | Benefício |
|----------|-----------|
| Reduzir erros de encaminhamento | Resumo gerado por IA orienta o setor correto |
| Acelerar a triagem de processos | Visualização rápida do conteúdo, sem abrir centenas de documentos |
| Melhorar a busca | Filtros e palavras‑chave extraídas do resumo e metadados |
| Centralizar anotações e histórico | Acompanhamento do processo em um só lugar, com observações internas |
| Sincronizar com o SEI | Status sempre atualizado (unidade atual, andamento, etc.) |

---

## 3. Público-Alvo e Perfis de Usuário

- **Administrador do Sistema** – configura integração com SEI, gerencia usuários, visualiza logs.
- **Servidor do Protocolo** – cadastra novos processos, faz upload de documentos iniciais, gera resumos.
- **Servidor de Setor (análise)** – consulta processos, faz anotações, sugere encaminhamento.
- **Gestor/Coordenador** – acompanha métricas, relatórios, pendências.

**Todos os perfis** acessam o sistema com login e senha (autenticação própria, separada do SEI).

---

## 4. Requisitos Funcionais

### 4.1. Gestão de Processos
- RF01 – Cadastrar processo manualmente informando número SEI.
- RF02 – Importar lista de processos via arquivo `.csv` ou `.xlsx`.
- RF03 – Buscar dados do processo no SEI via WebService (consultarProcedimento).
- RF04 – Armazenar localmente: número, tipo, especificação, interessados, assuntos, unidade atual, andamento, etc.
- RF05 – Sincronizar manualmente um processo para atualizar seus dados do SEI.
- RF06 – Agendar sincronização automática (diária/semanal) para todos os processos ativos.
- RF07 – Listar processos com paginação, ordenação e filtros.
- RF08 – Visualizar detalhes de um processo (dados SEI + resumo IA + anotações).

### 4.2. Upload de Documentos e Resumo por IA
- RF09 – Permitir upload de **múltiplos arquivos** (PDF, DOCX, ODT, imagens, etc.) associados a um processo.
- RF10 – Os arquivos são temporários (não armazenados permanentemente) – após processamento, são deletados.
- RF11 – Extrair texto dos arquivos (OCR se necessário) e enviar ao **Google Gemini** para gerar um resumo executivo do processo.
- RF12 – Exibir o resumo gerado na tela de detalhes do processo.
- RF13 – Permite regenerar o resumo (caso o usuário julgue necessário).

### 4.3. Anotações e Acompanhamento
- RF14 – Adicionar anotações (com data/hora e autor) em cada processo.
- RF15 – Editar/excluir anotações próprias (administradores podem excluir todas).
- RF16 – Marcar processo como “finalizado” ou “pendente de ação”.
- RF17 – Associar etiquetas/tags para categorização (ex: "Urgente", "Análise Jurídica", "Recurso").

### 4.4. Busca e Filtros
- RF18 – Busca textual por número, especificação, interessados, assuntos, conteúdo do resumo.
- RF19 – Filtros combinados: unidade atual, tipo de processo, data de autuação, status, tags, etc.
- RF20 – Salvamento de filtros favoritos.

### 4.5. Relatórios e Dashboards
- RF21 – Dashboard com indicadores: total de processos, por setor, por status, processos sem resumo, etc.
- RF22 – Exportar lista filtrada para CSV/Excel.

### 4.6. Administração
- RF23 – Gerenciar usuários (criar, editar, desativar, atribuir perfis).
- RF24 – Configurar credenciais de acesso ao SEI (SiglaSistema, IdentificacaoServico, IdUnidade padrão).
- RF25 – Log de ações (auditoria).

---

## 5. Requisitos Não Funcionais

- **Usabilidade** – Interface intuitiva, responsiva (acesso via desktop e tablet).
- **Desempenho** – Respostas rápidas (até 2s para listagens, até 5s para resumo IA).
- **Segurança** – Autenticação com JWT, senhas hasheadas, HTTPS obrigatório.
- **Confiabilidade** – Tratamento de erros de integração com SEI (timeout, indisponibilidade).
- **Manutenibilidade** – Código modular (React + Node), documentação.
- **Escalabilidade** – Preparado para crescer em número de processos e usuários.
- **Conformidade** – Respeitar LGPD (dados pessoais dos interessados são tratados com cuidado).

---

## 6. Arquitetura Proposta

### 6.1. Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | React + TypeScript + Vite |
| **UI Library** | Material-UI (MUI) ou Chakra UI (escolha por consistência) |
| **Gerenciamento de Estado** | React Query (para dados do servidor) + Zustand (para estado global) |
| **Backend** | Node.js + Express + TypeScript |
| **Banco de Dados** | PostgreSQL (ou MySQL) – via Prisma ORM |
| **Integração SEI** | SOAP Client (`soap` ou `axios` com XML manual) |
| **IA** | Google Gemini API (modelo `gemini-1.5-flash` ou `pro`) |
| **Processamento de Documentos** | `pdf-parse`, `mammoth.js` (DOCX), `node-odt` (ODT), `tesseract.js` (OCR opcional) |
| **Autenticação** | JWT (JSON Web Tokens) + Bcrypt |
| **Armazenamento Temporário** | Sistema de arquivos local (pasta `/tmp`) ou bucket S3 efêmero |
| **Agendamento** | `node-cron` para sincronização automática |
| **Ambiente** | Docker (para desenvolvimento e produção) |

### 6.2. Diagrama de Componentes (Visão Geral)

```
[Frontend React] 
       │
       ▼
 [API Gateway/Express] 
       │
  ┌────┴────┬─────────────┐
  ▼         ▼             ▼
[BD]   [SEI SOAP]   [Gemini API]
```

- O backend orquestra todas as chamadas externas e processa os dados.
- O frontend consome endpoints REST (JSON).

---

## 7. Modelo de Dados

### 7.1. Entidades Principais

#### `users`
- `id` (UUID, PK)
- `name` (string)
- `email` (string, unique)
- `password_hash` (string)
- `role` (enum: `admin`, `protocolo`, `analista`, `gestor`)
- `created_at`, `updated_at`

#### `processes`
- `id` (UUID, PK)
- `numero_sei` (string, unique) – formato `XX.XX.XXXXXXXX-X`
- `id_tipo_procedimento` (string, vindo do SEI)
- `especificacao` (text)
- `data_autuacao` (date)
- `nivel_acesso` (string)
- `id_hipotese_legal` (string)
- `assuntos` (JSON array ou relacionamento 1:N)
- `interessados` (JSON array)
- `unidade_atual` (JSON: `{ id, sigla, descricao }`)
- `ultimo_andamento` (JSON: `{ descricao, dataHora, usuario, unidade }`)
- `status_sistema` (enum: `em_analise`, `finalizado`, `pendente`, `sobrestado`) – gerido pelo usuário
- `resumo_ia` (text) – resumo gerado pela IA
- `resumo_gerado_em` (timestamp)
- `upload_temp_id` (string) – identificador da sessão de upload (opcional)
- `sincronizado_em` (timestamp)
- `created_at`, `updated_at`

#### `annotations`
- `id` (UUID, PK)
- `process_id` (FK → processes.id)
- `user_id` (FK → users.id)
- `content` (text)
- `created_at`, `updated_at`

#### `tags`
- `id` (UUID, PK)
- `name` (string, unique)
- `color` (string, hex)

#### `process_tags` (relacionamento N:N)
- `process_id` (FK)
- `tag_id` (FK)

#### `sync_logs`
- `id` (UUID, PK)
- `process_id` (FK → processes.id, opcional)
- `tipo` (enum: `manual`, `batch`, `auto`)
- `status` (enum: `success`, `error`)
- `mensagem` (text)
- `executed_at` (timestamp)

#### `configurations`
- `id` (UUID, PK)
- `key` (string, unique) – ex: `sei_sigla_sistema`, `sei_identificacao_servico`, `sei_id_unidade_padrao`
- `value` (text)
- `updated_at`

### 7.2. Relacionamentos

- Um processo pode ter várias anotações.
- Um processo pode ter várias tags.
- Um usuário pode criar várias anotações.
- Logs de sincronização associados a processos (ou nulos para batch geral).

---

## 8. Fluxos de Uso

### 8.1. Cadastro e Resumo de Processo (Fluxo Principal)

1. Usuário loga no sistema.
2. Acessa tela "Novo Processo".
3. Opção:
   - **Cadastro manual**: informa o número do SEI.
   - **Importação em lote**: anexa arquivo `.csv` com números ou inserir em uma caixa de texto para coletar os números do processos (ex: 26.17.000009307-5, 25.17.000007966-2, etc).
1. Sistema valida o número e chama `consultarProcedimento` no SEI.
2. Se encontrado, persiste os metadados básicos.
3. Usuário é redirecionado para a tela de detalhes do processo.
4. Na tela de detalhes, há um botão **"Gerar Resumo com IA"**.
5. Ao clicar, o sistema solicita que o usuário faça upload dos arquivos iniciais (PDF, etc.).
6. Após upload, os arquivos são processados (extração de texto).
7. O texto extraído é enviado para Gemini com um prompt adequado.
8. O resumo retornado é salvo no campo `resumo_ia` e exibido.
9. Os arquivos temporários são deletados.

### 8.2. Sincronização com SEI

- **Manual**: na lista de processos, um ícone "Atualizar" dispara `consultarProcedimento` para aquele processo e atualiza os campos locais.
- **Automática**: um job cron (ex: diário às 2h) percorre todos os processos ativos e atualiza seus dados.

### 8.3. Busca e Filtragem

- Barra de pesquisa global (texto livre).
- Painel lateral com filtros avançados (unidade, tipo, data, tags, status).
- Resultados exibidos em tabela com colunas: número, especificação, interessados, unidade atual, status, resumo (primeiras palavras).

### 8.4. Anotações e Encaminhamento

- Na tela de detalhes, área de anotações (feed cronológico).
- Usuário pode adicionar sugestão de encaminhamento ("Este processo deve ir para a Diretoria Técnica").

---

## 9. Especificação das Telas (UI)

A seguir, a descrição detalhada de cada tela do sistema.

---

### 9.1. Tela de Login

**Objetivo**: Autenticar o usuário.

**Layout**:
- Centralizado, com fundo suave (cor institucional do CREMEPE – azul/verde).
- Logo do CREMEPE no topo.
- Campos: **E-mail**, **Senha**, checkbox "Lembrar-me".
- Botão "Entrar" (primário).
- Link "Esqueceu a senha?".
- Rodapé com versão do sistema.

**Interações**:
- Validação em tempo real (e-mail válido, senha não vazia).
- Ao submeter, chama API `/auth/login`.
- Em caso de erro, exibe mensagem abaixo do formulário.

---

### 9.2. Tela Principal (Dashboard)

**Objetivo**: Visão geral dos processos e atalhos.

**Layout**:
- **Menu lateral esquerdo** (colapsável):
  - Ícone + texto: Dashboard, Processos, Novo Processo, Importar, Sincronizar, Anotações, Tags, Relatórios, Administração (apenas admin), Sair.
- **Área principal**:
  - Cards com KPIs: Total de Processos, Processos sem Resumo, Pendentes, Finalizados.
  - Gráfico simples (ex: barras com processos por setor/unidade).
  - Lista dos 5 últimos processos cadastrados.
  - Botão "Ver todos os processos".

**Interações**:
- KPIs clicáveis direcionam para lista com filtro pré-aplicado.
- Gráficos interativos (ex: Chart.js).

---

### 9.3. Tela "Meus Processos" (Listagem)

**Objetivo**: Visualizar, filtrar e gerenciar processos.

**Layout**:
- Topo: barra de pesquisa global (campo de texto com ícone de lupa).
- Abaixo: botões "Novo Processo", "Importar Lote", "Sincronizar Selecionados".
- Painel de filtros (expansível à direita ou acima da tabela):
  - Unidade atual (select com todas as unidades conhecidas)
  - Tipo de processo (select)
  - Data de autuação (range)
  - Status (checkboxes)
  - Tags (multi-select)
  - "Aplicar filtros" e "Limpar".
- Tabela com colunas:
  - [ ] Checkbox para seleção
  - Número SEI (link para detalhes)
  - Especificação
  - Interessados (resumido)
  - Unidade atual
  - Status do sistema (badge colorido)
  - Resumo (prévia de até 100 caracteres)
  - Data de autuação
  - Ações: ícone de sincronizar, ícone de excluir (admin).
- Paginação (10, 25, 50 por página).

**Interações**:
- Clique no número do processo navega para tela de detalhes.
- Seleção múltipla permite ações em lote (ex: sincronizar, aplicar tag).
- Ordenação por coluna (clicando no cabeçalho).

---

### 9.4. Tela "Detalhes do Processo"

**Objetivo**: Visualizar todas as informações do processo, resumo IA, anotações e ações.

**Layout**:
- Cabeçalho com número do processo, especificação, status (badge).
- Abas:
  1. **Dados SEI** – exibe todos os campos retornados pela API (formatação limpa):
     - Tipo, Data de autuação, Nível de acesso, Assuntos (lista), Interessados (lista), Unidade atual, Último andamento (com data/hora).
  2. **Resumo IA** – exibe o resumo gerado. Botão "Gerar/Regenerar Resumo" (abre modal de upload).
  3. **Anotações** – feed com anotações (mais recente primeiro), campo de texto para adicionar nova, botão "Salvar".
  4. **Tags** – gerenciar tags associadas (adicionar/remover).
- Barra de ações superior:
  - "Sincronizar com SEI" (atualiza dados)
  - "Marcar como Finalizado" / "Reabrir"
  - "Excluir" (admin)

**Modal de Upload para Resumo**:
- Título: "Envie os documentos iniciais para gerar o resumo".
- Área de drag-and-drop para múltiplos arquivos.
- Lista de arquivos selecionados com tamanho e ícone.
- Botão "Gerar Resumo".
- Progresso (barra) durante o processamento.
- Ao final, fecha modal e atualiza aba "Resumo IA".

**Interações**:
- Ao adicionar anotação, recarrega a lista.
- Tags: autocomplete com tags existentes + criar nova.

---

### 9.5. Tela "Novo Processo" (Cadastro Manual)

**Objetivo**: Adicionar um processo individual.

**Layout**:
- Formulário centralizado:
  - Campo "Número do Processo SEI" (formato `XX.XX.XXXXXXXX-X`).
  - Botão "Buscar no SEI" – ao clicar, chama a API de consulta e preenche os dados automaticamente (caso encontre).
  - Se encontrado, exibe os dados retornados em um preview (não editáveis).
  - Botão "Cadastrar" – salva no banco.
- Se não encontrado, exibe mensagem de erro.

**Interações**:
- Validação do número com máscara (Regex).
- Ao buscar, mostrar loading.
- Após cadastro, redireciona para a tela de detalhes.

---

### 9.6. Tela "Importar Lote"

**Objetivo**: Cadastrar vários processos de uma só vez.

**Layout**:
- Instruções: "Faça upload de um arquivo CSV ou Excel com uma coluna chamada 'numero_sei'".
- Botão "Escolher arquivo" e "Enviar".
- Após envio, o sistema processa em background (exibe progresso em barra).
- Ao final, mostra relatório: quantos foram importados com sucesso, quantos falharam (com motivo).
- Botão "Baixar relatório de falhas" (CSV).

---

### 9.7. Tela "Tags" (Gerenciamento)

**Objetivo**: Criar, editar e excluir tags.

**Layout**:
- Lista de tags com nome e cor (círculo colorido).
- Botão "Nova Tag" – modal com campos "Nome" e "Cor" (seletor de cores).
- Ações: editar (lápis), excluir (lixeira).

---

### 9.8. Tela "Administração" (apenas admin)

**Objetivo**: Configurações do sistema.

**Layout**:
- Submenu:
  - Usuários
  - Configurações SEI
  - Logs

**Usuários**:
- Tabela com nome, email, papel, status (ativo/inativo).
- Botão "Novo Usuário" – modal com campos: nome, email, senha, papel.
- Ações: editar, desativar/reativar, excluir.

**Configurações SEI**:
- Formulário com campos:
  - SiglaSistema
  - IdentificacaoServico
  - IdUnidade (padrão)
  - URL do WSDL (ex: `https://sei.cremepe.org.br/sei/controlador_ws.php?servico=sei`)
- Botão "Testar Conexão" – faz uma chamada de teste.
- Botão "Salvar".

**Logs**:
- Tabela com data/hora, tipo (sincronização, erro), mensagem, processo relacionado (se houver).
- Filtros por data e tipo.

---

### 9.9. Tela "Relatórios"

**Objetivo**: Visualizar dados consolidados e exportar.

**Layout**:
- Filtros: período, setor, status.
- Gráficos (barras, pizza) e tabela de dados.
- Botão "Exportar CSV".

---

## 10. Integração com o SEI – WebService SOAP

### 10.1. Serviços Utilizados

Os serviços disponíveis (conforme documentação) que serão usados:

- **`consultarProcedimento`** – para obter todos os dados de um processo.
- **`listarUnidades`** – para popular combos de unidade (cache local).
- **`listarTiposProcedimento`** – para popular combos de tipo (opcional).
- **`listarAndamentos`** – se necessário obter histórico completo (mas o `consultarProcedimento` já retorna o último andamento).

### 10.2. Exemplo de Chamada (Node.js)

Usaremos a biblioteca `soap` (https://www.npmjs.com/package/soap) para facilitar.

```javascript
const soap = require('soap');

async function consultarProcesso(numeroSei) {
  const url = 'https://sei.cremepe.org.br/sei/controlador_ws.php?servico=sei';
  const client = await soap.createClientAsync(url);
  
  const args = {
    SiglaSistema: 'CREMEPE_SISTEMA', // vindo da configuração
    IdentificacaoServico: 'CHAVE_DE_ACESSO_AQUI', // vindo da configuração
    IdUnidade: '110002092',
    ProtocoloProcedimento: numeroSei,
    SinRetornarAssuntos: 'S',
    SinRetornarInteressados: 'S',
    SinRetornarObservacoes: 'S',
    SinRetornarAndamentoGeracao: 'S',
    SinRetornarAndamentoConclusao: 'S',
    SinRetornarUltimoAndamento: 'S',
    SinRetornarUnidadesProcedimentoAberto: 'S',
    SinRetornarProcedimentosRelacionados: 'S',
    SinRetornarProcedimentosAnexados: 'S'
  };

  const [result] = await client.consultarProcedimentoAsync(args);
  // Processar result (estrutura SaidaConsultarProcedimentoAPI)
  return result;
}
```

**Tratamento de erros**: Capturar exceções de timeout, “processo não encontrado”, etc.

### 10.3. Sincronização

- O backend mantém uma tabela `processes` com os dados locais.
- Ao sincronizar, chama `consultarProcedimento` e atualiza os campos (unidade atual, último andamento, etc.).
- Guarda o timestamp da última sincronização.

---

## 11. Integração com IA – Google Gemini

### 11.1. Pipeline de Geração de Resumo

1. **Upload dos arquivos** – recebidos via `multipart/form-data`.
2. **Armazenamento temporário** – em uma pasta `/tmp/uploads/<uuid>`.
3. **Extração de texto**:
   - PDF: `pdf-parse` ou `pdf2json`.
   - DOCX: `mammoth.js` extrai texto.
   - ODT: `odt` parser.
   - Imagens: `tesseract.js` (OCR) – opcional.
   - Se falhar, usa fallback para extração via `pdftotext` (se disponível).
4. **Concatenação do texto** de todos os arquivos.
5. **Preparação do prompt para Gemini**:

```
"Você é um assistente especializado em processos administrativos. 
Resuma o seguinte conjunto de documentos de um processo, destacando:
- Assunto principal
- Partes envolvidas (interessados)
- Demandas ou solicitações
- Decisões preliminares (se houver)
- Urgência ou prazos relevantes

Documentos:
<texto extraído>
"

Resumo:
```

6. **Chamada à API Gemini** (modelo `gemini-1.5-pro` para melhor qualidade, ou `flash` para velocidade).

```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

async function gerarResumo(texto) {
  const prompt = `... ${texto} ...`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}
```

7. **Salvar resumo** no banco e deletar os arquivos temporários.

### 11.2. Considerações

- Tamanho do texto: Gemini aceita até 1M tokens. Para documentos muito longos, pode-se truncar ou resumir por partes.
- Caso o usuário não tenha feito upload, o resumo não é gerado.
- O resumo fica armazenado para consultas futuras.

---

## 12. API Backend (Node.js) – Endpoints Planejados

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Autenticação → JWT |
| POST | `/auth/logout` | Logout (invalida token no client) |
| GET | `/auth/me` | Retorna dados do usuário logado |
| GET | `/processes` | Lista processos (com paginação, filtros) |
| GET | `/processes/:id` | Detalhes de um processo |
| POST | `/processes` | Cadastra um novo processo (manual) |
| POST | `/processes/import` | Importa em lote (upload CSV) |
| PUT | `/processes/:id` | Atualiza dados do processo (status, tags) |
| POST | `/processes/:id/sync` | Sincroniza com SEI (consulta e atualiza) |
| DELETE | `/processes/:id` | Exclui processo (admin) |
| POST | `/processes/:id/resumo` | Gera resumo via IA (upload de arquivos) |
| GET | `/processes/:id/resumo` | Obtém o resumo gerado |
| POST | `/processes/:id/annotations` | Adiciona anotação |
| GET | `/processes/:id/annotations` | Lista anotações |
| DELETE | `/annotations/:id` | Exclui anotação |
| GET | `/tags` | Lista tags |
| POST | `/tags` | Cria tag |
| PUT | `/tags/:id` | Atualiza tag |
| DELETE | `/tags/:id` | Exclui tag |
| GET | `/unidades` | Lista unidades (cache do SEI) |
| GET | `/tipos` | Lista tipos de processo (cache) |
| POST | `/admin/users` | Cria usuário (admin) |
| GET | `/admin/users` | Lista usuários |
| PUT | `/admin/users/:id` | Atualiza usuário |
| DELETE | `/admin/users/:id` | Exclui usuário |
| GET | `/admin/config` | Obtém configurações SEI |
| PUT | `/admin/config` | Atualiza configurações |
| POST | `/admin/sync-all` | Dispara sincronização em lote (manual) |
| GET | `/reports` | Gera relatório (filtros) |

---

## 13. Segurança e Autenticação

- **JWT** – token armazenado no `localStorage` (ou cookie seguro com HttpOnly, idealmente).
- **Senhas** – hashing com bcrypt.
- **Permissões** – cada rota verifica o papel do usuário (admin, protocolo, analista, gestor).
- **CORS** – configurado para aceitar apenas origens autorizadas.
- **HTTPS** – obrigatório em produção.
- **Sanitização** – entradas de usuário (upload de arquivos) validadas (extensões, tamanho).
- **Logs de acesso** – registrar ações críticas.

---

## 14. Plano de Implementação e Próximos Passos

### Fase 1 – Levantamento e Definição (atual)
- Validação da especificação com a equipe.
- Criação de protótipos de interface (seguindo o descrito).

### Fase 2 – Configuração do Ambiente
- Repositório Git (front/back).
- Configuração do banco (modelo Prisma).
- Configuração das credenciais SEI e Gemini em variáveis de ambiente.

### Fase 3 – Desenvolvimento do Backend (Node.js)
- Implementar autenticação.
- Implementar integração SOAP com SEI (consultarProcedimento).
- Implementar endpoints básicos de CRUD de processos.
- Implementar importação em lote.
- Implementar geração de resumo (upload + extração + Gemini).

### Fase 4 – Desenvolvimento do Frontend (React)
- Estrutura de roteamento (React Router).
- Telas de login, dashboard, listagem, detalhes, cadastro.
- Integração com a API backend.
- Implementar upload de arquivos com progresso.

### Fase 5 – Sincronização Automática
- Configurar job cron (`node-cron`) para rodar diariamente.

### Fase 6 – Testes e Ajustes
- Testes manuais de integração com SEI real.
- Ajustes de UI/UX.
- Testes de carga.

### Fase 7 – Implantação
- Dockerizar a aplicação (front + back + banco).
- Publicar em servidor (on-premise ou nuvem).
- Treinamento dos usuários.