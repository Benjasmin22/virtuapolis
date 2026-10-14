# Validação — Fase 1

Executada em 13/10/2026, Node.js 24.19.0.

## Resultados finais

- `npm run typecheck`: exit code 0.
- `npm test`: 1 arquivo aprovado; 16 testes aprovados; duração 2,42 s.
- `npm run build`: exit code 0; compilação, TypeScript e geração estática concluídas.
- Rotas geradas: `/` e `/_not-found`.

```text
Test Files  1 passed (1)
     Tests  16 passed (16)
  Duration  2.42s

✓ Compiled successfully in 1891ms
✓ Generating static pages using 4 workers (3/3) in 356ms
```

Os testes de constraints foram executados antes dos triggers: 6 falharam e 10 passaram. Após a migração de integridade, todos os 16 passaram. Isso verificou que os testes de equilíbrio e imutabilidade detectam a ausência das garantias SQL.

O teste de precisão grava e lê pelo Drizzle o valor `9007199254740993n`, acima do limite de inteiros exatos de JavaScript Number.

As migrações foram aplicadas e reaplicadas em PGlite (PostgreSQL embarcado). Não foi usado servidor PostgreSQL externo, Docker, navegador ou deploy. O teste do motor econômico e a verificação visual pertencem às fases seguintes.

As dependências estão fixadas no package-lock.json. Não há segredos ou arquivo .env no pacote.
