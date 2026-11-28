import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import type { ReactNode } from "react";
import { env } from "@/shared/config/env";
import { BrandMark } from "@/shared/ui/brand-mark/brand-mark";
import { LegalNotice } from "@/shared/ui/legal-notice/legal-notice";
import { AuthBackdrop } from "./auth-backdrop";
import "./auth-card.scss";

type AuthCardProps = {
  /** The page's one heading: "Sign in", "Create an account". */
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Links under the form, such as "New here? Create an account". */
  footer?: ReactNode;
  /**
   * What agreeing to the terms is called on this page ("By signing in"), for the privacy
   * policy and terms of service under the card. Without it, or without either address
   * configured, there's nothing under the card.
   */
  legalAction?: string;
};

export function AuthCard({ title, description, children, footer, legalAction }: AuthCardProps) {
  const { appName, logoUrl, legal } = env();
  return (
    <main className="auth-card" id="content">
      <AuthBackdrop>
        <div className="auth-card__inner">
          <p className="auth-card__brand">
            <BrandMark logoUrl={logoUrl} size={24} logoSize={32} />
            {appName}
          </p>
          <Card className="auth-card__card">
            <CardHeader>
              <CardTitle asChild>
                <h1>{title}</h1>
              </CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </CardHeader>
            <CardContent>{children}</CardContent>
            {footer ? <CardFooter className="auth-card__footer">{footer}</CardFooter> : null}
          </Card>
          {legalAction ? <LegalNotice action={legalAction} {...legal} /> : null}
        </div>
      </AuthBackdrop>
    </main>
  );
}
