import { ShieldCheckIcon } from "@nuvui/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nuvui/react";
import type { ReactNode } from "react";
import { APP_NAME } from "@/shared/config/app";
import "./auth-card.scss";

type AuthCardProps = {
  /** The page's one heading: "Sign in", "Create an account". */
  title: string;
  description?: ReactNode;
  /** The form, or the message, of the page. */
  children: ReactNode;
  /** A line under the card, such as "New here? Create an account". */
  footer?: ReactNode;
};

/**
 * The layout every auth page shares: the product's name, then one card with the page's
 * heading and its form, centered on a muted background. A server component: the forms inside
 * are the features' own client components.
 */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="auth-card" id="content">
      <div className="auth-card__inner">
        <p className="auth-card__brand">
          <ShieldCheckIcon size={24} />
          {APP_NAME}
        </p>
        <Card className="auth-card__card">
          <CardHeader>
            {/* The page's h1: a card is the whole page here. */}
            <CardTitle asChild>
              <h1>{title}</h1>
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer ? <div className="auth-card__footer">{footer}</div> : null}
      </div>
    </main>
  );
}
