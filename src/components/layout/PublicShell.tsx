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
/**
 * The one-line consent notice that sits under a sign-in or sign-up button.
 *
 * A contractor typing a customer's name and phone into this product is handing us other
 * people's personal information, so the moment they act there has to be a plain sentence
 * that says what they are agreeing to — and it has to reach the two documents, not just
 * name them. Both pages that carry an auth button drop this into the shell's `consent`
 * slot rather than each writing the sentence again and drifting.
 */
export function ConsentNotice() {
  return (
    <>
      By continuing you agree to the{" "}
      <a href="/terms" className="font-bold text-ink-2 underline underline-offset-2 hover:text-ink">
        Terms
      </a>{" "}
      and{" "}
      <a href="/privacy" className="font-bold text-ink-2 underline underline-offset-2 hover:text-ink">
        Privacy Policy
      </a>
      .
    </>
  );
}

export function PublicShell({
  headline,
  points,
  footnote,
  consent,
  children,
}: {
  /** The one statement on the navy plate. Desk only. */
  headline: React.ReactNode;
  /** What the product does, in the words of the trade. Mono, ticked, never a paragraph. */
  points: string[];
  /** A last mono line at the foot of the navy plate. */
  footnote?: string;
  /**
   * The consent line, rendered under the form. Pages that carry a sign-in or sign-up
   * button pass `<ConsentNotice />`; the waiting rooms leave it empty because there is
   * nothing to agree to on them — only the footer's two links.
   */
  consent?: React.ReactNode;
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
        <div className="w-full max-w-[400px]">
          {children}

          {consent && (
            <p className="mono mt-6 t-micro leading-[1.5] text-ink-3">{consent}</p>
          )}

          {/* The legal surface, on every public page. Storing a stranger's customers' names
              and numbers with no way to reach the terms or the privacy notice is the thing
              the launch audit stopped on — so the two links ride the shell itself, not each
              page. Quiet, mono, below the fold of attention but always one tap away. */}
          <footer className="mt-10 flex items-center gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <a href="/terms" className="mono t-micro uppercase tracking-[0.1em] text-ink-3 hover:text-ink">
              Terms
            </a>
            <span aria-hidden className="text-ink-3">
              ·
            </span>
            <a href="/privacy" className="mono t-micro uppercase tracking-[0.1em] text-ink-3 hover:text-ink">
              Privacy
            </a>
          </footer>
        </div>
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
