import { SiteFooter } from "@/components/site-footer/site-footer";
import { SiteHeader } from "@/components/site-header/site-header";
import { SkipLink } from "@/components/skip-link/skip-link";

export default function Home() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="content" />
      <SiteFooter />
    </>
  );
}
