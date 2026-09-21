import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_SIDECAR_URL = "http://127.0.0.1:9080";
export const TOKEN_HEADER = "X-Aura-Token";
const TIMEOUT_MS = 8_000;

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type SidecarDeps = {
  fetch?: FetchLike;
  readTokenFile?: (path: string) => Promise<string>;
  env?: NodeJS.ProcessEnv;
};

export function resolveSidecarBase(raw?: string): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_SIDECAR_URL;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_SIDECAR_URL;
    }
    const host = url.hostname;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      return DEFAULT_SIDECAR_URL;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SIDECAR_URL;
  }
}

export function parseSidecarResponse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Sidecar returned an empty body. Is ags-sidecar running?");
  }
  let json: { ok?: boolean; error?: string; data?: unknown };
  try {
    json = JSON.parse(trimmed) as {
      ok?: boolean;
      error?: string;
      data?: unknown;
    };
  } catch {
    throw new Error("Could not parse sidecar JSON");
  }
  if (json.ok !== true) {
    throw new Error(json.error ?? "Sidecar error");
  }
  return json.data;
}

export function tokenFromMetaJson(json: unknown): string {
  if (typeof json !== "object" || json === null) {
    throw new Error("Sidecar /api/meta did not return JSON");
  }
  const token = (json as { http_token?: unknown }).http_token;
  if (typeof token !== "string" || token.length < 16) {
    throw new Error("Sidecar /api/meta did not return http_token");
  }
  return token;
}

async function readRuntimeToken(
  env: NodeJS.ProcessEnv,
  readTokenFile: (path: string) => Promise<string>,
): Promise<string | null> {
  const fromEnv = env.AURA_HTTP_TOKEN?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const runtimeDir = env.XDG_RUNTIME_DIR;
  if (!runtimeDir) return null;
  try {
    const text = (await readTokenFile(join(runtimeDir, "aura-http-token"))).trim();
    if (text.length >= 16) return text;
  } catch {
    // file missing or unreadable
  }
  return null;
}

export async function resolveSidecarToken(
  baseUrl: string,
  deps: SidecarDeps = {},
): Promise<string> {
  const env = deps.env ?? process.env;
  const readTokenFile = deps.readTokenFile ?? ((path) => readFile(path, "utf8"));
  const fetchImpl = deps.fetch ?? fetch;

  const cached = await readRuntimeToken(env, readTokenFile);
  if (cached) return cached;

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(`${baseUrl}/api/meta`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Sidecar timed out reading /api/meta");
    }
    throw new Error("Can't reach ags-sidecar. Is Aura running?");
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Could not parse sidecar /api/meta");
  }
  return tokenFromMetaJson(json);
}

export async function sidecarCall(
  method: string,
  params?: Record<string, unknown>,
  opts: { baseUrl?: string; deps?: SidecarDeps; token?: string } = {},
): Promise<unknown> {
  const baseUrl = resolveSidecarBase(opts.baseUrl);
  const deps = opts.deps ?? {};
  const fetchImpl = deps.fetch ?? fetch;
  const token = opts.token ?? (await resolveSidecarToken(baseUrl, deps));

  let res: Awaited<ReturnType<FetchLike>>;
  try {
    const hasParams = params && Object.keys(params).length > 0;
    res = await fetchImpl(`${baseUrl}/api/${encodeURIComponent(method)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TOKEN_HEADER]: token,
      },
      body: hasParams ? JSON.stringify(params) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Sidecar timed out (${method})`);
    }
    throw new Error("Can't reach ags-sidecar. Is Aura running?");
  }

  const text = await res.text();
  try {
    return parseSidecarResponse(text);
  } catch (err) {
    if (!res.ok) {
      throw new Error(
        err instanceof Error
          ? err.message
          : `Sidecar HTTP ${res.status}`,
      );
    }
    throw err;
  }
}
