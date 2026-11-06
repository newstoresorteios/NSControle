"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accountEmail, normalizeUsername, validUsername } from "@/lib/accounts";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { acceptablePassword, hashPassword } from "@/lib/passwords";

function finish(error?: string, ok?: string): never {
  revalidatePath("/usuarios");
  const params = new URLSearchParams();
  if (error) params.set("erro", error);
  if (ok) params.set("ok", ok);
  redirect(`/usuarios${params.size ? `?${params}` : ""}`);
}

function roleOf(value: FormDataEntryValue | null) {
  return value === "admin" ? "admin" : "membro";
}

async function adminCount(except?: string) {
  const [row] = await db()`
    select count(*)::int as total from ctl_team_members
    where role = 'admin' and (${except || ""} = "" or user_id::text <> ${except || ""})
  `;
  return Number(row?.total || 0);
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const displayName = String(formData.get("display_name") ?? "").trim();
  const password = String(formData.get("password") ?? "") || "123456";
  const role = roleOf(formData.get("role"));
  if (!validUsername(username) || !displayName || displayName.length > 80) finish("invalido");
  if (!acceptablePassword(password)) finish("senha");
  const email = accountEmail(username);
  try {
    await db().begin(async (sql) => {
      await sql`insert into ctl_allowed_emails (email) values (${email}) on conflict (email) do nothing`;
      await sql`
        insert into ctl_team_members (user_id, email, username, display_name, role, password_hash)
        values (${randomUUID()}, ${email}, ${username}, ${displayName}, ${role}, ${hashPassword(password)})
      `;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") finish("existe");
    finish("salvar");
  }
  finish(undefined, "criado");
}

export async function updateUser(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !displayName || displayName.length > 80) finish("invalido");
  if (password && !acceptablePassword(password)) finish("senha");
  const own = id === actor.userId;
  const role = own ? actor.role : roleOf(formData.get("role"));
  if (!own && role !== "admin" && (await adminCount(id)) < 1) finish("ultimo");
  const [current] = await db()`select password_hash from ctl_team_members where user_id = ${id}`;
  if (!current) finish("invalido");
  if (password && !current.password_hash) finish("email");
  await db()`
    update ctl_team_members
    set display_name = ${displayName},
        role = ${role},
        password_hash = ${password ? hashPassword(password) : current.password_hash}
    where user_id = ${id}
  `;
  finish(undefined, "salvo");
}

export async function removeUser(formData: FormData) {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) finish("invalido");
  if (id === actor.userId) finish("proprio");
  const [current] = await db()`select email, role from ctl_team_members where user_id = ${id}`;
  if (!current) finish("invalido");
  if (current.role === "admin" && (await adminCount(id)) < 1) finish("ultimo");
  await db().begin(async (sql) => {
    await sql`delete from ctl_team_members where user_id = ${id}`;
    await sql`delete from ctl_allowed_emails where email = ${current.email}`;
  });
  finish(undefined, "excluido");
}
