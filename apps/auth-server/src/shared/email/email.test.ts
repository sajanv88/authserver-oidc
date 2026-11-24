import { describe, expect, it } from "vitest";
import { createConsoleProvider } from "./console-provider";
import { smtpTransportOptions } from "./smtp-provider";
import {
  escapeHtml,
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
    (_, template, subject) => {
      const email = template({ appName: "Acme ID", url, expiresInMinutes: 15 });
      expect(email.subject).toBe(`${subject} · Acme ID`);
      expect(email.text).toContain("Acme ID");
      expect(email.text).toContain(url);
      expect(email.text).toContain("15 minutes");
      expect(email.html).toContain(`href="${escapeHtml(url)}"`);
      expect(email.html).not.toContain("&callbackURL"); // the raw ampersand is escaped
    },
  );

  it("existing-account notice links to sign-in and names the reset page", () => {
    const email = existingAccountTemplate({
      appName: "Acme ID",
      loginUrl: "https://auth.example.com/login",
      resetUrl: "https://auth.example.com/forgot-password",
    });
    expect(email.subject).toContain("You already have an account");
    expect(email.html).toContain('href="https://auth.example.com/login"');
    expect(email.text).toContain("https://auth.example.com/forgot-password");
  });

  it("escapes markup in values put into the HTML", () => {
    const email = magicLinkTemplate({
      appName: "Acme <b>ID</b>",
      url: 'https://x.test/"><script>alert(1)</script>',
      expiresInMinutes: 1,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain("Acme &lt;b&gt;ID&lt;/b&gt;");
    expect(email.text).toContain("1 minute.");
  });

  it("escapeHtml covers the five significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
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
