import type { VercelRequest, VercelResponse } from "@vercel/node";

export function sendError(
  res: VercelResponse,
  status: number,
  message: string,
): void {
  res.status(status).json({ error: message });
}

export async function readJsonBody<T>(req: VercelRequest): Promise<T> {
  if (req.body && typeof req.body === "object") {
    return req.body as T;
  }

  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body) as T;
  }

  return {} as T;
}
