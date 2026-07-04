import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "../api/client";

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 15_000
  });

  const metrics = [
    ["Vendas do dia", formatCurrency(data?.salesTodayCents ?? 0)],
    ["Conversas abertas", String(data?.openConversations ?? 0)],
    ["Aguardando humano", String(data?.waitingHuman ?? 0)],
    ["IA atendendo", String(data?.aiActive ?? 0)],
    ["Pagamentos pendentes", String(data?.paymentPending ?? 0)],
    ["Pedidos pendentes", String(data?.orderPending ?? 0)],
    ["Clientes em follow-up", String(data?.followupActive ?? 0)],
    ["Handoff humano", `${data?.handoffRate ?? 0}%`]
  ];

  return (
    <section className="dashboard" aria-label="Painel">
      {metrics.map(([label, value]) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </section>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(cents / 100);
}
