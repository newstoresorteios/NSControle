"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db, insertRow, updateRow } from "@/lib/db";
import { text } from "@/lib/form";
import { validUuid } from "@/lib/operational";
import { openSecret, sealSecret } from "@/lib/vault";

function entryFields(formData: FormData) {
  const kind = text(formData, "kind") === "link" ? "link" : "login";
  return {
    kind,
    name: text(formData, "name"),
    url: text(formData, "url"),
    account: text(formData, "account"),
    note: text(formData, "note"),
    secret: text(formData, "secret"),
  };
}

function hrefOf(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

export async function revealSecret(id: string) {
  await requireTeam();
  if (!validUuid(id)) return null;
  const [row] = await db()<{ secret: string | null }[]>`
    select secret from ctl_vault_entries where id = ${id}
  `;
  return openSecret(row?.secret);
}

export async function createEntry(formData: FormData) {
  await requireTeam();
  const fields = entryFields(formData);
  if (!fields.name) redirect("/logins?erro=1");
  const secret = fields.secret ? sealSecret(fields.secret) : null;
  try {
    await insertRow("ctl_vault_entries", {
      kind: fields.kind,
      name: fields.name,
      url: hrefOf(fields.url) ?? fields.url,
      account: fields.account,
      note: fields.note,
      secret,
    });
  } catch {
    redirect("/logins?erro=1");
  }
  revalidatePath("/logins");
  redirect("/logins?ok=1");
}

export async function updateEntry(formData: FormData) {
  await requireTeam();
  const id = text(formData, "id") ?? "";
  if (!validUuid(id)) redirect("/logins?erro=1");
  const fields = entryFields(formData);
  if (!fields.name) redirect("/logins?erro=1");
  const patch: Record<string, unknown> = {
    kind: fields.kind,
    name: fields.name,
    url: hrefOf(fields.url) ?? fields.url,
    account: fields.account,
    note: fields.note,
    updated_at: new Date().toISOString(),
  };
  if (fields.secret) patch.secret = sealSecret(fields.secret);
  try {
    await updateRow("ctl_vault_entries", patch, "id", id);
  } catch {
    redirect("/logins?erro=1");
  }
  revalidatePath("/logins");
  redirect("/logins?ok=1");
}
