// Minimal request/response shape the Vercel Node runtime hands a function in
// api/*.ts (it parses a JSON body onto req.body and adds res.status()/json()
// itself; no @vercel/node type dependency needed for this small a surface).
export interface FnRequest {
  method?: string;
  body?: unknown;
}
export interface FnResponse {
  status(code: number): FnResponse;
  json(body: unknown): void;
}

export function jsonError(res: FnResponse, status: number, error: string, code: string): void {
  res.status(status).json({ error, code });
}

export function methodNotAllowed(res: FnResponse): void {
  jsonError(res, 405, 'method not allowed', 'validation.failed');
}

export function bodyOf(req: FnRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}
