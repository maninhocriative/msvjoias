import { Bot, CheckCheck, CircleAlert, Hand, Paperclip, Search, Send, Sparkles } from "lucide-react";

const filters = [
  "Todas",
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Nao respondidas",
  "IA atendendo",
  "Aguardando humano",
  "Humano ativo",
  "Pagamento pendente",
  "Pedido pendente",
  "Follow-up",
  "Alta prioridade"
];

const conversations = [
  {
    name: "Mariana Souza",
    channel: "WhatsApp",
    last: "Gostei da alianca dourada. Tem no tamanho 18 e 20?",
    time: "15:42",
    agent: "Keila",
    stage: "catalog_sent",
    unread: 2,
    tag: "aliancas"
  },
  {
    name: "Rafael Lima",
    channel: "Instagram",
    last: "Quero fazer um pingente com foto.",
    time: "15:18",
    agent: "Kate",
    stage: "photo_pending",
    unread: 0,
    tag: "fotogravacao"
  },
  {
    name: "Camila Rocha",
    channel: "Facebook",
    last: "Ja paguei, mas o link ainda aparece pendente.",
    time: "14:57",
    agent: "Financeiro",
    stage: "payment_pending",
    unread: 1,
    tag: "pagamento"
  }
];

export function InboxView() {
  const selected = conversations[0];

  return (
    <section className="inbox" aria-label="Inbox">
      <aside className="conversation-list">
        <header className="list-header">
          <div>
            <strong>Inbox</strong>
            <span>WhatsApp, Instagram e Facebook</span>
          </div>
          <button type="button" aria-label="Buscar conversas">
            <Search size={18} />
          </button>
        </header>

        <div className="filter-strip">
          {filters.map((filter) => (
            <button key={filter} type="button">
              {filter}
            </button>
          ))}
        </div>

        {conversations.map((conversation) => (
          <button
            className={conversation.name === selected.name ? "conversation-row selected" : "conversation-row"}
            key={conversation.name}
            type="button"
          >
            <span className="avatar">{conversation.name.slice(0, 1)}</span>
            <span className="conversation-copy">
              <span className="conversation-title">
                <strong>{conversation.name}</strong>
                <em>{conversation.channel}</em>
              </span>
              <small>{conversation.last}</small>
              <span>{conversation.agent} / {conversation.stage} / {conversation.tag}</span>
            </span>
            <span className="conversation-meta">
              <time>{conversation.time}</time>
              {conversation.unread > 0 ? <b>{conversation.unread}</b> : null}
            </span>
          </button>
        ))}
      </aside>

      <section className="message-pane">
        <header>
          <span className="avatar">M</span>
          <div>
            <strong>{selected.name}</strong>
            <small>{selected.channel} / {selected.agent} / {selected.stage}</small>
          </div>
          <span className="status-pill">IA atendendo</span>
        </header>

        <div className="message-stream">
          <article className="system-event">
            <Sparkles size={16} />
            <span>Keila consultou o catalogo antes de responder sobre preco e disponibilidade.</span>
          </article>

          <article className="message-bubble inbound">
            <span>Oi, queria ver aliancas douradas para casal.</span>
            <small>15:39</small>
          </article>

          <article className="message-bubble outbound">
            <span>Tenho sim. Separei modelos dourados disponiveis e com bom custo-beneficio. Quer ver os mais economicos ou os mais vendidos?</span>
            <small><CheckCheck size={14} /> entregue</small>
          </article>

          <article className="product-card">
            <span className="product-thumb">AC</span>
            <div>
              <strong>Par de aliancas douradas</strong>
              <small>Catalogo real / estoque confirmado</small>
            </div>
            <b>R$ 349</b>
          </article>

          <article className="message-bubble inbound">
            <span>{selected.last}</span>
            <small>15:42</small>
          </article>

          <article className="ai-summary">
            <Bot size={16} />
            <span>Resumo: cliente procura alianca dourada, tamanhos 18 e 20, orcamento aproximado ate R$350.</span>
          </article>
        </div>

        <footer className="composer">
          <button className="attach-button" type="button" aria-label="Anexar">
            <Paperclip size={18} />
          </button>
          <input aria-label="Mensagem" placeholder="Digite uma mensagem manual" />
          <button type="button" aria-label="Enviar">
            <Send size={18} />
          </button>
        </footer>
      </section>

      <aside className="customer-panel">
        <header>
          <span className="avatar">M</span>
          <div>
            <h2>{selected.name}</h2>
            <small>Lead quente / {selected.channel}</small>
          </div>
        </header>

        <dl>
          <div><dt>Identificador</dt><dd>+55 92 99999-0000</dd></div>
          <div><dt>Memoria</dt><dd>Prefere dourado e opcoes economicas.</dd></div>
          <div><dt>Produto</dt><dd>Par de aliancas douradas</dd></div>
          <div><dt>Pedido</dt><dd>Rascunho ainda nao criado</dd></div>
          <div><dt>Pagamento</dt><dd>Sem pendencia</dd></div>
          <div><dt>Follow-up</dt><dd>Agendar se ficar 2h sem resposta</dd></div>
        </dl>

        <div className="panel-actions">
          <button type="button"><Hand size={16} /> Assumir conversa</button>
          <button type="button"><Bot size={16} /> Devolver para IA</button>
          <button type="button"><CircleAlert size={16} /> Encerrar conversa</button>
          <button type="button">Criar pedido</button>
          <button type="button">Gerar cobranca</button>
          <button type="button">Ver catalogo</button>
        </div>
      </aside>
    </section>
  );
}
