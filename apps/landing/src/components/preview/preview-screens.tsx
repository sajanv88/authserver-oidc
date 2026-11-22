import { CheckIcon, ShieldCheckIcon } from "@nuvui/icons";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  OtpField,
  PasswordInput,
} from "@nuvui/react";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/content/site";

// Copies of the auth server's screens, with the same nuvui parts and words. They're pictures:
// the frame around them is inert, so nothing in them takes focus or reaches a screen reader.

function Screen({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="preview__screen">
      <p className="preview__brand">
        <ShieldCheckIcon size={20} />
        {PRODUCT_NAME}
      </p>
      <Card className="preview__card">
        <CardHeader>
          <CardTitle asChild>
            <p>{title}</p>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="preview__form">{children}</div>
        </CardContent>
        {footer ? <CardFooter className="preview__footer">{footer}</CardFooter> : null}
      </Card>
    </div>
  );
}

export function SignInScreen() {
  return (
    <Screen
      title="Sign in"
      description={`Use your ${PRODUCT_NAME} account.`}
      footer={
        <>
          <span className="preview__link">Email me a sign-in link instead</span>
          <span>
            New here? <span className="preview__link">Create an account</span>
          </span>
        </>
      }
    >
      <Field>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" defaultValue="ada@example.com" />
        </FieldControl>
      </Field>
      <Field>
        <FieldLabel>Password</FieldLabel>
        <FieldControl>
          <PasswordInput defaultValue="correct-horse-battery" />
        </FieldControl>
      </Field>
      <Field orientation="horizontal">
        <FieldControl>
          <Checkbox defaultChecked />
        </FieldControl>
        <FieldLabel>Keep me signed in on this device</FieldLabel>
      </Field>
      <Button className="preview__submit">Sign in</Button>
    </Screen>
  );
}

export function TwoFactorScreen() {
  return (
    <Screen
      title="Two-factor authentication"
      description="Your password was right. Now confirm it's you."
      footer={<span className="preview__link">Use a backup code instead</span>}
    >
      <Field>
        <FieldLabel asChild>
          <span>Code from your authenticator app</span>
        </FieldLabel>
        <FieldControl>
          <OtpField groupSize={3} defaultValue="482913" />
        </FieldControl>
        <FieldDescription>It changes every 30 seconds.</FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <FieldControl>
          <Checkbox />
        </FieldControl>
        <FieldLabel>Don't ask again on this device for 30 days</FieldLabel>
      </Field>
      <Button className="preview__submit">Verify</Button>
    </Screen>
  );
}

const SCOPES = [
  { title: "Know it's you", text: `Your ${PRODUCT_NAME} account ID, so the app recognises you.` },
  { title: "Your name and picture", text: "As they're set on your account." },
  { title: "Your email address", text: "And whether you've confirmed it." },
  { title: "Stay connected", text: "Keep access while you're away, until you sign out." },
];

export function ConsentScreen() {
  return (
    <Screen
      title="Allow Acme Notes to use your account?"
      description={`Acme Notes is asking for this from your ${PRODUCT_NAME} account:`}
      footer={
        <span>
          Signed in as <strong>ada@example.com</strong>.{" "}
          <span className="preview__link">Use another account</span>
        </span>
      }
    >
      <ul className="preview__scopes">
        {SCOPES.map((scope) => (
          <li key={scope.title} className="preview__scope">
            <CheckIcon size={16} className="preview__scope-icon" />
            <span className="preview__scope-text">
              <span className="preview__scope-title">{scope.title}</span>
              <span className="preview__scope-description">{scope.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="preview__choices">
        <Button intent="secondary">Deny</Button>
        <Button>Allow</Button>
      </div>
    </Screen>
  );
}
