import "server-only";
import { oauthProvider } from "@better-auth/oauth-provider";
import { createAuthAdapter, type Executor, getUserSecurityByEmail } from "@repo/db";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt, magicLink, twoFactor } from "better-auth/plugins";
import { APP_NAME } from "@/shared/config/app";
import type { ServerEnv } from "@/shared/config/env";
import {
  type EmailMessage,
  magicLinkTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/shared/email";
import { AUTH_COOKIE_PREFIX, LOGIN_PATH } from "./constants";

// Lifetimes, in seconds. Short for anything that's a bearer credential in a URL or a header.
export const LIFETIMES = {
  emailVerification: 60 * 60,
  passwordReset: 15 * 60,
  magicLink: 5 * 60,
  authorizationCode: 2 * 60,
  accessToken: 10 * 60,
  idToken: 10 * 60,
  refreshToken: 30 * 24 * 60 * 60,
} as const;

export const OIDC_SCOPES = ["openid", "profile", "email", "offline_access"];

export const LOGIN_PAGE = LOGIN_PATH;
export const CONSENT_PAGE = "/consent";

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
 * The Better Auth instance: email and password, magic links, two-factor, a JWKS, and the OAuth
 * 2.1 / OIDC provider. Pure: everything it needs is passed in, so tests build the same
 * configuration against a PGlite database. The app uses getAuth() (auth.ts).
 */
export function createAuth({ env, database, sendEmail }: AuthDeps) {
  const insecureRedirects = allowInsecureRedirectUri(env);

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
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: LIFETIMES.passwordReset,
      revokeSessionsOnPasswordReset: true,
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
        // Only admins create, update, rotate and delete clients.
        clientPrivileges: ({ user }) => (user as { role?: unknown }).role === "admin",
        ...(insecureRedirects ? { allowInsecureRedirectUri: insecureRedirects } : {}),
      }),

      // Last: lets server actions that call auth.api set cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
