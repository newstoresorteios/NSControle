export async function pushTracking(orderKey: string, tracking: string) {
  if (!/^\d+$/.test(orderKey)) return "Rastreio gravado no pedido. Esta venda não tem número da Tray para devolução automática.";
  const base = process.env.TRAY_ADAPTER_URL?.trim();
  const token = process.env.TRAY_ADAPTER_TOKEN?.trim();
  if (!base || !token) return "Rastreio gravado no pedido. A loja ainda não está ligada para devolver o código.";
  try {
    const response = await fetch(new URL(`internal/orders/${orderKey}/shipping`, base.endsWith("/") ? base : `${base}/`), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sending_code: tracking,
        sending_date: new Date().toISOString().slice(0, 10),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return "Rastreio gravado no pedido. A loja não aceitou a devolução do código.";
    return "Rastreio devolvido à loja";
  } catch {
    return "Rastreio gravado no pedido. A loja não respondeu.";
  }
}
