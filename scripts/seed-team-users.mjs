import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import postgres from "postgres";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

const users = [
  ["felipe", "Felipe", "admin"],
  ["joao", "João", "membro"],
  ["ramon", "Ramon", "membro"],
  ["tironi", "Tironi", "admin"],
];

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL ausente");
const sql = postgres(connection, { ssl: "require", max: 1, prepare: false });

try {
  for (const [username, displayName, role] of users) {
    const email = `${username}@team.nscontrole.app`;
    const [existing] = await sql`select user_id from ctl_team_members where username = ${username}`;
    if (existing) {
      console.log(`já existe ${username}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx`insert into ctl_allowed_emails (email) values (${email}) on conflict (email) do nothing`;
      await tx`
        insert into ctl_team_members (user_id, email, username, display_name, role, password_hash)
        values (${randomUUID()}, ${email}, ${username}, ${displayName}, ${role}, ${hashPassword("123456")})
      `;
    });
    console.log(`criado ${username} ${role}`);
  }
} finally {
  await sql.end();
}
