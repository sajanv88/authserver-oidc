import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import { repo } from "@/content/site";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C } from "../content/content";
import { Step, Steps } from "../steps/steps";

/** The release these commands were written for. */
const VERSION = "1.1.5";

export function ProductionImage() {
  return (
    <Section id="image" title="The production image">
      <p className="article__text">
        Each release is an image for amd64 and arm64, public on GitHub's registry:{" "}
        <C>ghcr.io/sajanv88/auth-server:v{VERSION}</C>. It runs as an unprivileged user, works with
        a read-only root filesystem, and answers <C>GET /api/health</C> without touching the
        database, for probes.
      </p>
      <Steps>
        <Step title="Write its settings">
          <p className="article__text">
            Production needs https, SMTP and a database. In <C>auth.env</C>, or your platform's
            secrets and variables:
          </p>
          <Code
            language="dotenv"
            title="auth.env"
            label="Production settings"
            code={`DATABASE_URL=postgres://auth:...@db.example.com:5432/auth?sslmode=verify-full
BETTER_AUTH_SECRET=...                  # openssl rand -base64 32
BETTER_AUTH_URL=https://auth.example.com
TRUSTED_ORIGINS=https://app.example.com
TRUSTED_PROXIES=10.0.0.5                # your TLS proxy
EMAIL_PROVIDER=smtp
EMAIL_FROM="Acme ID <no-reply@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=...
APP_NAME=Acme ID`}
          />
        </Step>
        <Step title="Run the migrations">
          <p className="article__text">
            The image carries its own migration runner. Run it before every new version.
          </p>
          <Code
            language="sh"
            title="Terminal"
            label="Migrate"
            code={`docker run --rm --env-file auth.env ghcr.io/sajanv88/auth-server:v${VERSION} \\
  node packages/db/dist/migrate.mjs`}
          />
        </Step>
        <Step title="Start it, locked down">
          <Code
            language="sh"
            title="Terminal"
            label="Run"
            code={`docker run -d --name auth-server --env-file auth.env -p 127.0.0.1:3000:3000 \\
  --read-only --tmpfs /app/apps/auth-server/.next/cache:uid=1001,gid=1001 \\
  --cap-drop ALL --security-opt no-new-privileges \\
  ghcr.io/sajanv88/auth-server:v${VERSION}`}
          />
        </Step>
        <Step title="Put HTTPS in front of it">
          <p className="article__text">
            Your proxy terminates TLS for <C>BETTER_AUTH_URL</C> and forwards to port 3000 with{" "}
            <C>X-Forwarded-For</C> and <C>X-Forwarded-Proto: https</C>. Name it in{" "}
            <C>TRUSTED_PROXIES</C>.
          </p>
        </Step>
      </Steps>
      <Alert intent="info">
        <AlertTitle>How the screenshots were made</AlertTitle>
        <AlertDescription>
          Every screenshot in this guide is the production image, built from this repository and run
          as above beside the Postgres from <C>compose.yaml</C>, behind a TLS proxy, with SMTP over
          STARTTLS, and the admin from the seed.
        </AlertDescription>
      </Alert>
    </Section>
  );
}

export function Kubernetes() {
  return (
    <Section id="kubernetes" title="Deploy to Kubernetes">
      <p className="article__text">
        The Helm chart is published with each release at{" "}
        <C>oci://ghcr.io/sajanv88/charts/auth-server</C>, at the release's version. It runs the
        image as above, with probes, a disruption budget, zone spreading and an optional autoscaler,
        and its <a href={repo("blob/main/charts/auth-server/values.yaml")}>values.yaml</a> explains
        every setting.
      </p>
      <Steps>
        <Step title="Create the Secret">
          <p className="article__text">
            The chart never creates secrets: it reads them from one you make, named by{" "}
            <C>existingSecret</C> (<C>auth-server-secrets</C> by default). Use External Secrets or
            Sealed Secrets in a real cluster; by hand:
          </p>
          <Code
            language="sh"
            title="Terminal"
            label="The Secret"
            code={`kubectl create namespace auth
kubectl -n auth create secret generic auth-server-secrets \\
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \\
  --from-literal=DATABASE_URL='postgres://auth:...@db.example.com:5432/auth?sslmode=verify-full' \\
  --from-literal=SMTP_PASSWORD='...'
# With Turnstile or sign-in providers on, add TURNSTILE_SECRET_KEY and each *_CLIENT_SECRET.`}
          />
        </Step>
        <Step title="Write your values">
          <p className="article__text">
            Everything that isn't a secret goes in <C>config</C>; the chart renders it into a
            ConfigMap, and a change rolls the pods.
          </p>
          <Code
            language="yaml"
            title="values.auth.yaml"
            label="Values"
            code={`ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: auth.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: auth-server-tls
      hosts: [auth.example.com]

config:
  BETTER_AUTH_URL: https://auth.example.com
  COOKIE_DOMAIN: ""                 # or .example.com, to share the session cookie
  TRUSTED_ORIGINS: https://app.example.com
  TRUSTED_PROXIES: 10.0.0.0/8       # your ingress controller's pod network
  EMAIL_FROM: "Acme ID <no-reply@example.com>"
  SMTP_HOST: smtp.example.com
  SMTP_PORT: "587"
  SMTP_USER: apikey
  APP_NAME: Acme ID
  OAUTH_RESOURCES: https://api.example.com
  OAUTH_API_SCOPES: crm,booking

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10`}
          />
        </Step>
        <Step title="Install it">
          <Code
            language="sh"
            title="Terminal"
            label="Install"
            code={`helm install auth-server oci://ghcr.io/sajanv88/charts/auth-server \\
  --version ${VERSION} -n auth -f values.auth.yaml
kubectl -n auth rollout status deploy/auth-server`}
          />
          <p className="article__text">
            The image is public, so the cluster needs no pull secret. The chart's{" "}
            <C>values-production.yaml</C> names one (<C>ghcr-pull</C>) for a private copy: leave it
            out, or set <C>imagePullSecrets: []</C>.
          </p>
        </Step>
        <Step title="Make the first admin">
          <p className="article__text">
            Sign up at your <C>BETTER_AUTH_URL</C>, then promote the account as in{" "}
            <a href="#admin-production">The first admin</a>.
          </p>
        </Step>
      </Steps>
      <Subheading id="kubernetes-migrations">Migrations, and Argo CD</Subheading>
      <p className="article__text">
        The chart's migration Job is an Argo CD <C>PreSync</C> hook: with Argo CD it runs, and must
        succeed, before the new pods are applied. Plain Helm treats it as an ordinary Job, created
        with the Deployment: that's fine for the first install, but for an upgrade that changes the
        schema, run it first, or deploy with Argo CD.
      </p>
      <Code
        language="yaml"
        title="application.yaml"
        label="An Argo CD Application"
        code={`apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: auth-server
  namespace: argocd
spec:
  project: default
  source:
    # Registered in Argo CD as a Helm repository with OCI enabled.
    repoURL: ghcr.io/sajanv88/charts
    chart: auth-server
    targetRevision: ${VERSION}
    helm:
      valuesObject:
        config:
          BETTER_AUTH_URL: https://auth.example.com
          # ...the rest of values.auth.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: auth
  syncPolicy:
    automated: { prune: true, selfHeal: true }`}
      />
      <Alert intent="warning">
        <AlertTitle>Before you go live</AlertTitle>
        <AlertDescription>
          Check that <C>TRUSTED_PROXIES</C> covers your ingress pods (otherwise every user shares
          one rate limit), that the database URL verifies TLS, and that{" "}
          <C>replicas × DATABASE_POOL_MAX</C> stays under your database's connection limit.
        </AlertDescription>
      </Alert>
    </Section>
  );
}
