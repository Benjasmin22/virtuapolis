# Fase 3 — Cidade Nova Aurora

## Prévia para revisão visual

Execute a prévia local descrita no [README](../README.md) e abra `http://localhost:3000/city`. A interface foi construída com DOM sem motor gráfico. Em tela larga mostra a navegação, quatro indicadores, grid 2.5D e painel do agente; em telas menores rearranja os blocos. Os botões do mapa são acessíveis por teclado, e o painel usa abas com rótulos.

Fluxo sugerido para a revisão:

1. Selecione Família Oliveira, Padaria Aurora e Prefeitura no grid e examine as abas **Visão geral**, **Finanças** e **Decisões**.
2. Na padaria, escolha preço de 120 centavos; observe a inflação de 20% em relação à referência de 100 centavos.
3. Clique **Avançar semana**. Veja as novas movimentações contábeis, o PIB local e o caixa público. A semana inicial é 0.
4. Altere a demanda da família e o imposto na Prefeitura; avance novamente para comparar a semana seguinte.
5. Redimensione o navegador para conferir a disposição compacta.

A abertura cria cinco prédios, duas famílias e a padaria com contas de caixa e patrimônio de abertura. O banco é representado como agente com saldo, sem modelo de crédito nesta fase.

## Separação das responsabilidades

`src/city/bootstrap.ts` cria uma cidade de demonstração de forma idempotente. `src/city/projection.ts` lê as tabelas e constrói uma projeção serializável; não altera saldos. `src/app/city/page.tsx` obtém a projeção no servidor. `src/app/city/city-dashboard.tsx` renderiza grid e painéis, e chama as Server Actions em `src/app/city/actions.ts`. As ações validam modo demo, identidade da cidade, opções permitidas e propriedade dos agentes. O motor `src/engine/weekly-turn.ts` lança a semana numa transação SQL e aceita uma chave de requisição estável para retries.

O modo de demonstração em PostgreSQL embarcado é ativado apenas por `VIRTUAPOLIS_LOCAL_DB=1`. Para PostgreSQL externo, as mesmas migrações e o mesmo motor são usados. A identidade fixa é adequada apenas à prévia local; não há autenticação de usuários reais ou implantação pública nesta etapa.

## Indicadores

| Indicador | Cálculo no servidor |
| --- | --- |
| Inflação interna | `(preço atual − preço de referência) × 10000 / referência`, em pontos-base |
| Emprego | `empregados da padaria × 10000 / moradores em idade de trabalhar`, em pontos-base |
| PIB local | Vendas de pão menos custo de insumos da última semana concluída, em centavos |
| Caixa público | Saldo da conta TREASURY derivado dos lançamentos no ledger, em centavos |

PIB é uma medida restrita da única produção modelada nesta versão; inflação compara preços com uma referência fixa, sem índice temporal de cesta de bens. Semana 0 mostra PIB 0. Nenhum indicador é calculado por IA.

## Validação executada

- `npm run typecheck`: aprovado.
- `npm test`: quatro arquivos, 30 testes aprovados; inclui abertura balanceada, bootstrap idempotente, projeção de alteração de preço e avanço da semana.
- `npm run build`: aprovado com webpack, incluindo rota dinâmica `/city`.
- Solicitação HTTP à rota compilada `/city`: 200, contendo cidade, indicadores, agentes, abas e botão de avanço.

O navegador remoto disponível nesta sessão não conseguiu conectar à porta local da área de trabalho (`ERR_CONNECTION_REFUSED`), embora o processo local respondesse a HTTP. Assim, a composição visual e a interação no navegador aguardam a revisão humana local. Os testes automatizados não medem concorrência com múltiplas conexões num servidor PostgreSQL independente.
