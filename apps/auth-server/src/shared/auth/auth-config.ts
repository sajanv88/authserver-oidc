import "server-only";
import { oauthProvider } from "@better-auth/oauth-provider";
import { createAuthAdapter, type Executor, getUserSecurityByEmail } from "@repo/db";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, captcha, genericOAuth, jwt, magicLink, twoFactor } from "better-auth/plugins";
import type { OAuthApiConfig, ServerEnv } from "@/shared/config/env";
import {
  type EmailContent,
  existingAccountTemplate,
  magicLinkTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/shared/email";
import { turnstileHostnames } from "@/shared/security/turnstile";
import { SECURITY_PAGES } from "./account-pages";
import { accountPolicy } from "./account-policy";
import { AUTH_PAGES } from "./auth-pages";
import { CAPTCHA_ENDPOINTS } from "./captcha";
import {
  AUTH_COOKIE_PREFIX,
  LOGIN_PATH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./constants";
import { pushedAuthorizationRequests, pushedRequestResolver } from "./pushed-authorization";
import { socialProviderOptions, ssoProviderConfig } from "./social-providers";
import { socialTwoFactorGuard } from "./social-two-factor-guard";
import { mustSetUpTwoFactor } from "./two-factor-policy";

// Lifetimes, in seconds. Short for anything that's a bearer credential in a URL or a header.
export const LIFETIMES = {
  emailVerification: 60 * 60,
  passwordReset: 15 * 60,
  magicLink: 5 * 60,
  // Also how long the signed authorization query on /login, /two-factor and /consent stays
  // valid (Better Auth uses one setting for both): enough time to sign in, find an
  // authenticator and decide. Codes are single-use and PKCE-bound, and RFC 6749 caps them at
  // 10 minutes.
  authorizationCode: 10 * 60,
  accessToken: 10 * 60,
  idToken: 10 * 60,
  refreshToken: 30 * 24 * 60 * 60,
} as const;

export const OIDC_SCOPES = ["openid", "profile", "email", "offline_access"];

/** Every scope a client may ask for: the OpenID Connect ones, then the APIs' (OAUTH_API_SCOPES). */
export function offeredScopes(oauth: OAuthApiConfig): string[] {
  return [...OIDC_SCOPES, ...oauth.apiScopes];
}

export const LOGIN_PAGE = LOGIN_PATH;
export const CONSENT_PAGE = AUTH_PAGES.consent;

/**
 * Who owns the OIDC clients: the admins together, not the admin who happened to create one.
 * The plugin only lets a client's owner rotate or delete it, so without this a second admin
 * couldn't manage a client the first one made.
 */
export const ADMIN_CLIENT_OWNER = "admins";

function isAdmin(user: unknown): boolean {
  return (user as { role?: unknown } | undefined)?.role === "admin";
}

/** What a disabled account is told when it tries to sign in. */
export const DISABLED_ACCOUNT_MESSAGE = "This account is disabled.";

/**
 * The admin plugin's endpoints this server doesn't offer. Impersonation would let an admin
 * act as someone at every app; setting a password or an email would take an account over;
 * accounts are made by signing up and confirming the address. What's left: listing users,
 * disabling and enabling them, ending their sessions, their role, and deleting them.
 */
const DISABLED_ADMIN_PATHS = [
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/set-user-password",
  "/admin/update-user",
  "/admin/create-user",
];

// Tighter than the global limit (100 per minute per IP and path) on everything an attacker
// would hammer: guessing passwords, enumerating accounts, flooding inboxes. Counted in the
// rate_limits table, so every replica shares one count.
const RATE_LIMIT_RULES = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-up/email": { window: 60, max: 3 },
  "/request-password-reset": { window: 5 * 60, max: 3 },
  "/reset-password": { window: 5 * 60, max: 5 },
  "/send-verification-email": { window: 5 * 60, max: 3 },
  "/sign-in/magic-link": { window: 5 * 60, max: 3 },
  "/magic-link/verify": { window: 60, max: 10 },
  "/two-factor/*": { window: 60, max: 5 },
  "/change-password": { window: 5 * 60, max: 5 },
  "/sign-in/social": { window: 60, max: 10 },
  "/callback/*": { window: 60, max: 10 },
  "/oauth2/token": { window: 60, max: 30 },
  "/oauth2/par": { window: 60, max: 30 },
};

export type AuthDeps = {
  env: ServerEnv;
  database: Executor;
  /**
   * Must not make the caller wait (see sendEmailInBackground): `email` is still rendering, and
   * is sent after the response.
   */
  sendEmail: (to: string, email: Promise<EmailContent>) => void;
};

/** Loopback hosts, as `URL.hostname` writes them. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `http://` redirect URIs are allowed only in development: on this machine (localhost, where a
 * dev server such as Vite's runs) and on the demo hosts (*.localtest.me). Production takes
 * https only.
 */
export function allowInsecureRedirectUri(env: Pick<ServerEnv, "isProduction">) {
  if (env.isProduction) return undefined;
  return (url: URL) =>
    LOOPBACK_HOSTS.has(url.hostname) ||
    url.hostname === "localtest.me" ||
    url.hostname.endsWith(".localtest.me");
}

/**
 * Pure: everything it needs is passed in, so tests build the same configuration against a
 * PGlite database. The app uses getAuth() (auth.ts).
 */
export function createAuth({ env, database, sendEmail }: AuthDeps) {
  const insecureRedirects = allowInsecureRedirectUri(env);
  const hostnames = turnstileHostnames(env);
  const ssoProviders = ssoProviderConfig(env.social);
  // Who the emails are from: the name, and the logo above it.
  const brand = { appName: env.appName, logoUrl: env.logoUrl };
  const twoFactorPolicy = { requiredForAdmins: env.twoFactorRequiredForAdmins };

  return betterAuth({
    appName: env.appName,
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret,
    trustedOrigins: env.trustedOrigins,
    database: createAuthAdapter(database),

    user: {
      additionalFields: {
        // Never settable through sign-up or update-user: the seed makes the first admin, and
        // admins change roles on the Users screens (the admin plugin's set-role).
        role: { type: "string", input: false, required: false, defaultValue: "user" },
        // An admin requires two-factor of this person (two-factor-policy.ts).
        twoFactorRequired: {
          type: "boolean",
          input: false,
          required: false,
          defaultValue: false,
        },
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: LIFETIMES.passwordReset,
      revokeSessionsOnPasswordReset: true,
      // Sign-up answers an existing address exactly like a new one; the owner gets this
      // instead, so "check your email" is true either way and they learn of the attempt.
      onExistingUserSignUp: async ({ user }) => {
        sendEmail(
          user.email,
          existingAccountTemplate({
            ...brand,
            loginUrl: `${env.betterAuthUrl}${AUTH_PAGES.login}`,
            resetUrl: `${env.betterAuthUrl}${AUTH_PAGES.forgotPassword}`,
          }),
        );
      },
      sendResetPassword: async ({ user, url }) => {
        sendEmail(
          user.email,
          resetPasswordTemplate({
            ...brand,
            url,
            expiresInMinutes: LIFETIMES.passwordReset / 60,
          }),
        );
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: LIFETIMES.emailVerification,
      sendVerificationEmail: async ({ user, url }) => {
        sendEmail(
          user.email,
          verifyEmailTemplate({
            ...brand,
            url,
            expiresInMinutes: LIFETIMES.emailVerification / 60,
          }),
        );
      },
    },

    // Verification, reset and magic-link tokens are stored hashed.
    verification: { storeIdentifier: "hashed" },

    // Google, Microsoft and GitHub, each when it's configured (social-providers.ts).
    socialProviders: socialProviderOptions(env.social),
    // The tokens a provider hands over are kept encrypted with BETTER_AUTH_SECRET.
    account: { encryptOAuthTokens: true },
    // A provider's callback that fails before it knows where to go (a lost or forged state)
    // lands on the login page with ?error=, not on Better Auth's bare error page.
    onAPIError: { errorURL: `${env.betterAuthUrl}${LOGIN_PAGE}` },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: RATE_LIMIT_RULES,
    },

    // Better Auth's own /token (a JWT for the session) isn't needed: clients use /oauth2/token.
    disabledPaths: ["/token", ...DISABLED_ADMIN_PATHS],

    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: env.isProduction,
      ...(env.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: env.cookieDomain } }
        : {}),
      ipAddress: {
        // Behind the ingress: the client is the rightmost address that isn't a trusted proxy.
        ipAddressHeaders: ["x-forwarded-for"],
        ...(env.trustedProxies.length > 0 ? { trustedProxies: env.trustedProxies } : {}),
      },
    },

    plugins: [
      magicLink({
        expiresIn: LIFETIMES.magicLink,
        storeToken: "hashed",
        disableSignUp: true,
        // The endpoint answers the same whatever happens here, so nothing is revealed.
        sendMagicLink: async ({ email, url }) => {
          const user = await getUserSecurityByEmail(database, email);
          // No account: nothing to sign in to. Two-factor on: a magic link would bypass it,
          // because Better Auth only asks for the second factor after a password.
          if (!user || user.twoFactorEnabled) return;
          sendEmail(
            email,
            magicLinkTemplate({
              ...brand,
              url,
              expiresInMinutes: LIFETIMES.magicLink / 60,
            }),
          );
        },
      }),

      twoFactor({
        issuer: env.appName,
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
      }),

      // The Users screens: disabling an account (it can't start a session, by any method, and
      // its sessions end), its role, ending its sessions, deleting it. Only admins, and only
      // the endpoints DISABLED_ADMIN_PATHS leaves.
      admin({
        adminRoles: ["admin"],
        defaultRole: "user",
        bannedUserMessage: DISABLED_ACCOUNT_MESSAGE,
      }),
      // Rules on those endpoints, on turning two-factor off, and on get-session.
      accountPolicy({ database, twoFactor: twoFactorPolicy }),

      // The SSO_* OpenID Connect provider, when it's configured.
      ...(ssoProviders.length > 0 ? [genericOAuth({ config: ssoProviders })] : []),

      // Before oauthProvider(): see the guard.
      socialTwoFactorGuard(LOGIN_PAGE),

      jwt({
        // The OIDC issuer is the bare public origin, so discovery lives at
        // <origin>/.well-known/openid-configuration.
        jwt: { issuer: env.betterAuthUrl },
        // RS256: OIDC Core 15.1 requires it of providers, and every client library has it.
        jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
        disableSettingJwtHeader: true,
      }),

      oauthProvider({
        loginPage: LOGIN_PAGE,
        consentPage: CONSENT_PAGE,
        // Someone who must have two-factor and hasn't set it up goes to set it up after signing
        // in, before consent or a code: an app never hears of them until it's on. The page
        // continues the flow (/oauth2/continue), which asks again.
        postLogin: {
          page: SECURITY_PAGES.twoFactor,
          shouldRedirect: ({ user }) => mustSetUpTwoFactor(user, twoFactorPolicy),
          consentReferenceId: () => undefined,
        },
        scopes: offeredScopes(env.oauth),
        // Authorization code (always with PKCE S256) and refresh tokens for apps that sign
        // people in; client credentials for services that call an API as themselves, within
        // the scopes an admin gave the client. No implicit, no device flow.
        grantTypes: ["authorization_code", "client_credentials", "refresh_token"],
        accessTokenExpiresIn: LIFETIMES.accessToken,
        m2mAccessTokenExpiresIn: LIFETIMES.accessToken,
        idTokenExpiresIn: LIFETIMES.idToken,
        refreshTokenExpiresIn: LIFETIMES.refreshToken,
        codeExpiresIn: LIFETIMES.authorizationCode,
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        clientRegistrationRequirePKCE: true,
        advertisedMetadata: {
          token_endpoint_auth_methods_supported: [
            "client_secret_basic",
            "client_secret_post",
            "none",
          ],
        },
        // The APIs (RFC 8707). A token asked for with `resource` is a JWT whose `aud` is that
        // API, and only clients an admin linked to the API may ask (enforcePerClientResources).
        // Without `resource`, an access token stays opaque: for /userinfo and introspection.
        // Rows are inserted on start, never overwritten: a removed URI stays in the database.
        resources: env.oauth.resources,
        enforcePerClientResources: true,
        resourcePrivileges: ({ user }) => isAdmin(user),
        // Only admins create, update, rotate and delete clients, and they share them.
        clientPrivileges: ({ user }) => isAdmin(user),
        clientReference: ({ user }) => (isAdmin(user) ? ADMIN_CLIENT_OWNER : undefined),
        ...(insecureRedirects ? { allowInsecureRedirectUri: insecureRedirects } : {}),
        // Pushed authorization requests (RFC 9126): a request_uri from /oauth2/par stands in for
        // the parameters, once, for the client that pushed them (pushed-authorization.ts).
        requestUriResolver: pushedRequestResolver(database),
      }),
      // /oauth2/par and its discovery field. After oauthProvider, which it extends.
      pushedAuthorizationRequests(database),

      // Cloudflare Turnstile on every endpoint a form posts typed input to (captcha.ts), only
      // when it's configured. A request without a token Cloudflare accepts is refused before
      // the endpoint runs; if Cloudflare can't be reached, it's refused too.
      ...(env.turnstile
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: env.turnstile.secretKey,
              endpoints: CAPTCHA_ENDPOINTS,
              ...(hostnames ? { allowedHostnames: hostnames } : {}),
            }),
          ]
        : []),

      // Last: lets server actions that call auth.api set cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
