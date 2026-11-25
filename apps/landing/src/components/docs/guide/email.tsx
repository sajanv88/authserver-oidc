import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import email from "@/content/docs/email.png";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Shot } from "../shot/shot";
import { Step, Steps } from "../steps/steps";

export function Email() {
  return (
    <Section id="email" title="Email over SMTP">
      <p className="article__text">
        The server sends four emails: confirm your address, reset your password, a sign-in link, and
        "you already have an account" to someone who signs up twice. In development they're printed
        in the terminal; in production they go out over SMTP, which the server requires.
      </p>
      <Steps>
        <Step title="Set the SMTP server">
          <DataTable
            caption="Email settings"
            head={["Setting", "What it is"]}
            rows={[
              [<C key="p">EMAIL_PROVIDER</C>, "smtp in production; console only logs them"],
              [<C key="f">EMAIL_FROM</C>, "The sender, such as Acme ID <no-reply@example.com>"],
              [
                <C key="h">SMTP_HOST</C>,
                "Your SMTP server, such as Cloudflare's or your provider's",
              ],
              [
                <C key="o">SMTP_PORT</C>,
                "465 for TLS from the first byte; any other port must offer STARTTLS",
              ],
              [<C key="u">SMTP_USER</C>, "Its user name"],
              [<C key="w">SMTP_PASSWORD</C>, "Its password or API token: a secret"],
            ]}
          />
          <Code
            language="dotenv"
            title=".env"
            label="SMTP"
            code={`EMAIL_PROVIDER=smtp
EMAIL_FROM="Acme ID <no-reply@acme.example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=...`}
          />
        </Step>
        <Step title="Brand them">
          <p className="article__text">
            <C>APP_NAME</C> is the name in every subject, heading and sign-off, and <C>LOGO_URL</C>{" "}
            puts your logo beside it (not an SVG, which Gmail and Outlook don't show).
          </p>
        </Step>
        <Step title="Send one">
          <p className="article__text">
            Ask for a password reset on <C>/forgot-password</C>. Each email has an HTML part and a
            plain-text one, made from the same template.
          </p>
        </Step>
      </Steps>
      <Shot
        src={email}
        alt="A Reset your password email from Acme ID: a sentence, a Choose a new password button, the address to copy, and a note that the link works once for 15 minutes."
        caption="The password reset email, as it arrived over SMTP with STARTTLS from the container."
      />
      <Subheading id="email-tls">Encrypted, always</Subheading>
      <p className="article__text">
        The connection is always encrypted, with TLS 1.2 or later and a certificate the server must
        trust: on any port but 465 it requires STARTTLS, and a server that doesn't offer it is
        refused. Nothing is ever sent in the clear.
      </p>
      <Alert intent="info">
        <AlertTitle>A server with a private certificate</AlertTitle>
        <AlertDescription>
          If your SMTP server's certificate comes from your own CA, give Node.js that CA with{" "}
          <C>NODE_EXTRA_CA_CERTS=/path/to/ca.crt</C>, rather than turning verification off. That's
          how the screenshot above was sent.
        </AlertDescription>
      </Alert>
    </Section>
  );
}
