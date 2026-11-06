import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession } from "@/lib/session";

const maxAge = 60 * 60 * 24 * 14;

export async function writeSession(session: { id: string; email: string }) {
  const token = await signSession(session);
  if (!token) throw new Error("Sessão indisponível.");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
