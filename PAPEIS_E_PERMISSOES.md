# Relatório: Papéis, Perfis e Permissões do Sistema

> Levantamento feito a partir do código real (rotas do backend, guards e UI).
> Data: 25/09/2026 — para consultas futuras. Atualizações deste tema: ver também `FLUXOS.md` §4 e §16.
>
> **Modelo vigente (25/09/2026):** o **analista vê TUDO o que o administrador vê** (sem
> mascaramento — o campo `acessoRestrito` foi removido do sistema), mas **não executa as
> ações exclusivas do admin**: excluir processos, acessar a administração (usuários,
> configurações, logs, auditoria, sistema), sincronizar finalizados e excluir anotações de terceiros.
> O **assistente** continua restrito às suas unidades.

---

## 1. Papéis existentes

| Papel | Origem | Status |
|-------|--------|--------|
| **`admin`** (Administrador) | seed / criado pelo admin | ✅ Implementado — regras explícitas em todo backend |
| **`analista`** | seed / atribuído pelo admin | ✅ Implementado — **visibilidade total (igual admin)**; sem ações de admin |
| **`assistente`** | seed **ou criado automaticamente no 1º login AD** (padrão do modal) | ✅ Implementado — restrito às suas unidades |
| `protocolo`, `gestor` | **removidos** (só existiam no comentário do schema, hoje inexistente) | ❌ Não existem mais |

Obs.: o schema tem `@default("analista")`, o login AD cria `assistente` e o modal de usuários abre em `assistente` — três padrões diferentes.

---

## 2. Matriz: o que cada papel VÊ em cada página

| Página (rota) | 👑 admin | 📋 analista | 🧑 assistente |
|---|---|---|---|
| **Dashboard** `/` | Todos os processos (KPIs, evolução, unidades, top tipos) e contagem de parados | **Idêntico ao admin** — sem linhas mascaradas, gráficos sem distorção | Só processos de suas unidades; sem unidades → zeros/sem dados |
| **Processos** `/processos` | Lista completa | **Lista completa** (Restritos fora das unidades vêm **integros**, sem `acessoRestrito`) | Só processos cujas unidades intersectam as dele; sem unidades → lista vazia |
| **Sem Resumo** `/processos/sem-resumo` | Todos sem resumo | **Idêntico ao admin** | Só os sem resumo das suas unidades |
| **Detalhe** `/processo/:id` | Tudo: dados, resumo, anotações, andamentos, relacionados, ações | **Tudo, em qualquer processo** (inclusive Restritos fora das unidades) — mesmos dados e mesma UI do admin, menos o botão Excluir | Nas suas unidades → tudo; fora → **403** ("Acesso negado") |
| **Cadastrar** `/novo-processo` | Cria qualquer processo | Cria **apenas** se alguma unidade aberta do processo estiver entre as dele (senão 403) | Idem analista |
| **Sincronização** `/sincronizacao` | Vê e sincroniza tudo (inclusive finalizados) | Lista completa; sincroniza qualquer processo **exceto finalizados** (botão desabilitado + 403 no backend) | Só suas unidades; finalizados desabilitados |
| **Parados** `/parados` | Todos os em-andamento parados (exclui filhos anexados) | **Idêntico ao admin** | Só os parados de suas unidades |
| **Relatórios** `/relatorios` | Recorte completo + exports | **Idêntico ao admin** (sem mascaramento nos gráficos) | Recorte só das suas unidades |
| **Tags** `/etiquetas` | CRUD completo | **CRUD completo** (sem gate) | **CRUD completo** (sem gate) |
| **Administração** `/administracao` | Menu + 5 abas (Usuários, Config SEI, Logs, Auditoria, Sistema) | Menu **oculto**; ⚠️ a **rota não é guardada no front** — digitando a URL a UI abre, mas todas as APIs dão 403 (dados protegidos no backend) | Idem analista |
| **Perfil** `/perfil` | KPIs: "que tenho acesso" = todos; unidades = todas as CREMEPE na sincronização | KPIs: acesso = todos; "das minhas unidades" = interseção das unidades dele | KPIs: acesso = suas unidades; sem unidade → 0 |
| **Login / Sessão** | Todos os papéis: mesmo fluxo (a única diferença é **onde a senha é validada**: local = bcrypt / AD = LDAP) | | |

---

## 3. Ações por papel (backend)

| Ação | admin | analista | assistente |
|---|---|---|---|
| Ver detalhe/resumo/anotações/andamentos/país/exportar | ✅ | ✅ **qualquer processo** (sem restrição de unidade/nível) | ✅ só nas suas unidades (senão 403) |
| Criar/editar anotação | ✅ | ✅ qualquer processo | ✅ nas unidades |
| Editar anotação de outro | ❌ (só autor) | ❌ só autor | ❌ só autor |
| Excluir anotação de outro | ✅ | ❌ | ❌ |
| Gerar/salvar resumo | ✅ | ✅ qualquer processo | ✅ nas unidades |
| Alterar status (finalizado ↔ em andamento) | ✅ | ✅ qualquer processo (**inclusive reabrir/finalizar**) | ✅ nas suas unidades |
| Editar tags do processo | ✅ | ✅ qualquer processo | ✅ nas unidades |
| Cadastrar/importar processo | ✅ qualquer | só com unidade em comum | só com unidade em comum |
| Sincronizar processo **finalizado** | ✅ | ❌ 403 | ❌ 403 |
| Sincronizar em lote | ✅ tudo | pula finalizados | idem |
| **Excluir processo** | ✅ | ❌ 403 | ❌ 403 |
| Excluir usuário / gestão de usuários, config, logs, auditoria, sistema | ✅ | ❌ (`adminOnly`) | ❌ |
| Criar/editar/excluir **tags** | ✅ | ✅ | ✅ |
| Sincronizar **minhas** unidades | ✅ → todas CREMEPE | → unidades onde o username consta no SEI | idem |
| Alterar senha própria | ✅ (local) | ✅ (local) | ✅ (local) — AD bloqueado para todos |

---

## 4. Apontamentos/inconsistências abertos

1. **Rota `/administracao` sem guarda no front** (`App.tsx` não verifica `user.role`) — só o menu a esconde; a UI abre para qualquer logado (API protegida, mas UX ruim).
2. **Tags sem qualquer restrição de papel** — assistente pode editar/excluir tags criadas por outros.
3. **Assistente pode marcar processo como finalizado** (toggle usa regra de unidade, não de papel) — enquanto *sincronizar* finalizado é admin-only.
4. **Analista pode reabrir/finalizar qualquer processo** pelo toggle de status (nunca houve regra admin-only no `PUT`) — consequência do modelo; avaliar se o toggle de finalizado deveria ser admin-only como a sincronização.
5. **Três padrões de papel inicial**: schema `analista`, login AD `assistente`, modal `assistente`.

### Itens resolvidos nesta versão
- ~~Máscara em `/parados`~~, ~~distorção de gráficos por mascaras~~, ~~`handleDelete` morto no ProcessList~~, ~~papéis `protocolo`/`gestor` fantasmas~~ — resolvidos nas limpezas de 25/09/2026 (mascaramento removido do sistema inteiro).
