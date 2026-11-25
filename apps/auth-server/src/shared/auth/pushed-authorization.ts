import { createHash, randomBytes } from "node:crypto";
import {
  extendOAuthProvider,
  getOAuthProviderApi,
  type OAuthOptions,
  type OAuthProviderExtension,
  type Scope,
} from "@better-auth/oauth-provider";
import { consumePushedRequest, createPushedRequest, type Executor } from "@repo/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as v from "valibot";

// Pushed authorization requests (RFC 9126). An app posts its authorization parameters to
// /oauth2/par, authenticated as it would be at the token endpoint, and gets a request_uri back;
// it then sends the browser to /oauth2/authorize with only client_id and that request_uri. So
// the parameters can't be read or altered in the browser, and they're checked before the user
// sees anything. The OAuth provider plugin resolves a request_uri through `requestUriResolver`;
// this adds the endpoint that issues one, and advertises it in discovery.

export const PAR_PATH = "/oauth2/par";

/** How long a request_uri can be used, in seconds: long enough for one redirect. */
export const PUSHED_REQUEST_LIFETIME = 60;

const REQUEST_URI_PREFIX = "urn:ietf:params:oauth:request_uri:";

/** How the client proved who it is: never stored with the parameters. */
const CLIENT_AUTHENTICATION = new Set([
  "client_secret",
  "client_assertion",
  "client_assertion_type",
]);

/**
 * Each parameter once, as a string. A request_uri carries plain parameters back to
 * /oauth2/authorize, so a repeated one (a second `resource`) can't be represented.
 */
const PushedParametersSchema = v.pipe(
  v.record(v.pipe(v.string(), v.maxLength(64)), v.pipe(v.string(), v.maxLength(4096))),
  v.check((parameters) => Object.keys(parameters).length <= 40),
);

function hashRequestUri(requestUri: string): string {
  return createHash("sha256").update(requestUri).digest("base64url");
}

/** An RFC 6749 error response: 400 with `error` and `error_description`. */
function refuse(error: string, description: string): APIError {
  return new APIError("BAD_REQUEST", { error, error_description: description });
}

/** The provider's own options: the ones its token endpoint authenticates clients with. */
function providerOptions(context: { getPlugin: (id: string) => unknown }): OAuthOptions<Scope[]> {
  const provider = context.getPlugin("oauth-provider") as {
    options?: OAuthOptions<Scope[]>;
  } | null;
  if (!provider?.options) throw new APIError("INTERNAL_SERVER_ERROR");
  return provider.options;
}

/**
 * For oauthProvider's `requestUriResolver`: the parameters pushed under this request_uri, once,
 * if this client pushed them and they haven't expired. Anything else is null, which the plugin
 * answers with `invalid_request_uri`.
 */
export function pushedRequestResolver(
  database: Executor,
): NonNullable<OAuthOptions<Scope[]>["requestUriResolver"]> {
  return async ({ requestUri, clientId }) => {
    if (!requestUri.startsWith(REQUEST_URI_PREFIX)) return null;
    const parameters = await consumePushedRequest(database, {
      requestUriHash: hashRequestUri(requestUri),
      clientId,
    });
    return parameters ?? null;
  };
}

/** The PAR endpoint, and `pushed_authorization_request_endpoint` in discovery. After oauthProvider. */
export function pushedAuthorizationRequests(database: Executor): BetterAuthPlugin {
  const extension: OAuthProviderExtension = {
    metadata: ({ document }) => ({
      pushed_authorization_request_endpoint: String(document.token_endpoint).replace(
        /\/oauth2\/token$/,
        PAR_PATH,
      ),
      require_pushed_authorization_requests: false,
    }),
  };

  return {
    id: "pushed-authorization-requests",
    init(ctx) {
      extendOAuthProvider(ctx, extension);
    },
    endpoints: {
      pushAuthorizationRequest: createAuthEndpoint(
        PAR_PATH,
        // A form, as RFC 9126 says. The client authentication reads the body again, as the
        // token endpoint's does.
        {
          method: "POST",
          cloneRequest: true,
          metadata: { allowedMediaTypes: ["application/x-www-form-urlencoded"] },
        },
        async (ctx) => {
          const options = providerOptions(ctx.context);
          const parsed = v.safeParse(PushedParametersSchema, ctx.body ?? {});
          if (!parsed.success) {
            throw refuse("invalid_request", "Each parameter must be given once, as a string.");
          }
          const pushed = parsed.output;
          if ("request_uri" in pushed) {
            throw refuse("invalid_request", "request_uri can't be pushed.");
          }
          if ("request" in pushed) {
            throw refuse("request_not_supported", "Request objects aren't supported.");
          }

          // As at the token endpoint: a secret (basic or post) for a confidential client, its
          // client_id alone for a public one. Refusals come back as invalid_client.
          const api = getOAuthProviderApi(ctx, options, "authorization_code");
          const { client } = await api.authenticateClient({ requireCredentials: false });
          if (pushed.client_id !== undefined && pushed.client_id !== client.clientId) {
            throw refuse("invalid_request", "client_id isn't the client that authenticated.");
          }

          // What /oauth2/authorize checks again when the request_uri comes back, checked here
          // first so a bad request is refused to the app, not shown to the user.
          if (pushed.response_type !== "code") {
            throw refuse("unsupported_response_type", "response_type must be code.");
          }
          if (!pushed.redirect_uri || !(client.redirectUris ?? []).includes(pushed.redirect_uri)) {
            throw refuse("invalid_request", "redirect_uri isn't one of the client's.");
          }
          if (!pushed.code_challenge || pushed.code_challenge_method !== "S256") {
            throw refuse("invalid_request", "PKCE with code_challenge_method S256 is required.");
          }
          const allowed = new Set<string>(client.scopes ?? options.scopes ?? []);
          const unknown = (pushed.scope ?? "").split(" ").filter((s) => s && !allowed.has(s));
          if (unknown.length > 0) {
            throw refuse("invalid_scope", `Not the client's: ${unknown.join(", ")}.`);
          }

          const parameters = Object.fromEntries(
            Object.entries(pushed).filter(([name]) => !CLIENT_AUTHENTICATION.has(name)),
          );
          parameters.client_id = client.clientId;
          const requestUri = `${REQUEST_URI_PREFIX}${randomBytes(32).toString("base64url")}`;
          await createPushedRequest(database, {
            requestUriHash: hashRequestUri(requestUri),
            clientId: client.clientId,
            parameters,
            expiresAt: new Date(Date.now() + PUSHED_REQUEST_LIFETIME * 1000),
          });

          ctx.setStatus(201);
          ctx.setHeader("Cache-Control", "no-store");
          return ctx.json({ request_uri: requestUri, expires_in: PUSHED_REQUEST_LIFETIME });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
