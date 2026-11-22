"use client";

import { Alert, AlertDescription } from "@nuvui/react";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";
import { CAPTCHA_FIELD } from "@/shared/auth/captcha";
import { useNonce } from "@/shared/ui/nonce-provider/nonce-provider";
import "./turnstile.scss";

// Cloudflare Turnstile's widget, in every form that posts typed input to the auth server.
// The root layout passes the site key when TURNSTILE_SITE_KEY is set; without it the widget
// renders nothing and the forms post as before. The widget writes its token into a hidden
// field (CAPTCHA_FIELD) inside the form, and the form's server action passes it on.

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SiteKeyContext = createContext<string | undefined>(undefined);

/** The site key for every widget below, or undefined when Turnstile is off. */
export function TurnstileProvider({
  siteKey,
  children,
}: {
  siteKey: string | undefined;
  children: ReactNode;
}) {
  return <SiteKeyContext value={siteKey}>{children}</SiteKeyContext>;
}

let loading: Promise<TurnstileApi> | undefined;

/** Cloudflare's script, added once per page; it's allowed by the CSP's 'strict-dynamic'. */
function loadTurnstile(nonce: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    if (nonce) script.nonce = nonce;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile is missing"));
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("Turnstile didn't load"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * The security check, inside a form. Each mount is a new widget with a new token, and the
 * forms are keyed by attempt, so every attempt gets a fresh one (tokens work once).
 */
export function Turnstile() {
  const siteKey = use(SiteKeyContext);
  const nonce = useNonce();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!siteKey || !element) return;
    let widgetId: string | null | undefined;
    let active = true;
    loadTurnstile(nonce).then(
      (turnstile) => {
        if (!active) return;
        widgetId = turnstile.render(element, {
          sitekey: siteKey,
          "response-field-name": CAPTCHA_FIELD,
          theme: "auto",
          size: "flexible",
          "refresh-expired": "auto",
        });
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, nonce]);

  if (!siteKey) return null;
  return (
    <div className="turnstile">
      <div ref={container} className="turnstile__widget" />
      {failed ? (
        <Alert intent="warning">
          <AlertDescription>
            The security check didn't load. Check your connection, then reload the page.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
