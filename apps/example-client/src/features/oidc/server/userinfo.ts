import "server-only";
import { env } from "@/shared/config/env";
import { discover } from "./discovery";
import { fetchUserInfo, type UserInfo } from "./tokens";

export async function userInfoFor(accessToken: string): Promise<UserInfo> {
  return fetchUserInfo(await discover(env().authServerUrl), accessToken);
}
