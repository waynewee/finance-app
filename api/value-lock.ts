import bcrypt from "bcryptjs";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { readJsonBody, sendError } from "./_lib/http.js";

async function handleStatus(res: VercelResponse) {
  const rows = await sql`select 1 from value_lock where id = true`;
  res.status(200).json({ hasPassword: rows.length > 0 });
}

async function handleSet(req: VercelRequest, res: VercelResponse) {
  const { password } = await readJsonBody<{ password: string }>(req);
  const normalized = password?.trim() ?? "";

  if (normalized.length < 8) {
    sendError(res, 400, "Passwords must be at least 8 characters.");
    return;
  }

  const passwordHash = await bcrypt.hash(normalized, 10);

  await sql`
    insert into value_lock (id, password_hash, updated_at)
    values (true, ${passwordHash}, now())
    on conflict (id) do update set
      password_hash = excluded.password_hash,
      updated_at = now()
  `;

  res.status(200).json({ ok: true });
}

async function handleClear(res: VercelResponse) {
  await sql`delete from value_lock where id = true`;
  res.status(200).json({ ok: true });
}

async function handleVerify(req: VercelRequest, res: VercelResponse) {
  const { password } = await readJsonBody<{ password: string }>(req);
  const normalized = password?.trim() ?? "";

  const rows = await sql`select password_hash from value_lock where id = true`;
  const passwordHash = rows[0]?.password_hash as string | undefined;

  if (!passwordHash) {
    res.status(200).json({ valid: false });
    return;
  }

  const valid = await bcrypt.compare(normalized, passwordHash);
  res.status(200).json({ valid });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      await handleStatus(res);
      return;
    }

    if (req.method === "POST") {
      const action = (req.query.action as string) ?? "";

      switch (action) {
        case "set":
          await handleSet(req, res);
          return;
        case "clear":
          await handleClear(res);
          return;
        case "verify":
          await handleVerify(req, res);
          return;
        default:
          sendError(res, 400, `Unknown action: ${action}`);
          return;
      }
    }

    sendError(res, 405, "Method not allowed");
  } catch (error) {
    sendError(
      res,
      500,
      error instanceof Error ? error.message : "Unexpected server error",
    );
  }
}
