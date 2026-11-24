import * as v from "valibot";

/** `?page=` of a list: a page number from 1. Anything else, or none, is page 1. */
export const PageNumberSchema = v.fallback(
  v.pipe(v.string(), v.regex(/^[1-9]\d{0,5}$/), v.transform(Number)),
  1,
);

/** Where a page of a list is: its number (from 1), how many pages, and how many things. */
export type PageWindow = {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
};

/**
 * The page to show for `requested`: the last one when it's past the end, so the caller can
 * send the browser there. An empty list has one page, with nothing on it.
 */
export function pageWindow(requested: number, total: number, perPage: number): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  return { page: Math.min(requested, pageCount), pageCount, total, perPage };
}

/** How many things come before the page. */
export function pageOffset({ page, perPage }: PageWindow): number {
  return (page - 1) * perPage;
}
