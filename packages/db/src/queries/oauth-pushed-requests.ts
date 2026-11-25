import { and, eq, gt, lte } from "drizzle-orm";
import type { Executor } from "../executor";
import { oauthPushedRequests } from "../schema/oauth-pushed-requests";

// Pushed authorization requests (RFC 9126). The caller validates the parameters and hashes the
// request_uri; these only store a request and hand it back once.

export type NewPushedRequest = {
  requestUriHash: string;
  clientId: string;
  parameters: Record<string, string>;
  expiresAt: Date;
};

/** Stores a pushed request, and drops the ones that expired unused. */
export async function createPushedRequest(
  db: Executor,
  request: NewPushedRequest,
  now: Date = new Date(),
): Promise<void> {
  await db.delete(oauthPushedRequests).where(lte(oauthPushedRequests.expiresAt, now));
  await db.insert(oauthPushedRequests).values(request);
}

/**
 * The parameters pushed under this request_uri, if `clientId` pushed them and they haven't
 * expired, deleted in the same statement so they're used once. A request_uri sent with another
 * client's id is left alone: it's refused, and doesn't spend the real client's request.
 */
export async function consumePushedRequest(
  db: Executor,
  { requestUriHash, clientId }: { requestUriHash: string; clientId: string },
  now: Date = new Date(),
): Promise<Record<string, string> | undefined> {
  const [row] = await db
    .delete(oauthPushedRequests)
    .where(
      and(
        eq(oauthPushedRequests.requestUriHash, requestUriHash),
        eq(oauthPushedRequests.clientId, clientId),
        gt(oauthPushedRequests.expiresAt, now),
      ),
    )
    .returning({ parameters: oauthPushedRequests.parameters });
  return row?.parameters;
}
