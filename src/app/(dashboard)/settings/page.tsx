import Link from "next/link";
import { Lane, Num, PageHead } from "@/components/ui/primitives";

/**
 * DESK SETUP — the screen the owner walks down on his first morning, so the order
 * is the order of his day: what prints on paper, who gets a login, where leads land,
 * how they are contacted, what the shop charges, what acquisition costs, then the
 * launch verdict and audit book.
 */
const SECTIONS = [
  {
    href: "/settings/business",
    code: "01",
    title: "Business details",
    sub: "Your name, address, HST number and how you take payment — everything printed on an estimate or an invoice",
  },
  {
    href: "/settings/users",
    code: "02",
    title: "Crew",
    sub: "Who can open this desk, and how much of it each of them sees",
  },
  {
    href: "/settings/integrations",
    code: "03",
    title: "Intake channels",
    sub: "Facebook, Instagram, Google Local Services and the marketplaces that email you",
  },
  {
    href: "/settings/intake",
    code: "04",
    title: "Landing intake",
    sub: "A form on your own website drops the lead straight onto the call sheet",
  },
  {
    href: "/settings/notifications",
    code: "05",
    title: "Lead alerts",
    sub: "Telegram and email the moment a lead lands, with quiet hours overnight",
  },
  {
    href: "/settings/sms",
    code: "06",
    title: "SMS",
    sub: "Twilio number and credentials for two-way lead texting, callbacks and booking messages",
  },
  {
    href: "/settings/moving-rates",
    code: "07",
    title: "Moving rate card",
    sub: "Your real crew, truck and add-on rates — the only prices the moving calculator is allowed to quote",
  },
  {
    href: "/settings/lead-costs",
    code: "08",
    title: "Lead costs",
    sub: "What Google LSA, HomeStars, Bark and other marketplaces charged for individual contacts",
  },
  {
    href: "/settings/meta-ads",
    code: "09",
    title: "Meta Ads reporting",
    sub: "Read-only ad account connection for campaign spend, CPL and ROAS",
  },
  {
    href: "/settings/go-live",
    code: "10",
    title: "Go-live readiness",
    sub: "One live launch verdict from workspace, intake, SMS, alerts, Meta and acceptance evidence",
  },
  {
    href: "/settings/log",
    code: "11",
    title: "Action log",
    sub: "Who changed a price, took a payment, voided an invoice",
  },
];

export default function SettingsPage() {
  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="Desk setup"
        title="Settings"
        sub="Work down the list once, then run Go-live readiness before paid traffic. The action log is read-only history."
      />

      <Lane>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="row">
            <span className="flex items-baseline gap-4 sm:gap-5">
              <Num className="t-meta shrink-0 tracking-[0.1em] text-ink-3">{s.code}</Num>
              <span className="min-w-0 flex-1">
                <span className="t-row block font-bold leading-none text-ink">{s.title}</span>
                <span className="measure t-meta mt-1.5 block text-ink-2">{s.sub}</span>
              </span>
              <span className="eyebrow hidden shrink-0 sm:block" aria-hidden>
                Open →
              </span>
            </span>
          </Link>
        ))}
      </Lane>
    </div>
  );
}
