import Link from "next/link";
import { PageHead } from "@/components/ui/primitives";

const SECTIONS = [
  {
    href: "/settings/users",
    code: "01",
    title: "Team",
    sub: "Add crew, set admin or worker access",
  },
  {
    href: "/settings/integrations",
    code: "02",
    title: "Intake channels",
    sub: "Facebook, Instagram, Google LSA, email marketplaces",
  },
  {
    href: "/settings/log",
    code: "03",
    title: "Action log",
    sub: "Who changed a price, took a payment, voided an invoice",
  },
  {
    href: "/settings/intake",
    code: "04",
    title: "Landing intake",
    sub: "Lead forms on your own sites post straight into this desk",
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <PageHead eyebrow="Desk setup" title="Settings" />

      {/* Ruled rows — the same list language as everywhere else. */}
      <div className="border border-line bg-plate">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-baseline gap-5 border-b border-line px-5 py-5 transition-colors duration-[140ms] ease-instrument last:border-b-0 hover:bg-sunk"
          >
            <span className="mono text-[12px] tracking-[0.1em] text-ink-3">{s.code}</span>
            <span className="flex-1">
              <span className="block text-[17px] font-bold leading-none text-ink">{s.title}</span>
              <span className="mt-1.5 block text-[13px] text-ink-2">{s.sub}</span>
            </span>
            <span className="eyebrow">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
