"use client";

import { ShieldCheckIcon } from "@nuvui/icons";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import "./brand-mark.scss";

type BrandMarkProps = {
  /** LOGO_URL, or undefined for the shield. */
  logoUrl: string | undefined;
  /** The shield's width and height in pixels. */
  size: number;
  /** The logo's width and height in pixels; the shield's size when left out. */
  logoSize?: number;
};

/**
 * The product's mark beside its name: the configured logo, or the shield. A logo that doesn't
 * load (a typo, the host down) falls back to the shield rather than a broken image. Decorative:
 * the name next to it says what it is.
 */
export function BrandMark({ logoUrl, size, logoSize = size }: BrandMarkProps) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  // An image that failed before React hydrated never fires onError for it.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailed(true);
  }, []);

  if (!logoUrl || failed) return <ShieldCheckIcon size={size} />;
  return (
    <Image
      ref={image}
      className="brand-mark"
      src={logoUrl}
      alt=""
      width={logoSize}
      height={logoSize}
      // Shown as it is, from wherever it's hosted: not resized through this server.
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
