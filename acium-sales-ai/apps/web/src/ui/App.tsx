import {
  Bot,
  Boxes,
  ClipboardList,
  Inbox,
  Megaphone,
  Settings,
  ShoppingBag,
  Users,
  UserCog,
  WalletCards
} from "lucide-react";
import { InboxView } from "./InboxView";

const menu = [
  { label: "Inbox", icon: Inbox },
  { label: "Clientes", icon: Users },
  { label: "Catalogo", icon: Boxes },
  { label: "Pedidos", icon: ClipboardList },
  { label: "Vendas", icon: ShoppingBag },
  { label: "Automacoes", icon: WalletCards },
  { label: "Agentes IA", icon: Bot },
  { label: "Campanhas", icon: Megaphone },
  { label: "Configuracoes", icon: Settings },
  { label: "Usuarios", icon: UserCog }
];

export function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Menu principal">
        <strong className="brand">ACIUM</strong>
        <nav>
          {menu.map((item) => (
            <button className={item.label === "Inbox" ? "nav-item active" : "nav-item"} key={item.label} type="button">
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <InboxView />
      </section>
    </main>
  );
}
