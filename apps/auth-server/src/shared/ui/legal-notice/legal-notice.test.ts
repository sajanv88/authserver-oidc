import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalNotice } from "./legal-notice";

const privacyPolicyUrl = "https://example.com/privacy";
const termsOfServiceUrl = "https://example.com/terms";

function notice(urls: { privacyPolicyUrl?: string; termsOfServiceUrl?: string }) {
  return renderToStaticMarkup(
    createElement(LegalNotice, {
      action: "By signing in",
      privacyPolicyUrl: urls.privacyPolicyUrl,
      termsOfServiceUrl: urls.termsOfServiceUrl,
    }),
  );
}

/** What a sighted reader sees: the text without the screen reader's "(opens in a new tab)". */
const seen = (html: string) =>
  html
    .replace(/<span class="nuv-visually-hidden">.*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'");

describe("LegalNotice", () => {
  it("is nothing when neither address is set", () => {
    expect(notice({})).toBe("");
  });

  it("names both when both are set", () => {
    const html = notice({ privacyPolicyUrl, termsOfServiceUrl });
    expect(seen(html)).toBe(
      "By signing in, you agree to the terms of service and the privacy policy.",
    );
    expect(html).toContain(`href="${termsOfServiceUrl}"`);
    expect(html).toContain(`href="${privacyPolicyUrl}"`);
  });

  it("names only what's set", () => {
    expect(seen(notice({ termsOfServiceUrl }))).toBe(
      "By signing in, you agree to the terms of service.",
    );
    // A privacy policy isn't something to agree to: it says how data is used.
    expect(seen(notice({ privacyPolicyUrl }))).toBe(
      "See the privacy policy for how your data is used.",
    );
  });

  it("opens each in a new tab, without handing this page to the other site, and says so", () => {
    const html = notice({ privacyPolicyUrl, termsOfServiceUrl });
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html.match(/\(opens in a new tab\)/g)).toHaveLength(2);
  });
});
