import "server-only";
import { oauthProvider } from "@better-auth/oauth-provider";
import { createAuthAdapter, type Executor, getUserSecurityByEmail } from "@repo/db";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { captcha, jwt, magicLink, twoFactor } from "better-auth/plugins";
import { APP_NAME } from "@/shared/config/app";
import type { ServerEnv } from "@/shared/config/env";
import {
  type EmailMessage,
  existingAccountTemplate,
  magicLinkTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/shared/email";
import { turnstileHostnames } from "@/shared/security/turnstile";
import { AUTH_PAGES } from "./auth-pages";
import { CAPTCHA_ENDPOINTS } from "./captcha";
import {
  AUTH_COOKIE_PREFIX,
  LOGIN_PATH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./constants";

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
  "/oauth2/token": { window: 60, max: 30 },
};

export type AuthDeps = {
  env: ServerEnv;
  database: Executor;
  /** Must not make the caller wait (see sendEmailInBackground). */
  sendEmail: (message: EmailMessage) => void;
};

/** `http://` redirect URIs are allowed only in development, and only for the demo hosts. */
function allowInsecureRedirectUri(env: ServerEnv) {
  if (env.isProduction) return undefined;
  return (url: URL) => url.hostname === "localtest.me" || url.hostname.endsWith(".localtest.me");
}

/**
 * Pure: everything it needs is passed in, so tests build the same configuration against a
 * PGlite database. The app uses getAuth() (auth.ts).
 */
export function createAuth({ env, database, sendEmail }: AuthDeps) {
  const insecureRedirects = allowInsecureRedirectUri(env);
  const hostnames = turnstileHostnames(env);

  return betterAuth({
    appName: APP_NAME,
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret,
    trustedOrigins: env.trustedOrigins,
    database: createAuthAdapter(database),

    user: {
      additionalFields: {
        // Never settable through sign-up or update-user: admins are made in the database.
        role: { type: "string", input: false, required: false, defaultValue: "user" },
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
        sendEmail({
          to: user.email,
          ...existingAccountTemplate({
            loginUrl: `${env.betterAuthUrl}${AUTH_PAGES.login}`,
            resetUrl: `${env.betterAuthUrl}${AUTH_PAGES.forgotPassword}`,
          }),
        });
      },
      sendResetPassword: async ({ user, url }) => {
        sendEmail({
          to: user.email,
          ...resetPasswordTemplate({ url, expiresInMinutes: LIFETIMES.passwordReset / 60 }),
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: LIFETIMES.emailVerification,
      sendVerificationEmail: async ({ user, url }) => {
        sendEmail({
          to: user.email,
          ...verifyEmailTemplate({ url, expiresInMinutes: LIFETIMES.emailVerification / 60 }),
        });
      },
    },

    // Verification, reset and magic-link tokens are stored hashed.
    verification: { storeIdentifier: "hashed" },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: RATE_LIMIT_RULES,
    },

    // Better Auth's own /token (a JWT for the session) isn't needed: clients use /oauth2/token.
    disabledPaths: ["/token"],

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
          sendEmail({
            to: email,
            ...magicLinkTemplate({ url, expiresInMinutes: LIFETIMES.magicLink / 60 }),
          });
        },
      }),

      twoFactor({
        issuer: APP_NAME,
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
      }),

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
        scopes: OIDC_SCOPES,
        // Authorization code (always with PKCE S256) and refresh tokens. No client
        // credentials, no implicit, no device flow.
        grantTypes: ["authorization_code", "refresh_token"],
        accessTokenExpiresIn: LIFETIMES.accessToken,
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
        // Only admins create, update, rotate and delete clients, and they share them.
        clientPrivileges: ({ user }) => isAdmin(user),
        clientReference: ({ user }) => (isAdmin(user) ? ADMIN_CLIENT_OWNER : undefined),
        ...(insecureRedirects ? { allowInsecureRedirectUri: insecureRedirects } : {}),
      }),

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
