# Fase 4 — Lab, News e Academy

## Revisar localmente

Inicie o projeto como no [README](../README.md) e visite `http://localhost:3000/city`.

1. No menu, abra **Laboratório**. Execute **Custo da padaria** com `+50%`; compare insumos, PIB e caixa entre os dois forks. A semana da cidade principal não avança.
2. Repita com **Juros e crédito** a 10%. O banco concede MQ 10,00 à Família Oliveira por uma semana, recebe o principal de volta e MQ 1,00 em juros. Veja os saldos separados.
3. Execute **Orçamento público** com limite de MQ 1,00. O gasto efetivo é limitado ao saldo tributário do fork, sem recursos criados do nada.
4. Abra **News** e leia Fato, Contexto e Hipótese em cada reportagem. Clique **Simular impacto**; o fork é criado diretamente e o Lab abre a comparação. Confira o link para a fonte oficial.
5. Abra **Academy**, percorra as cinco lições e use os atalhos de exercícios para voltar à Cidade ou ao Lab.
6. Volte à Cidade e confira que sua semana, decisões e saldos permaneceram intactos.

## Regras do Lab

O Lab lê a cidade MAIN sob bloqueio de linha e cria duas cidades LAB estruturais com IDs novos. Cada uma recebe saldos líquidos de abertura em partidas dobradas, sem copiar o histórico contábil completo. O motor avança uma semana em cada fork dentro da **mesma transação SQL** que registra o `ScenarioRun`. Falha em qualquer etapa reverte as duas cópias. A comparação usa a mesma origem temporal, mesmo horizonte, e mostra valores em centavos inteiros.

- Choque da padaria altera o custo unitário no fork simulado; divisão inteira arredonda para baixo.
- Crédito transfere o principal do banco à família, quita o principal e transfere juros ao banco. É um exemplo de fluxo de caixa de uma semana, sem contrato, inadimplência ou taxa real da Selic.
- Orçamento transfere recursos do tesouro à família, até o teto escolhido e no máximo o saldo arrecadado no cenário. Não modela outros gastos públicos.
- Os relatórios semanais do motor cobrem pão, salários, insumos e impostos. As operações próprias do experimento são lançamentos adicionais do Lab e aparecem nos saldos comparados.

## News

Edição editorial estática datada de **13/10/2026**. Fatos vinculados às fontes primárias: [IPCA de setembro (IBGE)](https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/48246-ipca-fica-em-0-82-em-setembro), [meta Selic de setembro (BCB)](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=45963&tipo=Comunicado) e [resultado de agosto (Tesouro)](https://www.tesourotransparente.gov.br/publicacoes/boletim-resultado-do-tesouro-nacional-rtn/2026/8). O conteúdo não se atualiza automaticamente. As hipóteses são pontes pedagógicas para Nova Aurora, não estimativas causais desses fatos no Brasil. O botão invoca uma Server Action com uma intervenção predefinida e redireciona ao resultado.

## Validação

- TypeScript: aprovado.
- Vitest: cinco arquivos, **36 testes aprovados**. Incluem isolamento dos dois forks, abertura equilibrada, três intervenções, retorno de comparação, fork após turno da MAIN e rollback se a gravação final falhar.
- Build de produção via webpack: `/academy` e `/news` estáticas, `/lab` e `/city` dinâmicas.
- GET HTTP local às quatro rotas compiladas: `200`, com cabeçalhos e seções esperados.

A inspeção visual por navegador remoto foi impedida pela conexão ao servidor local nesta sessão; a revisão no navegador do usuário permanece pendente. Os testes com PGlite aplicam as migrações SQL reais, mas não medem concorrência com múltiplas conexões PostgreSQL. Modo demo não inclui autenticação para uso público.
