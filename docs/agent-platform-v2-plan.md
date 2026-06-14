# Agent Platform V2 - Plano de Refatoracao Definitiva

## Objetivo

Refazer o atendimento automatico da ACIUM com uma arquitetura previsivel, testavel e evolutiva, corrigindo de forma estrutural:

- entrada de dados inconsistente da Z-API e Instagram;
- agentes que respondem antes de acumular mensagens;
- perguntas simples ignoradas por causa do passo atual do funil;
- handoff humano cedo demais ou sem mensagem ponte;
- memoria espalhada e pouco confiavel;
- catalogo sem inteligencia de categoria, cor, material e estoque;
- chat lento ou pesado no CRM;
- falta de logs explicando por que o agente tomou uma decisao.

O fluxo atual continua funcionando ate a V2 ser validada em modo sombra.

## Principios Obrigatorios

1. Humano ativo trava automacao. Se a conversa esta em atendimento humano, nenhum agente automatico responde.
2. Nenhum cliente fica sem resposta quando a automacao esta ativa.
3. Perguntas operacionais tem prioridade sobre funil: endereco, prazo, pagamento, material, corrente, estoque e entrega.
4. Se o agente nao sabe, pergunta ou chama humano com mensagem ponte. Nunca silencia.
5. Catalogo sempre vem do banco, com estoque e midia validos.
6. Memoria guarda fatos estruturados, nao apenas historico solto.
7. Toda decisao precisa gerar log auditavel.
8. Toda nova camada entra por feature flag e modo sombra antes de produzir resposta.

## Arquitetura Alvo

```txt
Z-API / Instagram / CRM
  -> zapi-unified
  -> inbound-normalizer-v2
  -> inbound-batches / accumulator
  -> agent-orchestrator-v2
  -> catalog-intelligence
  -> agent-flow-runner
  -> response-planner
  -> zapi sender + CRM messages
  -> memory writer + decision logs
```

## Camada 1: Entrada de Dados V2

Arquivo alvo:

- `supabase/functions/_shared/inbound-normalizer-v2.ts`

Responsabilidades:

- normalizar telefone, nome, plataforma, texto, caption e midia;
- reconhecer texto, imagem, video, audio, documento, sticker, localizacao, contato, botao, lista, reacao, mensagem editada/apagada;
- detectar referencia externa (`ig_reel`, post, story, link);
- gerar `normalizedTextForAgent`;
- separar sinais:
  - `productSignals`;
  - `operationalQuestions`;
  - `commerceSignals`;
  - `safetySignals`;
  - `handoffSignals`;
- indicar se a mensagem deve entrar no acumulador.

Saida esperada:

```ts
{
  phone: string;
  text: string;
  normalizedText: string;
  media: {
    type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact" | "button" | "list" | "reaction" | "unknown";
    url: string | null;
    caption: string | null;
  };
  sourcePlatform: "whatsapp" | "instagram" | "unknown";
  externalReferenceType: "ig_reel" | "ig_post" | "ig_story" | "link" | null;
  productSignals: string[];
  operationalQuestions: string[];
  shouldAccumulate: boolean;
  canAutoReply: boolean;
}
```

## Camada 2: Acumulador

Tabela alvo:

- `inbound_batches`

Regra:

- aguardar janela curta antes de chamar agente;
- se nova mensagem chegar no intervalo, anexar ao batch;
- processar somente o ultimo batch aberto;
- ignorar mensagens duplicadas;
- preservar midias e captions.

Exemplo:

```txt
Cliente: Tenho interesse
Cliente: Isso e ouro?
Cliente: Loja fica no Sumauma?
```

Entrada unica para o agente:

```txt
Tenho interesse
Isso e ouro?
Loja fica no Sumauma?
```

## Camada 3: Orquestrador V2

Arquivo alvo:

- `supabase/functions/_shared/agent-orchestrator-v2.ts`

Prioridade:

1. humano ativo;
2. seguranca/comprovante/audio sem transcricao;
3. pergunta operacional;
4. escolha de produto;
5. pedido de catalogo;
6. roteamento por produto/agente;
7. ambiguidade;
8. fallback com pergunta.

O orquestrador decide:

- agente responsavel;
- se responde agora ou acumula;
- se consulta catalogo;
- se atualiza memoria;
- se chama humano;
- qual log registrar.

## Camada 4: Catalogo Inteligente

Tabelas alvo:

- `catalog_product_facts`;
- `catalog_product_embeddings`;

Cada produto deve ter fatos normalizados:

- categoria;
- subcategoria;
- agente responsavel;
- cor;
- material;
- acabamento;
- tamanhos;
- estoque;
- preco;
- tags;
- sinonimos;
- perguntas frequentes;
- se pode entrar no automatico;
- se precisa revisao.

Produto novo deve passar por job de classificacao antes de ser usado no automatico.

## Camada 5: Memoria

Tabelas alvo:

- `conversation_facts`;
- `conversation_pending_questions`;
- `agent_memory_snapshots`;
- opcional: Qdrant para memoria semantica compacta.

Fonte da verdade continua sendo Supabase.

Qdrant Free pode ser usado para prototipo de memoria semantica compacta:

- resumo da conversa;
- preferencias;
- objeções;
- duvidas respondidas;
- produtos mencionados;
- historico de decisoes relevantes.

Nao armazenar todas as mensagens no Qdrant. Mensagens completas ficam no Supabase.

## Camada 6: Chat CRM Rapido

Melhorias:

- virtualizacao da lista de mensagens;
- paginacao por cursor;
- envio otimista;
- thumbnails e lazy loading de midia;
- cache por conversa;
- suporte visual para todos os tipos de midia da Z-API;
- status de envio estilo WhatsApp;
- indices no banco para mensagens recentes.

## Fases de Entrega

### Fase A - Fundacao Desligada

- adicionar migration das tabelas V2;
- adicionar normalizador V2;
- adicionar orquestrador V2;
- criar cenarios de teste;
- nao ligar em producao.

### Fase B - Modo Sombra

- `zapi-unified` chama V2 apenas para gerar decisao/log;
- resposta real continua pela V1;
- comparar V1 vs V2 nos logs.

### Fase C - Piloto Controlado

- ativar V2 por telefone/teste interno;
- depois por agente;
- depois por percentual.

### Fase D - Substituicao Gradual

- trocar acumulador;
- trocar roteamento;
- trocar memoria;
- trocar catalogo;
- manter V1 como fallback temporario.

### Fase E - Aposentar V1

- remover ifs legados;
- consolidar logs;
- limpar tabelas/flags antigas.

## Criterios de Aceite

- cliente nunca fica sem resposta com automacao ativa;
- humano ativo nunca recebe resposta automatica;
- pergunta de endereco/pagamento/prazo/material sempre e respondida antes do funil;
- mensagem de Instagram sem conteudo gera pergunta clara;
- catalogo respeita estoque, cor, categoria e midia;
- cada decisao gera log;
- chat abre conversas grandes rapidamente;
- cenarios dos prints passam em testes automatizados.

## Status de Implementacao

- Fundacao de banco V2 criada em migration aditiva.
- Normalizador V2 criado para mensagens, midias, Instagram e sinais comerciais.
- Orquestrador V2 criado com prioridade para humano ativo, seguranca, perguntas operacionais e catalogo.
- Modo sombra iniciado no `zapi-unified`: registra decisao V2 sem alterar a resposta real.
- Acumulador V2 criado como biblioteca isolada para juntar varias mensagens antes de chamar agente.
- Catalogo inteligente V2 criado como biblioteca isolada para gerar fatos estruturados por produto.
- Flow runner V2 criado para transformar decisao em passo de atendimento com fatos obrigatorios.
- Response planner V2 criado para planejar texto, catalogo, handoff, memoria e perguntas pendentes.
- `catalog-facts-sync` criado para preencher `catalog_product_facts` manualmente e com JWT.
- `catalog-facts-report` criado para auditar produtos liberados/bloqueados do catalogo inteligente.
- Controlador de piloto V2 criado com allowlist por telefone/agente/percentual, ainda sem ativar respostas.
- Executor de piloto V2 conectado ao `zapi-unified`, gerando resposta compativel com o envio atual.
- `ai-catalog-search` aceita `use_facts=true` para usar `catalog_product_facts` no piloto sem afetar V1.
- Fundacao Asaas adicionada para pagamentos via WhatsApp/CRM: migration de cobrancas/eventos, cliente compartilhado, `asaas-payment` para criar cobranca/link/Pix e `asaas-webhook` para atualizar status.

## Proximas Entregas Tecnicas

1. Aplicar migrations em ambiente controlado e rodar `catalog-facts-sync`.
2. Consultar `catalog-facts-report` para corrigir produtos com `needs_review`.
3. Ativar piloto por telefone interno com `AGENT_V2_MODE=pilot` e `AGENT_V2_PILOT_PHONES`.
4. Medir divergencia entre V1 e V2 nos logs de decisao.
5. Transformar acumulador V2 de sombra para atraso real somente no piloto.
6. Configurar secrets `ASAAS_API_KEY`, `ASAAS_ENV` e `ASAAS_WEBHOOK_TOKEN`, aplicar migrations e testar `asaas-payment` em sandbox com um pedido real.
