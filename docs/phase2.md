# Fase 2 · motor econômico semanal

`src/engine/demand.ts` calcula a demanda com inteiros e preços em `bigint`. A elasticidade é expressa em pontos-base (10.000 bps = 1). A demanda é linear ao redor do preço de referência, arredondada para baixo e limitada ao intervalo de zero a duas vezes a quantidade de referência; também obedece à capacidade da padaria. Por exemplo, preço de referência 100 centavos, preço atual 150 centavos, elasticidade 10.000 bps e demanda base de 10 pães resultam em 5 pães.

`advanceWeek(db, { cityId, userId, requestKey })` recebe um adaptador de transação SQL. O adaptador de produção está em `src/engine/postgres.ts`. O futuro endpoint da Fase 3 deverá buscar `userId` na sessão autenticada no servidor, nunca aceitá-lo diretamente do navegador. A função é de servidor; ainda não existe botão ou rota HTTP.

## Sequência atômica

1. Valida parâmetros, bloqueia a cidade (`SELECT ... FOR UPDATE`), confere dono e versão `v1`.
2. Para uma chave já concluída, devolve o mesmo relatório persistido, mesmo que a cidade tenha avançado mais semanas.
3. Exige exatamente uma padaria e contas de caixa para todos os agentes, tesouro e fornecedor. Uma família ou padaria sem conta interrompe o turno. Em V1, todos os trabalhadores das famílias pertencem à padaria; a soma deve bater com `employees`.
4. Cria o turno seguinte e paga os salários da padaria às famílias.
5. Calcula a demanda de cada família em ordem estável de UUID; limita pelas unidades restantes, pela capacidade de pagamento e pelo preço. Cada compra move MQ da família à padaria.
6. Transfere à conta de fornecedor o custo unitário vezes a quantidade vendida. Calcula imposto sobre vendas brutas em pontos-base, arredonda para baixo e transfere ao tesouro.
7. Grava relatório em centavos como strings decimais, marca o turno concluído e incrementa `current_turn`. Triggers diferidos verificam cada par de lançamentos no COMMIT.

Se faltar dinheiro para qualquer saída, a transação SQL desfaz inclusive salários e compras anteriores dessa semana. O fornecedor é uma conta de contrapartida contábil da cidade, ainda sem agente interativo. Custos de insumos e imposto só são lançados quando positivos. Não há criação de MQ pelo motor.

## Contrato de entrada e saída

```ts
const report = await advanceWeek(getEngineDatabase(), {
  cityId: "<UUID da cidade>",
  userId: "<UUID autenticado no servidor>",
  requestKey: "<chave estável da tentativa>",
});
// { cityId, turn, transactions, breadUnits,
//   wagesCents, salesCents, inputCostsCents, taxesCents }
```

Uma cidade precisa de saldo de abertura creditado contra `OPENING_EQUITY` no turno zero, com dois `LedgerEntry` por transferência. O código desta fase não cria cidades nem dados iniciais; isso será ligado ao fluxo de criação da cidade na interface. Apenas contas de caixa podem ficar sem saldo; patrimônio de abertura registra contrapartida credora.

## Validação

Os testes foram escritos e executados antes do motor: 2 suítes falharam ao tentar importar os módulos ausentes. A implementação passou em 28 testes distribuídos por 3 arquivos, incluindo 5 testes de elasticidade, 7 testes do avanço semanal e os 16 testes originais de schema. Dois testes adicionais demonstraram que agentes sem conta seriam omitidos; foram corrigidos antes da entrega. O teste de falha injeta uma exceção antes do imposto, quando salários, vendas e insumos já foram escritos, e confirma rollback total e retry correto.

O build Next.js e a checagem de tipos passaram. A primeira tentativa de build encontrou um erro de cache interno do Turbopack; após descartar o cache gerado e repetir, compilou normalmente. O ambiente não dispõe de servidor PostgreSQL independente; o comportamento de bloqueio concorrente entre conexões deverá ser medido nesse ambiente antes de disponibilizar o botão ao usuário.
