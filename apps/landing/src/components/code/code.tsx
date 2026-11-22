"use client";

import { CodeBlock } from "@nuvui/chat";
import { createShikiHighlighter } from "@nuvui/chat/shiki";
import type { ComponentProps } from "react";

// One highlighter for the whole page. Shiki is fetched the first time code is colored, and
// each grammar the first time its language turns up.
const highlighter = createShikiHighlighter();

/** nuvui's CodeBlock, colored by Shiki in the theme's own colors. */
export function Code(props: Omit<ComponentProps<typeof CodeBlock>, "highlighter">) {
  return <CodeBlock highlighter={highlighter} {...props} />;
}
