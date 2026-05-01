# Plano de Reestruturação Sem Impacto - Fluxo WhatsApp/Z-API

## Objetivo

Corrigir de forma definitiva o atendimento via WhatsApp, removendo bifurcações legadas e consolidando o sistema em um único fluxo canônico, sem interromper a operação atual.

O foco é garantir que:

- toda mensagem recebida entre pelo mesmo pipeline;
- toda resposta de agente saia pelo mesmo pipeline;
- o CRM reflita exatamente o que entrou e saiu no WhatsApp;
- Aline, Keila e Kate operem com roteamento determinístico;
- fluxos antigos sejam aposentados por fases, sem corte abrupto.

---

## Problema estrutural atual

Hoje o sistema ainda apresenta sintomas típicos de arquitetura com múltiplos caminhos ativos:

- mais de um endpoint pode receber a mesma mensagem;
- partes do sistema ainda chamam `ai-chat` diretamente;
- partes antigas ainda orientam integrações externas para endpoints legados;
- existe mais de uma fonte de contexto para conversa;
- o CRM depende de espelhamentos que nem sempre ocorrem pelo mesmo caminho;
- agentes especialistas podem perder contexto ou cair em respostas da Aline genérica.

Isso gera efeitos como:

- fluxo de pingente respondendo como aliança;
- resposta de especialista aparecendo como Aline;
- mensagens do lead sumindo do chat;
- conversa retomando contexto antigo;
- seleção de catálogo não sendo reconhecida de forma consistente.

---

## Arquitetura alvo

### 1. Ponto único de entrada externo

Todo tráfego externo do WhatsApp/Z-API deve entrar por:

- `supabase/functions/zapi-webhook`

E esse endpoint deve apenas encaminhar para:

- `supabase/functions/zapi-unified`

Nenhuma automação externa deve apontar para:

- `ai-chat`
- `ai-chat-auto-reply`
- `automation-webhook`
- `aline-reply`

Esses endpoints só podem existir como:

- proxy interno temporário; ou
- rota legada controlada para transição.

### 2. Orquestrador canônico

O cérebro do atendimento deve ser:

- `supabase/functions/aline-reply`

Responsabilidades:

- identificar intenção;
- decidir agente (`aline`, `keila`, `kate`, `human`);
- persistir estado da conversa;
- buscar catálogo;
- determinar próximos passos;
- retornar payload unificado para envio.

### 3. Motor de linguagem

`supabase/functions/ai-chat` não deve ser endpoint público de automação.

Ele deve existir apenas como motor interno para geração de texto da Aline quando:

- o fluxo não for Keila;
- o fluxo não for Kate;
- o roteador já tiver decidido que é conversa genérica.

### 4. Fonte única de verdade da conversa

#### Operacional

- `public.messages`
- `public.conversations`
- `public.aline_conversations`
- `public.customer_agent_memory`

#### Legado / compatibilidade temporária

- `public.conversation_state`
- `public.conversation_events`
- `public.aline_messages`

Meta final:

- decisões operacionais não dependerem mais de `conversation_state` nem `conversation_events`;
- `aline_messages` ficar como trilha auxiliar, não como fonte principal do chat.

### 5. Saída única pelo WhatsApp

Todo envio para o WhatsApp deve passar por:

- `supabase/functions/zapi-unified`

Mesmo quando a resposta vier de:

- Aline;
- Keila;
- Kate;
- catálogo;
- preview;
- follow-up;
- campanha.

### 6. Chat do CRM

O CRM deve mostrar:

- mensagens recebidas a partir de `public.messages`;
- mensagens enviadas a partir de `public.messages`;
- sem depender de fallback funcional para operação normal.

Fallbacks só podem existir enquanto durar a migração.

---

## Regras de negócio por agente

### Aline

- agente genérica;
- acolhe, qualifica e transfere;
- não deve tentar concluir fluxo de especialista quando a intenção for claramente `aliancas casamento` ou `pingente fotogravado`.

### Keila

- atende apenas alianças de casamento;
- após qualificação, mostra catálogo alinhado a casamento/tungstênio;
- depois da escolha:
  - retirada ou delivery;
  - forma de pagamento;
  - handoff humano.

### Kate

- atende apenas pingentes fotograváveis aprovados;
- depois da cor:
  - envia catálogo em estoque;
  - não pergunta tamanho;
- depois da escolha:
  - pede foto;
  - gera prévia;
  - pede aprovação;
  - entrega ou retirada;
  - pagamento;
  - handoff humano.

---

## Estratégia sem impacto

## Fase 0 - Congelamento operacional

Objetivo: parar de abrir novos caminhos.

Ações:

- definir `zapi-webhook` como endpoint oficial;
- parar de divulgar `ai-chat`, `ai-chat-auto-reply` e `automation-webhook` externamente;
- manter endpoints antigos vivos, mas apenas como proxy;
- atualizar documentação, painel e textos de integração.

Critério de saída:

- nenhuma documentação operacional apontando para endpoint legado.

## Fase 1 - Canonical ingress

Objetivo: todo tráfego externo cair no mesmo pipeline.

Ações:

- `zapi-webhook` -> proxy puro para `zapi-unified`;
- `automation-webhook` -> proxy puro para `zapi-unified`;
- `ai-chat-auto-reply` -> proxy puro para `zapi-unified`;
- `ai-chat`:
  - se chamado externamente sem flag interna, redireciona para `zapi-unified`;
  - só segue fluxo bruto quando `skip_aline_reply_proxy` ou `force_raw_ai_chat` forem usados internamente.

Critério de saída:

- toda entrada externa relevante chega em `zapi-unified`.

## Fase 2 - Envelope único de payload

Objetivo: remover diferenças entre formatos de entrada.

Ações:

- normalização total de payload dentro de `zapi-unified`;
- mapear múltiplos formatos de:
  - telefone;
  - nome do contato;
  - texto;
  - mídia;
  - clique em botão;
  - seleção de catálogo.

Critério de saída:

- qualquer payload legado aceito vira o mesmo objeto normalizado antes do roteamento.

## Fase 3 - Estado único da conversa

Objetivo: parar de decidir fluxo com fontes concorrentes.

Ações:

- usar `aline_conversations` como estado canônico do agente;
- endurecer `resolveConversation` para usar a conversa ativa mais recente por atividade real, não por criação;
- impedir múltiplas conversas ativas do mesmo telefone;
- revisar duplicatas históricas antes de colocar restrição forte.

Mudança futura recomendada:

- adicionar unicidade lógica por telefone para conversa ativa, após saneamento do histórico.

Critério de saída:

- um telefone não pode “oscilar” entre threads concorrentes do mesmo fluxo.

## Fase 4 - Espelhamento determinístico no CRM

Objetivo: chat do CRM refletir exatamente o WhatsApp.

Ações:

- salvar mensagem recebida em `public.messages` antes da resposta do agente;
- salvar mensagem enviada em `public.messages` imediatamente após envio Z-API;
- garantir que catálogo, mídia, preview e pós-catálogo usem o mesmo espelhamento;
- deixar `aline_messages` como trilha secundária.

Critério de saída:

- o CRM não depender mais de fallback para mostrar conversa.

## Fase 5 - Especialistas isolados

Objetivo: impedir contaminação de contexto entre agentes.

Ações:

- Keila limpa resíduos de Kate/Aline quando assume;
- Kate limpa resíduos de Keila/Aline quando assume;
- somente especialistas podem manipular seus campos de fluxo;
- Aline não deve “herdar” seleção antiga de especialista.

Critério de saída:

- pingente nunca cai em tamanho de aliança;
- aliança nunca cai em foto/prévia de pingente.

## Fase 6 - Observabilidade e corte do legado

Objetivo: desligar o que sobrar com segurança.

Ações:

- registrar rota de entrada real (`ingress_route`);
- registrar payload normalizado;
- registrar agente decidido;
- registrar motivo do roteamento;
- auditar chamadas ainda chegando por rota legada;
- quando zerar uso real, retirar comportamento especial legado.

Critério de saída:

- ambiente operando só no fluxo canônico.

---

## Mudanças técnicas necessárias

### Backend

- consolidar `zapi-unified` como gateway único;
- deixar `ai-chat` estritamente interno;
- endurecer `resolveConversation`;
- revisar `fiqon-catalog-send` para não criar estado paralelo fora da conversa principal;
- remover qualquer reentrada indevida por `conversation_state`.

### Banco

- auditar duplicidade em `aline_conversations`;
- preparar migração de unicidade lógica por telefone;
- manter memória por agente em `customer_agent_memory`;
- usar `public.messages` como base oficial do chat.

### Frontend

- documentação e painéis apontando só para `zapi-webhook`;
- chat lendo prioritariamente `public.messages`;
- fallback temporário apenas até estabilização total.

### Operação

- atualizar URL configurada no provedor/automação;
- validar que não existe webhook externo apontando para `ai-chat` ou `ai-chat-auto-reply`;
- usar janela de observação antes de desligar rotas antigas.

---

## Ordem segura de implementação

1. Corrigir documentação e configuração pública.
2. Garantir que todas as rotas legadas virem proxy para `zapi-unified`.
3. Endurecer `ai-chat` para nunca ser rota pública acidental.
4. Endurecer `resolveConversation` e o uso de `aline_conversations`.
5. Consolidar espelhamento de entrada e saída em `public.messages`.
6. Ajustar fluxos de especialista.
7. Monitorar uso das rotas antigas.
8. Aposentar o legado.

---

## O que não fazer

- não desligar endpoints antigos de uma vez;
- não migrar a UI antes de o backend estar canônico;
- não usar mais de uma tabela para decidir o fluxo ativo;
- não deixar integrações externas chamarem `ai-chat` diretamente;
- não continuar adicionando exceções no agente sem fechar a arquitetura.

---

## Resultado esperado

Quando essa migração terminar:

- pingente vai sempre para Kate;
- alianças de casamento vão sempre para Keila;
- Aline só vai tratar o que é realmente genérico;
- as mensagens do lead e do agente sempre vão aparecer no CRM;
- um clique em catálogo vai ser reconhecido pelo mesmo pipeline;
- o sistema vai ficar previsível e sustentável.

---

## Próxima execução recomendada

### Sprint 1 - sem impacto

- finalizar proxy das rotas legadas;
- atualizar toda documentação/UI de integração;
- endurecer `ai-chat`;
- adicionar observabilidade básica de rota de entrada.

### Sprint 2 - estabilização

- corrigir escolha da conversa ativa por telefone;
- remover dependência funcional de `conversation_state` para roteamento;
- fechar o espelhamento do chat em `public.messages`.

### Sprint 3 - especialistas

- consolidar Keila;
- consolidar Kate;
- validar catálogo, escolha e handoff.

