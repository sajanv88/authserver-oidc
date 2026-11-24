import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { PageNumberSchema, pageOffset, pageWindow } from "./paging";

describe("a list's ?page=", () => {
  it("is a page number from 1, and anything else is page 1", () => {
    expect(v.parse(PageNumberSchema, "3")).toBe(3);
    for (const page of [undefined, "", "0", "-2", "1.5", "2abc", "01", "9999999", ["2", "3"]]) {
      expect(v.parse(PageNumberSchema, page)).toBe(1);
    }
  });
});

describe("pageWindow", () => {
  it("counts the pages, and keeps a page inside them", () => {
    expect(pageWindow(2, 23, 10)).toEqual({ page: 2, pageCount: 3, total: 23, perPage: 10 });
    expect(pageWindow(9, 23, 10).page).toBe(3);
    expect(pageWindow(1, 20, 10).pageCount).toBe(2);
  });

  it("gives an empty list one page", () => {
    expect(pageWindow(4, 0, 10)).toEqual({ page: 1, pageCount: 1, total: 0, perPage: 10 });
  });

  it("pageOffset skips the pages before", () => {
    expect(pageOffset(pageWindow(3, 23, 10))).toBe(20);
    expect(pageOffset(pageWindow(1, 23, 10))).toBe(0);
  });
});
