import { Facts } from "@/components/facts/facts";
import { Features } from "@/components/features/features";
import { Hero } from "@/components/hero/hero";
import { Preview } from "@/components/preview/preview";
import { SiteFooter } from "@/components/site-footer/site-footer";
import { SiteHeader } from "@/components/site-header/site-header";
import { SkipLink } from "@/components/skip-link/skip-link";

export default function Home() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="content">
        <Hero />
        <Facts />
        <Features />
        <Preview />
      </main>
      <SiteFooter />
    </>
  );
}
