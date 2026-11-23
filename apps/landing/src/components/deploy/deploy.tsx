import { ActivityIcon, DatabaseIcon, LockIcon, PackageIcon, RocketIcon } from "@nuvui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nuvui/react";
import { Code } from "../code/code";
import "./deploy.scss";

const FACTS = [
  {
    Icon: PackageIcon,
    title: "One image, built once",
    text: "ghcr.io/sajanv88/auth-server for amd64 and arm64, with provenance and an SBOM. A release retags it; it's never rebuilt.",
  },
  {
    Icon: DatabaseIcon,
    title: "Migrations before each rollout",
    text: "An Argo CD PreSync Job runs the bundled migrator from the same image, against your managed Postgres.",
  },
  {
    Icon: LockIcon,
    title: "Locked down",
    text: "Non-root, read-only root filesystem, every capability dropped. Secrets come from a Secret you create.",
  },
  {
    Icon: ActivityIcon,
    title: "Ready for traffic",
    text: "Probes on /api/health, autoscaling, a disruption budget, pods spread across nodes, and OpenTelemetry.",
  },
];

const STEPS = [
  {
    value: "secret",
    name: "Secret",
    title: "Terminal",
    language: "sh",
    code: `kubectl create secret generic auth-server-secrets \\
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \\
  --from-literal=DATABASE_URL='postgres://user:password@db.internal:5432/auth' \\
  --from-literal=SMTP_PASSWORD='your-smtp-token'`,
  },
  {
    value: "values",
    name: "Values",
    title: "my-values.yaml",
    language: "yaml",
    code: `existingSecret: auth-server-secrets   # the chart reads it, never creates it

ingress:
  enabled: true
  hosts:
    - host: auth.example.com
      paths: [{ path: /, pathType: Prefix }]
  tls:
    - secretName: auth-server-tls
      hosts: [auth.example.com]

config:
  BETTER_AUTH_URL: https://auth.example.com     # the OIDC issuer
  COOKIE_DOMAIN: .example.com                   # shares the session with subdomains
  TRUSTED_ORIGINS: https://app.example.com
  SMTP_HOST: smtp.example.com
  SMTP_USER: apikey
  TURNSTILE_SITE_KEY: ""                        # optional bot protection
  OAUTH_RESOURCES: https://api.example.com      # optional: APIs that get JWT access tokens
  OAUTH_API_SCOPES: crm,booking                 # optional: their scopes`,
  },
  {
    value: "argo",
    name: "Argo CD",
    title: "application.yaml",
    language: "yaml",
    code: `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: auth-server
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ghcr.io/sajanv88/charts
    chart: auth-server
    targetRevision: X.Y.Z          # a release, without the v
    helm:
      # The chart's production defaults, then yours from step 2.
      valueFiles: [values.yaml, values-production.yaml]
      valuesObject:
        existingSecret: auth-server-secrets
        # …the rest of my-values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: auth
  syncPolicy:
    automated: { prune: true, selfHeal: true }`,
  },
];

export function Deploy() {
  return (
    <section className="section" id="deploy" aria-labelledby="deploy-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Deploy</p>
          <h2 className="section__title" id="deploy-title">
            From a tag to production with Helm and Argo CD
          </h2>
          <p className="section__lead">
            Tag a release and the image and the chart are published to GitHub's registry. Create one
            Secret, set your domain, and sync.
          </p>
        </div>
        <div className="deploy">
          <ul className="deploy__facts">
            {FACTS.map(({ Icon, title, text }) => (
              <li key={title} className="deploy__fact">
                <span className="deploy__icon">
                  <Icon size={20} />
                </span>
                <div className="deploy__text">
                  <h3 className="deploy__title">{title}</h3>
                  <p className="deploy__description">{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <Tabs defaultValue="secret" className="deploy__tabs">
            <TabsList aria-label="Deploy steps">
              {STEPS.map((step, index) => (
                <TabsTrigger key={step.value} value={step.value}>
                  {index + 1}. {step.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {STEPS.map((step) => (
              <TabsContent key={step.value} value={step.value}>
                <Code
                  code={step.code}
                  language={step.language}
                  title={step.title}
                  label={`${step.name} for the deploy`}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
        <p className="deploy__note">
          <RocketIcon size={16} />
          <span>
            Every merge to main publishes <code>:sha-&lt;commit&gt;</code> and <code>:main</code>; a
            tag <code>vX.Y.Z</code> adds <code>:vX.Y.Z</code>, <code>:latest</code> and the chart at{" "}
            <code>oci://ghcr.io/sajanv88/charts/auth-server</code>.
          </span>
        </p>
      </div>
    </section>
  );
}
