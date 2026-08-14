import Link from "next/link";
import { Lane, Num, PageHead } from "@/components/ui/primitives";

/**
 * DESK SETUP — the screen the owner walks down on his first morning, so the order
 * is the order of his day: what prints on the paper he hands a customer, who else
 * gets a login, where leads land, how he hears about them, and only then the book
 * that records what everyone did.
 *
 * The number in front of a section is the same number the section's own page
 * carries in its eyebrow. They had drifted — the index called the action log 04
 * while the log called itself 03 and the team page also called itself 01.
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
    href: "/settings/log",
    code: "06",
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
        sub="Work down the list once and the desk runs itself. The first five change what it does; the last one only reports what it did."
      />

      {/* Ruled rows. The list used to sit inside a closed rectangle, which is the box
          the 2026-07-27 revision took out of every other list in the product. */}
      {/* A ruled row without a spine. `Row` paints a slate one when a record carries no
          status, and slate means «neutral / archived» — on a menu of six settings that
          is a colour saying nothing, six times. The flex sits on an inner element
          because `.row` declares display:block and beats a utility class. */}
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
