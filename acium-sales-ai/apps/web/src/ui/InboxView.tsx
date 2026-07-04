import { Bot, Check, CheckCheck, CircleAlert, Hand, Mic, MoreVertical, Paperclip, Search, Send, Smile } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchConversations, fetchMessages, type Conversation, type Message } from "../api/client";

const filters = ["Todas", "WhatsApp", "Instagram", "Facebook", "Nao lidas", "IA", "Humano", "Pagamento", "Pedido", "Follow-up"];

export function InboxView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    refetchInterval: 8_000
  });

  const selected = useMemo(() => {
    if (selectedId) return conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0] ?? null;
    return conversations[0] ?? null;
  }, [conversations, selectedId]);

  const { data: messages = [] } = useQuery({
    queryKey: ["conversation-messages", selected?.id],
    queryFn: () => fetchMessages(selected!.id),
    enabled: Boolean(selected?.id),
    refetchInterval: 5_000
  });

  return (
    <section className="wa-shell" aria-label="Inbox">
      <aside className="wa-chat-list">
        <header className="wa-list-top">
          <div>
            <strong>Conversas</strong>
            <span>{conversations.length} conversas reais</span>
          </div>
          <button type="button" aria-label="Buscar conversas"><Search size={19} /></button>
        </header>

        <div className="wa-search"><Search size={16} /><input placeholder="Pesquisar ou comecar uma conversa" /></div>

        <div className="wa-filter-strip">
          {filters.map((filter) => <button key={filter} type="button">{filter}</button>)}
        </div>

        <div className="wa-list-scroll">
          {isLoading ? <div className="wa-empty-list">Carregando conversas...</div> : null}
          {!isLoading && conversations.length === 0 ? <div className="wa-empty-list">Nenhuma conversa real recebida ainda.</div> : null}
          {conversations.map((conversation) => (
            <button
              className={conversation.id === selected?.id ? "wa-chat-row selected" : "wa-chat-row"}
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              type="button"
            >
              <Avatar conversation={conversation} />
              <span className="wa-chat-copy">
                <span className="wa-chat-title"><strong>{displayName(conversation)}</strong><time>{formatTime(conversation.last_message_at)}</time></span>
                <small>{conversation.last_message_text || conversation.stage || "Conversa sem mensagem de texto"}</small>
              </span>
              {conversation.human_required ? <b className="wa-alert-dot">!</b> : null}
            </button>
          ))}
        </div>
      </aside>

      <section className="wa-conversation">
        {selected ? (
          <>
            <header className="wa-chat-top">
              <Avatar conversation={selected} />
              <div>
                <strong>{displayName(selected)}</strong>
                <small>{channelLabel(selected.channel)} / {selected.current_agent || "auto_router"} / {selected.stage || "new_lead"}</small>
              </div>
              <span className={selected.automation_paused ? "wa-mode human" : "wa-mode"}>{selected.automation_paused ? "Humano" : "IA ativa"}</span>
              <button type="button" aria-label="Mais opcoes"><MoreVertical size={20} /></button>
            </header>

            <div className="wa-message-wall">
              {messages.length === 0 ? <div className="wa-empty-chat">Sem mensagens carregadas para esta conversa.</div> : null}
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            </div>

            <footer className="wa-composer">
              <button type="button" aria-label="Emoji"><Smile size={22} /></button>
              <button type="button" aria-label="Anexar"><Paperclip size={22} /></button>
              <input placeholder="Digite uma mensagem" />
              <button className="send" type="button" aria-label="Enviar"><Send size={20} /></button>
              <button type="button" aria-label="Audio"><Mic size={21} /></button>
            </footer>
          </>
        ) : (
          <div className="wa-no-chat">
            <strong>Inbox pronta para mensagens reais</strong>
            <span>Configure o webhook da Meta para WhatsApp, Instagram ou Facebook e as conversas aparecerao aqui.</span>
          </div>
        )}
      </section>

      <aside className="wa-side-panel">
        {selected ? <CustomerPanel conversation={selected} /> : null}
      </aside>
    </section>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  return (
    <article className={outbound ? "wa-bubble outbound" : "wa-bubble inbound"}>
      {message.media_storage_key ? <span className="wa-media-chip">Midia salva no R2</span> : null}
      <span>{message.body || labelForMessageType(message.message_type)}</span>
      <small>{formatTime(message.created_at)} {outbound ? <CheckCheck size={14} /> : <Check size={13} />}</small>
    </article>
  );
}

function CustomerPanel({ conversation }: { conversation: Conversation }) {
  return (
    <>
      <header className="wa-side-head">
        <Avatar conversation={conversation} />
        <strong>{displayName(conversation)}</strong>
        <span>{channelLabel(conversation.channel)}</span>
      </header>
      <dl className="wa-facts">
        <div><dt>Identificador</dt><dd>{conversation.channel_customer_id || "Sem identificador"}</dd></div>
        <div><dt>Etapa</dt><dd>{conversation.stage || "new_lead"}</dd></div>
        <div><dt>Agente</dt><dd>{conversation.current_agent || "auto_router"}</dd></div>
        <div><dt>Status</dt><dd>{conversation.status || "ai_active"}</dd></div>
        <div><dt>Follow-up</dt><dd>{conversation.next_followup_at ? formatTime(conversation.next_followup_at) : "Sem follow-up"}</dd></div>
      </dl>
      <div className="wa-actions">
        <button type="button"><Hand size={16} />Assumir conversa</button>
        <button type="button"><Bot size={16} />Devolver para IA</button>
        <button type="button"><CircleAlert size={16} />Encerrar conversa</button>
        <button className="secondary" type="button">Criar pedido</button>
        <button className="secondary" type="button">Gerar cobranca</button>
        <button className="secondary" type="button">Ver catalogo</button>
      </div>
    </>
  );
}

function Avatar({ conversation }: { conversation: Conversation }) {
  const name = displayName(conversation);
  if (conversation.customer_avatar_url) return <img className="wa-avatar" src={conversation.customer_avatar_url} alt="" />;
  return <span className="wa-avatar">{name.slice(0, 1).toUpperCase()}</span>;
}

function displayName(conversation: Conversation): string {
  return conversation.customer_name || conversation.channel_customer_id || "Cliente";
}

function channelLabel(channel: string): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "instagram") return "Instagram";
  if (channel === "facebook") return "Facebook";
  return channel;
}

function labelForMessageType(type: string): string {
  if (type === "image") return "Imagem recebida";
  if (type === "audio") return "Audio recebido";
  if (type === "video") return "Video recebido";
  if (type === "document") return "Documento recebido";
  return "Mensagem sem texto";
}

function formatTime(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
