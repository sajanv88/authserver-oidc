import { ImageZoom } from "@nuvui/react";
import Image, { type StaticImageData } from "next/image";
import "./shot.scss";

/**
 * A screenshot of the running server, with what it shows in words under it. A click (or its
 * button) zooms in; resting the mouse on it doesn't, so it doesn't grow while you scroll.
 */
export function Shot({
  src,
  alt,
  caption,
  narrow = false,
}: {
  src: StaticImageData;
  alt: string;
  caption: string;
  /** A dialog rather than a whole page: shown smaller. */
  narrow?: boolean;
}) {
  return (
    <figure className={narrow ? "shot shot--narrow" : "shot"}>
      <ImageZoom hover={false} className="shot__zoom">
        <Image src={src} alt={alt} sizes="(min-width: 64rem) 96rem, 200vw" />
      </ImageZoom>
      <figcaption className="shot__caption">{caption}</figcaption>
    </figure>
  );
}
