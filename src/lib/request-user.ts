export const USER_ID_HEADER = "x-controle-user-id";
export const USER_EMAIL_HEADER = "x-controle-user-email";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestUser(headerId: string | null, headerEmail: string | null) {
  if (!headerId || !headerEmail) return null;
  if (!UUID.test(headerId) || /[\u0000-\u001f\u007f]/.test(headerEmail)) return null;
  const email = headerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return { id: headerId, email };
}
