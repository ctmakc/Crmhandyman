/**
 * THE PUBLIC FACE — sign in, sign up, and the screen a trial lands on when it runs out.
 *
 * The three of them had each written their own version of the same navy plate, and they
 * had drifted: two sizes of headline, two treatments of the feature strip, and one of
 * them (the expired trial) carried no product identity at all — a card floating in the
 * middle of an empty deck.
 *
 * On the desk it is a 5/7 split, navy on the left. On a phone the navy shrinks to a
 * brand bar, because the person opening this at 06:40 came from an alert link and wants
 * the two fields, not the pitch — the pitch waits below the form.
 */
export function PublicShell({
  headline,
  points,
  footnote,
  children,
}: {
  /** The one statement on the navy plate. Desk only. */
  headline: React.ReactNode;
  /** What the product does, in the words of the trade. Mono, ticked, never a paragraph. */
  points: string[];
  /** A last mono line at the foot of the navy plate. */
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-deck lg:grid lg:grid-cols-[5fr_7fr]">
      <aside className="bg-navy-900 px-6 py-5 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <div>
          <span className="t-record font-black tracking-tight text-plate">
            HANDY<span className="text-amber">CRM</span>
          </span>
          <p className="mono t-micro mt-1.5 uppercase tracking-[0.14em] text-ink-rail">
            Work-order desk
          </p>
        </div>

        <div className="hidden lg:block">
          <div className="t-readout max-w-[22ch] font-black leading-[1.08] tracking-tight text-plate">
            {headline}
          </div>
          <ul className="mono mt-8 space-y-2 t-micro uppercase tracking-[0.12em] text-ink-rail">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block h-[3px] w-3 shrink-0"
                  style={{ background: "var(--amber)" }}
                />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {footnote && (
          <p className="mono hidden t-micro uppercase tracking-[0.12em] text-ink-rail lg:block">
            {footnote}
          </p>
        )}
      </aside>

      <main className="flex flex-1 items-start px-6 py-10 lg:items-center lg:px-16 lg:py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>

      {/* The phone's share of the pitch: under the form, where it costs nobody a scroll. */}
      <ul className="mono flex flex-wrap gap-x-5 gap-y-2 bg-navy-900 px-6 py-5 t-micro uppercase tracking-[0.12em] text-ink-rail lg:hidden">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-[3px] w-3 shrink-0"
              style={{ background: "var(--amber)" }}
            />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
