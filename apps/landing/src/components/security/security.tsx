import { CheckCircleIcon } from "@nuvui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table/table";
import "./security.scss";

const GUARANTEES = [
  {
    title: "PKCE on every client",
    text: "S256 only. No implicit flow, no client credentials, no dynamic registration: an admin adds each app.",
  },
  {
    title: "Secrets you can't leak",
    text: "Client secrets are stored hashed and shown once. A spent refresh token revokes its whole family.",
  },
  {
    title: "Signed requests between steps",
    text: "An app's request is signed as it moves from sign-in to two-factor to consent, and expires after 10 minutes.",
  },
  {
    title: "A strict Content Security Policy",
    text: "A fresh nonce and strict-dynamic on every page, form-action 'self', and the usual security headers.",
  },
  {
    title: "Nothing to learn from an answer",
    text: "Sign-up, reset and magic links answer the same whether or not an email exists.",
  },
  {
    title: "Checked on the server, every time",
    text: "Every server action checks the session and validates its input, and every redirect is checked.",
  },
];

const LIMITS = [
  { path: "/sign-in/email", limit: "5 a minute" },
  { path: "/sign-up/email", limit: "3 a minute" },
  { path: "/two-factor/*", limit: "5 a minute" },
  { path: "/request-password-reset", limit: "3 in 5 minutes" },
  { path: "/reset-password", limit: "5 in 5 minutes" },
  { path: "/send-verification-email", limit: "3 in 5 minutes" },
  { path: "/sign-in/magic-link", limit: "3 in 5 minutes" },
  { path: "/magic-link/verify", limit: "10 a minute" },
  { path: "/change-password", limit: "5 in 5 minutes" },
  { path: "/oauth2/token", limit: "30 a minute" },
  { path: "Everything else", limit: "100 a minute" },
];

export function Security() {
  return (
    <section className="section section--muted" id="security" aria-labelledby="security-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Security</p>
          <h2 className="section__title" id="security-title">
            Careful by default, so you don't have to be
          </h2>
          <p className="section__lead">
            The decisions an identity provider gets wrong most often are made for you, and covered
            by tests that drive the real configuration over HTTP.
          </p>
        </div>
        <div className="security">
          <ul className="security__list">
            {GUARANTEES.map((item) => (
              <li key={item.title} className="security__item">
                <CheckCircleIcon size={20} className="security__icon" />
                <div className="security__text">
                  <h3 className="security__title">{item.title}</h3>
                  <p className="security__description">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="security__limits">
            <h3 className="security__title" id="limits-title">
              Rate limits, per client IP
            </h3>
            <TableContainer aria-labelledby="limits-title">
              <Table aria-labelledby="limits-title">
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead align="end">Allowed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LIMITS.map((row) => (
                    <TableRow key={row.path}>
                      <TableCell rowHeader>
                        <code className="security__path">{row.path}</code>
                      </TableCell>
                      <TableCell align="end">{row.limit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
