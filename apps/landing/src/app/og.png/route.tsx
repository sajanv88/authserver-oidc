import { ImageResponse } from "next/og";
import { OG_IMAGE, PRODUCT_NAME } from "@/content/site";

// The picture a link to the site shows when it's shared, drawn once at build into out/og.png.
// A route named og.png rather than an opengraph-image file: the export writes that one without
// an extension, and GitHub Pages picks a file's content type by its extension.
// ImageResponse draws with Satori: no CSS variables and no stylesheets, so the colors are
// nuvui's dark theme written out (gray-950, gray-400, blue-400, green-400).

export const dynamic = "force-static";

const COLORS = {
  background: "#030712",
  surface: "#111827",
  border: "#1f2937",
  foreground: "#f9fafb",
  muted: "#9ca3af",
  primary: "#60a5fa",
  success: "#4ade80",
  danger: "#f87171",
};

const TAGS = ["OpenID Connect", "Two-factor", "Docker + Helm", "MIT"];

const CODE = [
  ["issuer", "https://auth.example.com"],
  ["token_endpoint", "…/oauth2/token"],
  ["jwks_uri", "…/jwks"],
  ["code_challenge", "S256"],
];

export function GET() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        backgroundColor: COLORS.background,
        backgroundImage: `radial-gradient(circle at 85% 15%, rgba(96, 165, 250, 0.35), transparent 45%), radial-gradient(circle at 10% 100%, rgba(167, 139, 250, 0.25), transparent 50%)`,
        color: COLORS.foreground,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 700,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}
        >
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M16 2.5 4.5 7v8.2c0 7 4.9 12.6 11.5 14.3 6.6-1.7 11.5-7.3 11.5-14.3V7L16 2.5Z"
              fill={COLORS.primary}
            />
            <path
              d="m10.5 16 3.8 3.8 7.2-7.6"
              stroke={COLORS.background}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {PRODUCT_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
            }}
          >
            <span>The identity server</span>
            <span>you run yourself</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: COLORS.muted, lineHeight: 1.4 }}>
            Self-hosted OpenID Connect on Next.js and Better Auth.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {TAGS.map((tag) => (
            <div
              key={tag}
              style={{
                display: "flex",
                padding: "8px 18px",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 999,
                backgroundColor: COLORS.surface,
                fontSize: 22,
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignSelf: "center",
          marginLeft: "auto",
          width: 360,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          backgroundColor: COLORS.surface,
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.45)",
          fontFamily: "monospace",
          fontSize: 19,
        }}
      >
        <div
          style={{
            display: "flex",
            padding: "14px 20px",
            borderBottom: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            fontSize: 16,
          }}
        >
          GET /.well-known/openid-configuration
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 20px" }}>
          <span style={{ color: COLORS.muted }}>{"{"}</span>
          {CODE.map(([key, value]) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", paddingLeft: 18 }}>
              <span style={{ color: COLORS.danger }}>"{key}":</span>
              <span style={{ color: COLORS.success, paddingLeft: 18 }}>"{value}"</span>
            </div>
          ))}
          <span style={{ color: COLORS.muted }}>{"}"}</span>
        </div>
      </div>
    </div>,
    { width: OG_IMAGE.width, height: OG_IMAGE.height },
  );
}
