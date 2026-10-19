import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy and your health information",
  description: "How Aloha Footcare Services collects, uses and protects your health information.",
};

// DRAFT collection notice under Alberta's Health Information Act (s. 22).
// The clinic's privacy officer must review this, fill in the bracketed
// details, and keep it in step with the Privacy Impact Assessment.
export default function PrivacyPage() {
  return (
    <div className="public">
      <SiteHeader />
      <main id="main" className="wrap py-14 sm:py-20">
        <article className="max-w-[44rem]">
          <h1 className="text-[2.6rem] leading-tight text-ink sm:text-[3rem]">Privacy and your health information</h1>
          <p className="mt-4 text-drift">
            Aloha Footcare Services is a custodian under Alberta&apos;s <em>Health Information Act</em>. This notice
            explains what we collect when you book with us, why, and who can see it.
          </p>

          <Section title="What we collect">
            <p>When you book a visit, we collect:</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              <li>the name, address and phone number of the person receiving care</li>
              <li>the name, phone number and email of the person booking, if that&apos;s someone else</li>
              <li>the foot concerns you tell us about and any notes for the nurse</li>
              <li>whether you have insurance coverage for foot care</li>
              <li>your visit dates, the nurse who visits, and what was paid</li>
            </ul>
          </Section>

          <Section title="Why we collect it">
            <p>
              We use this information to provide foot care, to send the right nurse to the right place, to contact you
              about your visits, and to bill for our services. We collect it under section 20 of the{" "}
              <em>Health Information Act</em>, and only what we need for those purposes.
            </p>
          </Section>

          <Section title="Who can see it">
            <p>
              Only Aloha Footcare staff who need it for your care: our office team, and the nurse assigned to your
              visit. Every time a staff member opens a client record, it is logged. We don&apos;t sell or share your
              information for marketing.
            </p>
          </Section>

          <Section title="Where it's kept">
            <p>
              Your records are stored in Canada, in a database run for us by Supabase in its Canada (Central) region,
              under a written agreement. Card payments are processed by Stripe; Stripe receives the payment amount,
              your booking reference and your email, but no health information. We never see or store your full card
              number.
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>We keep health records for [retention period, per the clinic&apos;s records policy], then destroy them securely.</p>
          </Section>

          <Section title="Your rights">
            <p>
              You can ask to see your records or to correct them. If you have concerns about how we handle your
              information, contact our privacy officer first. You can also contact the Office of the Information and
              Privacy Commissioner of Alberta.
            </p>
          </Section>

          <Section title="Questions">
            <p>
              Our privacy officer is [name and title]. Reach them at{" "}
              <a href={`mailto:${site.email}`} className="text-clay underline underline-offset-4">
                {site.email}
              </a>{" "}
              or{" "}
              <a href={site.phone.href} className="text-clay underline underline-offset-4">
                {site.phone.display}
              </a>
              , or by mail at {site.address.join(", ")}.
            </p>
          </Section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[1.6rem] text-ink">{title}</h2>
      <div className="mt-3 text-ink">{children}</div>
    </section>
  );
}
