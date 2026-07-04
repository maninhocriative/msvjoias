const metrics = [
  ["Vendas do dia", "R$ 0,00"],
  ["Conversas abertas", "0"],
  ["Aguardando humano", "0"],
  ["IA atendendo", "0"],
  ["Pagamentos pendentes", "0"],
  ["Pedidos pendentes", "0"],
  ["Clientes em follow-up", "0"],
  ["Handoff humano", "0%"]
];

export function Dashboard() {
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
