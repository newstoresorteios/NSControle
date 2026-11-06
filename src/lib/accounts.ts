export const ACCOUNT_DOMAIN = "team.nscontrole.app";

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[a-z][a-z0-9]{1,30}$/.test(value);
}

export function accountEmail(username: string) {
  return `${username}@${ACCOUNT_DOMAIN}`;
}
