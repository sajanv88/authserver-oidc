import { describe, expect, it } from "vitest";
import { createConsoleProvider } from "./console-provider";
import { smtpTransportOptions } from "./smtp-provider";
import {
  existingAccountTemplate,
  magicLinkTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "./templates";

const url = "https://auth.example.com/api/auth/verify?token=abc&callbackURL=%2F";

describe("email templates", () => {
  it.each([
    ["verify email", verifyEmailTemplate, "Confirm your email address"],
    ["reset password", resetPasswordTemplate, "Reset your password"],
    ["magic link", magicLinkTemplate, "Your sign-in link"],
  ] as const)(
    "%s has a subject, the link in both parts, and the expiry",
    async (_, template, subject) => {
      const email = await template({ appName: "Acme ID", url, expiresInMinutes: 15 });
      expect(email.subject).toBe(`${subject} · Acme ID`);
      expect(email.text).toContain("Acme ID");
      expect(email.text).toContain("15 minutes");
      // Whitespace on both sides, so a link finder takes the address and nothing else.
      expect(email.text.split(/\s+/)).toContain(url);
      expect(email.html).toContain(`href="${url.replace("&", "&amp;")}"`);
      expect(email.html).not.toContain("&callbackURL"); // the raw ampersand is escaped
    },
  );

  it("the plain-text part is the message, without the header or the copy-this-address line", async () => {
    const email = await magicLinkTemplate({ appName: "Acme ID", url, expiresInMinutes: 1 });
    expect(email.text).toBe(
      [
        "Your sign-in link",
        "",
        "Use this link to sign in to Acme ID.",
        "",
        `Sign in ${url}`,
        "",
        "The link works once, for 1 minute. If you didn't ask for this, you can ignore this email.",
        "",
        "Acme ID",
      ].join("\n"),
    );
  });

  it("existing-account notice links to sign-in and names the reset page", async () => {
    const email = await existingAccountTemplate({
      appName: "Acme ID",
      loginUrl: "https://auth.example.com/login",
      resetUrl: "https://auth.example.com/forgot-password",
    });
    expect(email.subject).toContain("You already have an account");
    expect(email.html).toContain('href="https://auth.example.com/login"');
    expect(email.text.split(/\s+/)).toContain("https://auth.example.com/forgot-password");
  });

  it("escapes markup in values put into the HTML", async () => {
    const email = await magicLinkTemplate({
      appName: "Acme <b>ID</b>",
      url: 'https://x.test/"><script>alert(1)</script>',
      expiresInMinutes: 1,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain("Acme &lt;b&gt;ID&lt;/b&gt;");
  });

  it("shows a logo from LOGO_URL beside the name, but not an SVG, which mail apps don't show", async () => {
    const props = { appName: "Acme ID", url, expiresInMinutes: 5 };
    const png = await magicLinkTemplate({ ...props, logoUrl: "https://cdn.example.com/logo.png" });
    expect(png.html).toContain('src="https://cdn.example.com/logo.png"');
    const svg = await magicLinkTemplate({ ...props, logoUrl: "https://cdn.example.com/Logo.SVG" });
    expect(svg.html).not.toContain("<img");
    const none = await magicLinkTemplate(props);
    expect(none.html).not.toContain("<img");
    expect(none.html).toContain("Acme ID</span>");
  });
});

describe("console provider", () => {
  it("writes one JSON line with the recipient, subject and text", async () => {
    const lines: string[] = [];
    const provider = createConsoleProvider((line) => lines.push(line));
    await provider.send({
      to: "ada@example.com",
      subject: "Hi",
      text: "Body",
      html: "<p>Body</p>",
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      to: "ada@example.com",
      subject: "Hi",
      text: "Body",
    });
  });
});

describe("smtp transport options", () => {
  const base = {
    provider: "smtp" as const,
    from: "Auth <no-reply@example.com>",
    host: "smtp.example.com",
    user: "user",
    password: "secret",
  };

  it("uses TLS from the first byte on port 465", () => {
    expect(smtpTransportOptions({ ...base, port: 465 })).toMatchObject({
      secure: true,
      requireTLS: false,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    });
  });

  it("requires STARTTLS on any other port", () => {
    expect(smtpTransportOptions({ ...base, port: 587 })).toMatchObject({
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true },
    });
  });
});
