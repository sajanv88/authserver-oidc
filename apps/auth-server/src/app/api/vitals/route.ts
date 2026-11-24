import { env } from "@/shared/config/env";
import { receiveWebVitals } from "@/shared/telemetry/web-vitals";

// Web vitals from this app's own pages (WebVitalsReporter), recorded as OpenTelemetry metrics.
export async function POST(request: Request) {
  return receiveWebVitals(request, env().betterAuthUrl);
}
