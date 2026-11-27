// A Cloudflare Worker using nextidp, for src/edge.test.ts: bundled with esbuild for a runtime
// with no Node APIs at all, then run in workerd (Miniflare) without Node compatibility. Its
// settings come from the Worker's bindings, as a real Worker's would.
import { Hono } from "hono";
import { type IdpEnv, idp, memoryStore } from "../src/hono.js";
import { idp as coreIdp } from "../src/index.js";

type Bindings = {
  ISSUER: string;
  CLIENT_ID: string;
  APP_URL: string;
  SECRET: string;
  AUDIENCE: string;
  SERVICE_CLIENT_ID: string;
  SERVICE_CLIENT_SECRET: string;
};

let bindings: Bindings | undefined;
const env = (): Bindings => {
  if (!bindings) throw new Error("No bindings yet.");
  return bindings;
};

// Read on first use, from the bindings the first request brought.
const auth = idp(() => ({
  issuer: env().ISSUER,
  clientId: env().CLIENT_ID,
  appUrl: env().APP_URL,
  secret: env().SECRET,
  audience: env().AUDIENCE,
  store: memoryStore(),
  env: {},
}));

// The core entry point on its own: a service's tokens (client credentials).
const service = coreIdp(() => ({
  issuer: env().ISSUER,
  clientId: env().SERVICE_CLIENT_ID,
  clientSecret: env().SERVICE_CLIENT_SECRET,
  env: {},
}));

const app = new Hono<IdpEnv>();
app.all("/auth/*", auth.routes());
app.use(auth.middleware());
app.get("/", (c) => c.json({ user: c.get("session")?.user.id ?? null }));
app.get("/dashboard", auth.requireSession(), (c) =>
  c.json({ user: c.get("session")?.user.id, accessToken: c.get("session")?.accessToken }),
);
app.get("/api/orders", auth.requireToken({ scopes: ["orders:read"] }), (c) =>
  c.json({ subject: c.get("token").subject }),
);
app.get("/service-token", async (c) =>
  c.json({ token: await service.serviceToken({ scopes: ["orders:read"] }) }),
);
app.get("/runtime", (c) =>
  c.json({ process: typeof (globalThis as { process?: unknown }).process }),
);

export default {
  fetch(request: Request, workerBindings: Bindings) {
    bindings = workerBindings;
    return app.fetch(request, workerBindings);
  },
};
