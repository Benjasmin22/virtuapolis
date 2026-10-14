# Virtuapolis · V1 Foundation

**Status: Fase 4 implementada e pronta para revisão da integração Lab, News e Academy.**

Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Drizzle/PostgreSQL e Vitest. O motor semanal determinístico executa somente no servidor. A interface `/city` mostra Nova Aurora como projeção de leitura; decisões e avanço da semana usam Server Actions. Lab, News e Academy completam a trilha didática da V1.

## Prévia local rápida

Requisitos: Node.js 22 ou superior e npm.

```bash
npm ci
cp .env.example .env.local
printf '\nVIRTUAPOLIS_LOCAL_DB=1\n' >> .env.local
npm run dev
```

Abrir [http://localhost:3000/city](http://localhost:3000/city). No Windows, copie `.env.example` para `.env.local` e adicione `VIRTUAPOLIS_LOCAL_DB=1` no editor. O modo local usa PostgreSQL embarcado PGlite em `.local/preview-pg`, aplica as migrações e cria Nova Aurora na primeira visita. Os dados persistem entre reinicializações. Para zerar a prévia, pare o servidor e remova `.local/preview-pg`.

Para usar PostgreSQL independente, deixe `VIRTUAPOLIS_LOCAL_DB` desativado, configure `DATABASE_URL`, execute `docker compose up -d --wait` caso use Docker e rode `npm run db:migrate`. `VIRTUAPOLIS_DEMO=1` seleciona uma identidade de demonstração local; este modo não oferece autenticação para uma instalação pública.

## Validar

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` usa webpack por conta de uma restrição de criação de portas pelo worker de CSS do Turbopack neste ambiente. Os testes executam migrações reais no PGlite. Não substituem um teste de concorrência com múltiplas conexões no PostgreSQL independente.

## Cidade

O grid responsivo contém duas residências, Padaria Aurora, Banco Horizonte e Prefeitura. Os painéis Visão geral, Finanças e Decisões mostram cada agente, a movimentação contábil e as opções de preço do pão, demanda da família e imposto municipal. O botão **Avançar semana** chama o motor, que registra a folha, compras, insumos e impostos em uma transação SQL idempotente.

Os indicadores mostram inflação do preço do pão em relação ao preço de referência, emprego como empregados da padaria sobre moradores em idade de trabalhar, PIB local da última semana como vendas menos insumos, e caixa público derivado do ledger. Detalhes da cidade: [`docs/phase3.md`](docs/phase3.md). Revisão dos novos módulos: [`docs/phase4.md`](docs/phase4.md).

## Dados e motor

Fonte: [`src/db/schema.ts`](src/db/schema.ts). Relações e garantias: [`docs/schema.md`](docs/schema.md). Contrato econômico: [`docs/phase2.md`](docs/phase2.md).

| Entidade | Responsabilidade |
| --- | --- |
| User | Proprietário das cidades |
| City | Cidade MAIN ou LAB, semana atual e parâmetros econômicos |
| Building | Residência, padaria, banco ou prefeitura no grid |
| Household | Família, população, força de trabalho e demanda semanal |
| Company | Padaria ou banco, preços, capacidade, insumos e salários |
| Account | Conta de família, empresa, tesouro, fornecedor ou patrimônio inicial |
| TurnRun | Semana, chave de requisição e relatório persistido |
| LedgerTransaction | Origem, destino, valor inteiro, semana e natureza |
| LedgerEntry | Débito e crédito imutáveis de cada transação |
| ScenarioRun | Vincula uma fotografia MAIN, dois forks LAB e os parâmetros da experiência |

Moeda é `BIGINT` no SQL e `bigint` no TypeScript; taxas usam pontos-base inteiros. O ledger mantém sempre dois lançamentos por transação e os saldos são derivados de seus lançamentos.

## Migrações

- `0000_foundation.sql`: tabelas e relações iniciais.
- `0001_ledger_integrity.sql`: equilíbrio diferido e imutabilidade.
- `0002_weekly_engine_contract.sql`: parâmetros e relatórios semanais.
- `0003_city_dashboard_population.sql`: população em idade de trabalhar.
- `0004_lab_baseline_fork.sql`: vínculo do fork base para comparação controlada.

Use `npm run db:migrate` no banco indicado em `DATABASE_URL`. Não use `drizzle-kit push`, pois as garantias SQL adicionais não estão inteiramente representadas no schema TypeScript.

## Lab, News e Academy

`/lab` clona a estrutura e os saldos atuais em dois forks isolados, avança ambos uma semana e compara base e simulado para crédito/juros, choque de insumos e orçamento público. `/news` oferece uma edição curada de fatos econômicos reais, com links oficiais e camadas Fato, Contexto e Hipótese; **Simular impacto** cria os forks e abre o resultado no Lab. `/academy` organiza cinco lições e exercícios ligados à cidade. As notícias não se atualizam automaticamente, e o experimento é didático, sem pretensão de prever a economia brasileira.

Esta versão continua em modo de demonstração local, sem login de usuários reais ou publicação pública. A revisão visual da integração está pendente.
