# Schema — Fases 1 a 4

## Entidades e campos

Todos os identificadores são UUID. `createdAt` é data/hora com fuso. Os nomes abaixo são os do TypeScript; no SQL usa-se snake_case.

| Entidade | Campos |
| --- | --- |
| User | id, email único, name, createdAt |
| City | id, userId, name, kind MAIN/LAB, currentTurn inteiro não negativo, bakeryElasticityBps, salesTaxBps, engineVersion, createdAt |
| Building | id, cityId, kind RESIDENCE/BAKERY/BANK/CITY_HALL, name, gridX, gridY |
| Household | id, cityId, buildingId, buildingKind RESIDENCE, name, members, workingAgeMembers, workers, weeklyBreadUnits |
| Company | id, cityId, buildingId, kind BAKERY/BANK, name, priceCents bigint, referencePriceCents bigint, unitCostCents bigint, weeklyWageCents bigint, capacity, employees |
| Account | id, cityId, code, kind (inclui SUPPLIER_CASH), householdId opcional, companyId opcional |
| TurnRun | id, cityId, turn, requestKey, status PENDING/COMPLETED, createdAt, completedAt opcional, report JSON persistido após conclusão |
| LedgerTransaction | id, cityId, turn, eventKey, sourceAccountId, destinationAccountId, amountCents bigint, nature, createdAt |
| LedgerEntry | transactionId + side (PK composta), cityId, side DEBIT/CREDIT, accountId, amountCents bigint |
| ScenarioRun | id, userId, baseCityId, baseCityKind MAIN, forkCityId único, baselineForkCityId único, forkCityKind LAB, baseTurn, experiment, interestDeltaBps, costShockBps, publicBudgetDeltaCents bigint, status, createdAt |

## Relações

- User 1:N City.
- City 1:N Building, Household, Company, Account, TurnRun e LedgerTransaction.
- Building 1:0..1 Household ou Company, conforme tipo. Prefeitura não é Company: seu caixa usa conta TREASURY da cidade.
- Household e Company possuem no máximo uma conta de caixa cada nesta V1.
- TurnRun 1:N LedgerTransaction por `(cityId, turn)`.
- LedgerTransaction 1:2 LedgerEntry, com um DEBIT e um CREDIT.
- Account 1:N LedgerEntry; origem e destino são contas distintas da mesma cidade.
- City MAIN 1:N ScenarioRun; cada ScenarioRun referencia duas City LAB exclusivas do mesmo usuário: a base e a simulada.

## Contabilidade e dinheiro

1 MQ = 100 centavos virtuais. Exemplo: 10 MQ são `1000n`, nunca `10.0`. O limite por valor é o inteiro assinado de 64 bits do PostgreSQL. O motor valida limites e usa divisão inteira, com arredondamento explícito para baixo quando necessário.

Uma transferência de caixa credita a conta de origem e debita a de destino. O registro de abertura terá contrapartida explícita em OPENING_EQUITY, para que os recursos iniciais sejam auditáveis. Não há coluna mutável de saldo. O saldo de uma conta de caixa será derivado de débitos menos créditos; a contrapartida de patrimônio tem natureza credora.

`LedgerTransaction` e suas duas linhas são inseridos dentro da mesma transação SQL. O trigger diferido examina o estado no COMMIT: exige exatamente dois lançamentos, lados distintos, contas corretas, mesma cidade e valor idêntico ao cabeçalho. O SQL rejeita registros incompletos, valor não positivo ou origem igual ao destino. Alterações, exclusões e TRUNCATE do ledger são bloqueados; correções usam lançamentos compensatórios.

Essas constraints preservam o equilíbrio das partidas. O motor da Fase 2 verifica saldo antes de cada transferência e reverte a semana inteira caso a padaria não possa cobrir salários, insumos ou imposto. O experimento de crédito da Fase 4 registra somente fluxos de caixa de uma semana; contratos, posições de crédito e inadimplência exigem modelagem específica antes de ampliar o simulador bancário.

## Idempotência do motor

Chaves únicas por `(cityId, turn)`, `(cityId, requestKey)` e `(cityId, turn, eventKey)` impedem duplicação desses identificadores. O motor bloqueia a linha da cidade com `FOR UPDATE`, verifica dono e versão, cria turno, lança todos os movimentos, grava o relatório e avança a semana na mesma transação. Um retry da mesma chave retorna o relatório persistido. A concorrência entre conexões reais ainda não foi medida.

## Isolamento Lab e comparação

As FKs compostas carregam `cityId`, impedindo que família, empresa, conta ou lançamento do Lab referencie entidades da cidade principal. O vínculo de cenário exige MAIN como origem e LAB como destino, todos sob o mesmo usuário. `baselineForkCityId` aponta para um segundo fork LAB, distinto do simulado.

A Fase 4 bloqueia a cidade MAIN durante a fotografia e clona estrutura e posições líquidas das contas com novos IDs. Os saldos positivos são lançamentos de abertura contra patrimônio; não se copia o histórico inteiro. Em uma só transação SQL, o servidor cria os dois forks, aplica a intervenção apenas ao simulado, avança uma semana em cada fork e persiste o vínculo. Falhas revertem ambos. A comparação usa a mesma semana de origem e horizonte de uma semana.

Crédito é uma operação de uma semana: empréstimo de MQ 10,00 do banco para uma família, quitação do principal e juros inteiros ao fim. O experimento não representa contratos bancários nem taxa Selic. O orçamento público transfere até o valor escolhido, limitado ao saldo do tesouro já arrecadado. Ambos os movimentos são partidas dobradas.

## Limites de segurança e entrega

As relações não são autenticação nem Row Level Security. A Fase 3 expõe Server Actions de mutação somente no modo de demonstração habilitado pelo servidor. A identidade fixa de demonstração não substitui autenticação e autorização de usuários reais antes de uma instalação pública. O usuário SQL de runtime deverá ter privilégios mínimos, distintos do proprietário que executa migrações.

O motor de compras, salários, insumos e imposto em `src/engine` é acionado pela cidade de demonstração `/city`. Já existem os forks do Lab, o feed curado e as lições. A página inicial redireciona para `/city` no modo de demonstração.
