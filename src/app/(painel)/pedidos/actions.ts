"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow, updateRow } from "@/lib/db";
import { decimal, flag, integer, monthDate, text } from "@/lib/form";

const SENTINEL = "0001-01-01";

function orderFields(formData: FormData) {
  const financeMonth = monthDate(formData, "finance_month");
  return {
    order_key: text(formData, "order_key"),
    label: text(formData, "label"),
    flow: text(formData, "flow") || "encomenda",
    origin: text(formData, "origin"),
    reference: text(formData, "reference"),
    product_name: text(formData, "product_name"),
    commercial_status: text(formData, "commercial_status"),
    sourcing_status: text(formData, "sourcing_status"),
    purchased: flag(formData, "purchased"),
    cpf_linked: flag(formData, "cpf_linked"),
    tax_paid: flag(formData, "tax_paid"),
    delivered: flag(formData, "delivered"),
    tracking_code: text(formData, "tracking_code"),
    tracking_situation: text(formData, "tracking_situation"),
    tracking_alert: text(formData, "tracking_alert"),
    tracking_correios: text(formData, "tracking_correios"),
    tracking_event_at: text(formData, "tracking_event_at"),
    purchase_date: text(formData, "purchase_date"),
    payment_date: text(formData, "payment_date"),
    sale_amount: decimal(formData, "sale_amount"),
    purchase_amount: decimal(formData, "purchase_amount"),
    payment_fee: decimal(formData, "payment_fee"),
    shipping_cost: decimal(formData, "shipping_cost"),
    import_tax: decimal(formData, "import_tax"),
    supplier_days: integer(formData, "supplier_days"),
    notes_internal: text(formData, "notes_internal"),
    notes_human: text(formData, "notes_human"),
    finance_month: financeMonth,
    finance_month_key: financeMonth ?? SENTINEL,
  };
}

export async function createOrder(formData: FormData) {
  await requireTeam();
  const fields = orderFields(formData);
  if (!fields.order_key) redirect("/pedidos?erro=numero");
  try {
    const data = await insertRow("ctl_orders", fields);
    revalidatePath("/pedidos");
    redirect(`/pedidos/${data.id}`);
  } catch {
    redirect("/pedidos?erro=salvar");
  }
}

const TEXT_FIELDS = [
  "origin",
  "product_name",
  "supplier_ref",
  "tracking_code",
  "notes_robot",
  "notes_human",
  "notes_internal",
  "tracking_situation",
  "tracking_alert",
  "tracking_correios",
  "commercial_status",
] as const;

const FLAG_FIELDS = ["purchased", "cpf_linked", "tax_paid", "delivered"] as const;

function sheetKey(label: string) {
  const folded = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const labeled = folded.match(/^pedido\s+(\d+)\b/);
  if (labeled) return labeled[1];
  const bare = folded.match(/^(\d+)\b/);
  if (bare) return bare[1];
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `label:${slug}`;
}

export async function addSheetRow(formData: FormData) {
  await requireTeam();
  const label = text(formData, "label");
  const origin = text(formData, "origin");
  if (!label || !origin) redirect("/pedidos?aba=pedidos&erro=numero");
  const orderKey = sheetKey(label);
  const existing = await db()<{ id: string }[]>`select id from ctl_orders where order_key = ${orderKey} limit 1`;
  if (existing.length > 0) {
    redirect(`/pedidos?aba=pedidos&numero=${encodeURIComponent(orderKey)}&erro=duplicado`);
  }
  try {
    await insertRow("ctl_orders", {
      order_key: orderKey,
      label,
      origin,
      product_name: text(formData, "product_name"),
      flow: "encomenda",
      finance_month: null,
      finance_month_key: SENTINEL,
    });
  } catch {
    redirect("/pedidos?aba=pedidos&erro=salvar");
  }
  revalidatePath("/pedidos");
  redirect("/pedidos?aba=pedidos");
}

export async function patchOrder(id: string, raw: Record<string, unknown>) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const };
  await requireTeam();
  const patch: Record<string, string | number | boolean | null> = {};

  for (const key of TEXT_FIELDS) {
    if (!(key in raw) || typeof raw[key] !== "string") continue;
    const value = raw[key].trim().slice(0, 4000);
    patch[key] = value || null;
  }
  for (const key of FLAG_FIELDS) {
    if (key in raw && typeof raw[key] === "boolean") patch[key] = raw[key];
  }
  for (const key of ["purchase_date", "payment_date"] as const) {
    if (!(key in raw)) continue;
    const value = typeof raw[key] === "string" ? raw[key].trim() : "";
    if (!value) patch[key] = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) patch[key] = value;
  }
  if ("tracking_event_at" in raw) {
    const value = typeof raw.tracking_event_at === "string" ? raw.tracking_event_at.trim() : "";
    if (!value) patch.tracking_event_at = null;
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      const parsed = new Date(`${value.slice(0, 16)}:00-03:00`);
      if (!Number.isNaN(parsed.getTime())) patch.tracking_event_at = parsed.toISOString();
    }
  }
  if ("supplier_days" in raw) {
    const value = raw.supplier_days;
    if (value === null || value === "") patch.supplier_days = null;
    else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 10000) {
      patch.supplier_days = value;
    }
  }

  if (Object.keys(patch).length === 0) return { ok: true as const };
  try {
    await updateRow("ctl_orders", patch, "id", id);
  } catch {
    return { ok: false as const };
  }
  revalidatePath("/pedidos");
  revalidatePath("/");
  revalidatePath(`/pedidos/${id}`);
  return { ok: true as const };
}

export async function updateOrder(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id");
  if (!id) redirect("/pedidos");
  const fields = orderFields(formData);
  if (!fields.order_key) redirect(`/pedidos/${id}?erro=numero`);
  try {
    await updateRow("ctl_orders", fields, "id", id);
  } catch {
    redirect(`/pedidos/${id}?erro=salvar`);
  }
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${id}`);
  revalidatePath("/");
  redirect(`/pedidos/${id}?ok=1`);
}
