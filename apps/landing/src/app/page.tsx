import { CallToAction } from "@/components/call-to-action/call-to-action";
import { Connect } from "@/components/connect/connect";
import { Deploy } from "@/components/deploy/deploy";
import { Facts } from "@/components/facts/facts";
import { Faq } from "@/components/faq/faq";
import { Features } from "@/components/features/features";
import { Hero } from "@/components/hero/hero";
import { HowItWorks } from "@/components/how-it-works/how-it-works";
import { Pillars } from "@/components/pillars/pillars";
import { Preview } from "@/components/preview/preview";
import { QuickStart } from "@/components/quick-start/quick-start";
import { Security } from "@/components/security/security";
import { SiteFooter } from "@/components/site-footer/site-footer";
import { SiteHeader } from "@/components/site-header/site-header";
import { SkipLink } from "@/components/skip-link/skip-link";
import { Stack } from "@/components/stack/stack";
import { Why } from "@/components/why/why";

export default function Home() {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="content">
        <Hero />
        <Facts />
        <Pillars />
        <Why />
        <Features />
        <Preview />
        <HowItWorks />
        <QuickStart />
        <Connect />
        <Security />
        <Deploy />
        <Stack />
        <Faq />
        <CallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
