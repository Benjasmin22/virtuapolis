# Virtuapolis — regras de execução

- Executar apenas a fase autorizada. Fases 1, 2 e 3 têm commits próprios. A Fase 4 está autorizada; encerrar com validação e commit, aguardando revisão da integração.
- Motor determinístico em TypeScript no servidor, sem chamadas a LLM para cálculos.
- MQ em centavos: `bigint` em TypeScript e `BIGINT` em PostgreSQL. Nunca converter moeda para `Number`, float ou double.
- Toda transferência exige um débito e um crédito de mesmo valor. Migrações SQL incluem constraints diferidas e imutabilidade do ledger.
- Não usar `drizzle-kit push`: aplicar migrações versionadas, inclusive `0001_ledger_integrity.sql`.
- UI lê projeções; não calcula nem persiste avanços de semana no cliente.
- Lab escreve apenas em cidade LAB separada. Nunca reutilizar IDs de contas/agentes da cidade principal em lançamentos do fork.
- Testes de Fase 2 cobrem partidas dobradas, limite da demanda, saldo, idempotência/rollback/retry. Preservar e estender os testes antes de alterar equações.
- Validar com `npm run typecheck`, `npm test` e `npm run build` antes do commit.
- Não confundir testes PGlite com validação de conexões concorrentes em PostgreSQL real; bloqueio pessimista depende de `SELECT ... FOR UPDATE` dentro de uma transação real.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
