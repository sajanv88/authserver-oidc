import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./constants";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it.each(["/", "/account/security", "/consent?client_id=a&scope=openid", "/a/b#c"])(
    "keeps the same-site path %s",
    (path) => {
      expect(safeReturnPath(path)).toBe(path);
    },
  );

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/",
    "javascript:alert(1)",
    "evil",
    "",
    undefined,
    null,
    ["/account"],
  ])("turns %s into /", (value) => {
    expect(safeReturnPath(value)).toBe("/");
  });
});

describe("isProtectedPath", () => {
  it.each(["/account", "/account/security", "/admin", "/admin/clients"])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(["/", "/login", "/accounting", "/administrator", "/api/auth/session"])(
    "leaves %s open",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});
