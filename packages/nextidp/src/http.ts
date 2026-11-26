import { createHttp } from "fast-http-client";

// Every request nextidp makes to the auth server. Reads (discovery, userinfo) are retried on
// network errors and 5xx; posts to the token and revocation endpoints never are: a code works
// once, and a refresh token is rotated by the first request that reaches the server. No
// circuit breaker: a run of refused codes (people pressing Back) must not stop sign-ins.

export type Answer = { ok: boolean; status: number; data: unknown };

export type Http = {
  get(url: string, headers?: Record<string, string>): Promise<Answer>;
  postForm(url: string, form: URLSearchParams, headers?: Record<string, string>): Promise<Answer>;
};

/** An HttpError from fast-http-client, by shape: it carries the status and the parsed body. */
function refusal(error: unknown): Answer | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { status, data } = error as { status?: unknown; data?: unknown };
  return typeof status === "number" ? { ok: false, status, data } : undefined;
}

export function createIdpHttp(): Http {
  const client = createHttp({
    timeoutMs: 10_000,
    headers: { accept: "application/json" },
    circuitBreaker: false,
  });
  return {
    async get(url, headers) {
      try {
        const response = await client.get<unknown>(url, headers ? { headers } : {});
        return { ok: true, status: response.status, data: response.data };
      } catch (error) {
        const answer = refusal(error);
        if (answer) return answer;
        throw error;
      }
    },
    async postForm(url, form, headers) {
      try {
        const response = await client.post<unknown>(url, form, {
          retry: false,
          headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
        });
        return { ok: true, status: response.status, data: response.data };
      } catch (error) {
        const answer = refusal(error);
        if (answer) return answer;
        throw error;
      }
    },
  };
}
