import { auth } from "@/features/oidc";

// nextidp's routes: GET /oidc/login and /oidc/callback, POST /oidc/logout and /oidc/refresh.
export const { GET, POST } = auth.routes();
