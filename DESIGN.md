# HandymanPro CRM — Design Direction: «НАРЯД» / WORK ORDER

Locked 2026-07-27. Everything downstream references tokens only. No raw hex in components.

## The subject's real world

This is not a SaaS dashboard for founders. It is the tool a dispatcher runs for eight hours
on a laptop in a shop office, and a tech opens on a phone with dirty hands in a driveway.
Its vernacular is the **work order**: a numbered ticket, a crew, a truck, a date, a total.
HVAC and moving contractors already run on paper tickets — the product should look like the
good version of that paper, not like a generic CRM.

## The three directions considered

1. **«Наряд» / Work Order (CHOSEN)** — fleet-navy chrome + cool work deck, single Chivo
   superfamily, amber as the "live job" light, every record is a numbered ticket plate with
   a status spine and a punched notch.
2. **«Ведомость»** — green-bar accounting ledger paper, typewriter mono, carbon-copy
   triplicate (white estimate / canary invoice / pink paid). Rejected: the stamp-press motion
   and receipt-perforation signature collide with `accountingos` in the ledger.
3. **«Тоннаж»** — thermal instrument panel, cold/hot semantic scale. Rejected outright:
   `dreamhvac-thermal` already owns the thermal-delta device and international orange.

## Ledger divergence (≥3 of 5 required against every row)

| Axis | This design | Nearest ledger row | Divergent? |
|---|---|---|---|
| Background | fleet navy `#0E1626` chrome + cool deck `#EDF0F4` — **navy family, unused in ledger** | `liftline` galvanized steel `#D5DADC`, `relohub` console-dark | ✅ |
| Display face | Chivo 700/900 + Chivo Mono (single superfamily) | `granor` Saira, `liftline` Barlow Condensed, `dreamhvac-thermal` Archivo | ✅ |
| Accent | amber `#FFB020` as the *live-job lamp* only | `granor` hi-vis `#F5C518` | ⚠️ same family, different role (semantic status lamp vs slot marker) |
| Signature | work-order ticket plate: status spine + punched notch + `WO-2026-0042` mono + day rail + tear-off stub on estimate→invoice | `granor` spec-plate, `liftline` arrival board | ✅ |
| Motion | ticket snap on status change (translateX 8px, 160ms) + money count-up only on real change | `granor` draw+snap-in, `liftline` row-arrival | ✅ |

4 of 5 clear. Accent shares the yellow family with `granor` but nothing else does.

## Tokens

### Colour — commit to COOL. Never pure `#000`/`#fff` for text.

```
--navy-900 #0E1626   rail, chrome, mobile bar
--navy-800 #16223A   rail hover, ticket header on dark
--navy-700 #22314F   rail borders
--deck     #EDF0F4   page background (cool work surface)
--sunk     #E1E7EE   recessed lanes, table zebra, empty slots
--plate    #FBFCFD   the plate every record sits on
--line     #D3DBE4   hairlines (the ONLY separator strategy — no shadows anywhere)
--ink      #131A26   primary text
--ink-2    #45536C   secondary
--ink-3    #59677D   labels, mono eyebrows — tuned so 11px eyebrows clear AA on the deck
                     AND on the recessed lane: 4.61 on --sunk, 5.02 on deck, 5.58 on plate
--rail-ink #97A3B8   text on the navy rail; ink-3 fails AA against navy-900
--amber    #FFB020   THE live-job lamp. ≤3 per viewport. Never a background wash.
--amber-ink #7A5200   amber-as-text, WCAG AA on plate
--sky      #2F6BE0   scheduled / informational
--emerald  #1B7F55   won, paid, completed
--rose     #C7332F   overdue, lost, cancelled
--slate    #64748B   neutral / archived

Every semantic hue has a text-weight twin, because a colour that clears AA as a 4px spine
does not clear it as 11px type on the deck:
--amber-ink   #7A5200
--rose-ink    #B82B27
--sky-ink     #2A61CE
--emerald-ink #17714B
--slate-ink   #5A6979
Use `textToneFor(status)` — never the spine value — for status text.

Three surfaces, three twins. The `*-ink` values are darkened for light ground and land at
2.6–3.2:1 on the navy chrome, so the same status word on the rail, the phone's bottom bar
or a toast was unreadable. The rail twins are the same four hues opened up instead:
--sky-rail     #7FA9F5   7.66:1 on navy-900
--emerald-rail #5FC79B   8.72:1
--rose-rail    #F28E8B   7.76:1
--slate-rail   = --rail-ink
Amber needs no twin — 9.89:1 there is why it is the rail's lamp. Use `railToneFor(status)`.

Two more tokens carry the working surface rather than a status:
--field-line #7A8899  the boundary of anything that takes typing (3.5:1 on plate)
--focus      = --ink   the keyboard ring; --focus-rail = --plate on the navy chrome
```

Semantic colours carry meaning ONLY. A pill is never blue because blue is pretty.

### Type

- **Chivo** — display 700/900, body 400/500. A utility grotesque with plate-lettering bones;
  reads like fleet numbering, not like a startup.
- **Chivo Mono** — every number, ID, date, money, phone. `tabular-nums` always.
- No third family. No Inter, no Space Grotesk, no Geist as identity.

Scale (revised — v1 clustered everything between 13 and 28px, so nothing could dominate):
`10` mono ticks and strip letters · `11` eyebrows (uppercase, `0.09em` tracking) ·
`12` meta · `13` body · `14` the page sub-line and prose · `15` row titles ·
`22` day numerals and record titles · `30` money readouts · `34/44` page titles.
Real jumps, not 400-vs-600 weight nudges.

**Ten steps and no eleventh.** The scale is written as `--fs-*` tokens and as the `.t-*`
classes in `globals.css` — `.t-micro .t-meta .t-body .t-lede .t-row .t-record .t-readout
.t-page`, with `.eyebrow` covering 11. Spelling a size by hand (`text-[19px]`) is how a
ten-step system ended up with twenty sizes in use: every one of them was a private
decision that no neighbouring screen could see.

The scale must NOT be declared as `theme.fontSize` in `tailwind.config`. `cn()` merges
through `tailwind-merge`, which reads `text-<word>` as a colour and drops it when a colour
follows — `text-body … text-plate` silently lost its size and every button in the product
rendered at the browser's 16px. Verified and reverted on 2026-08-13.

### Shape & depth

- **One radius language: 3px.** Tickets, plates, inputs, buttons. `999px` only for crew avatars.
- **Zero box-shadows.** Depth comes from the `--line` hairline, the `--sunk` recess, and the
  4px status spine.
- **A frame is the LAST resort** (revision 2026-07-27). v1 banned shadows and then wrapped
  every group in a hairline rectangle instead — the deck became a stack of identical boxes
  with nothing dominant. The ladder is now enforced:

      air  →  surface shift  →  a single rule  →  a closed frame

  A closed frame is earned only by things that are literally a piece of paper: the invoice
  and estimate documents, and the header plate of a record. **Lists are ruled rows** — a
  3px status spine, a bottom hairline, and air. Sections open with a rule; they do not
  close in a box.

### Space

One grid: **4 / 8 / 12 / 16 / 24 / 40** (`--sp-1 … --sp-10`). Half steps exist only to sit
a line on a neighbour's baseline. The rhythm: 4 between a title and its detail, 12/16
inside a row, 16 between blocks in a section, 40 between sections — and a section opens
with a rule, never with a box.

Two widths, and no third. An index screen runs the full deck; a record or a form runs
`.page-doc` (980px); prose stops at `.measure` (62ch). Before this was written down the
page title started at seven different x positions across the record screens.

## Signature element — the ticket plate

Every lead, job, task, estimate and invoice renders as the same primitive:

```
┌▌────────────────────────────────────────────────┐   ▌ = 4px status spine (semantic colour)
│▌ WO-2026-0042        Kitchen Renovation         │   mono ID, left, always
│▌ SARAH CONNOR · TORONTO · 416-555-0101          │   detail line, --ink-2
│▌                                    $ 4,820.00  │   money right, Chivo Mono tabular
└▌───────────────────────○────────────────────────┘   ○ = punched notch, bottom edge
```

The notch is a 10px semicircle cut from the bottom edge in `--deck`. It is what makes the
plate read as a torn ticket instead of a card. It appears on every ticket, nowhere else.

Second device: **the week board as a measuring rule.** The board is edged with tick marks —
five per day column, a taller amber tick at today's boundary — because the thing is an
instrument for measuring a week. Today's column is lit from the top by an amber gradient
(`rgb(255 176 32 / .16)` → transparent at 62%): the accent behaves as a **light source**,
not as paint, and today's numeral steps up to 28px/700 while the rest sit at 22px/500.

Third device: **the tear-off stub** — an estimate document ends in a perforated edge; issuing
an invoice from it tears the stub (the perforation animates apart, 260ms).

## Material

The deck is a **shop drawing sheet**, not blank grey: a 44px square grid in `--grid`
(`#E3E9F0`, weaker than `--line` — it is ground, not structure) on the scrolling surface.
A contractor reads drawings all day; the ground says so. It must stay felt rather than
seen — if it competes with type it is too strong.

The navy rail carries a **machined edge**: hairline ticks down its right side at 30%
opacity, the way a gauge bezel is knurled. Material only — it carries no data and never
moves.

## Motion

Instrument-functional. `--ease: cubic-bezier(.32,.72,0,1)`, `--t-fast: 140ms`, `--t: 180ms`.

**The arming sequence** — the one orchestrated moment. On entering Dispatch the desk boots
like an instrument: the seven day columns tick in left→right (260ms each, 45ms stagger),
then the rail readouts settle top→bottom (220ms, 60ms stagger, starting at 340ms). Once per
page entrance, never on scroll, never re-triggered. `prefers-reduced-motion` collapses it.

- Signature: **ticket snap** — a status change slides the spine colour and the plate snaps
  `translateX(8px) → 0` over 160ms.
- Money counts up 380ms only when the value actually changes.
- Designed hovers: plate lifts by border darkening + 1px translate, never by shadow.
- No fade-up carpets. No scroll reveals — this is a working tool, not a landing page.
- `prefers-reduced-motion` kills all transforms.
- **The focus ring is never animated.** A transition is spelled with the properties it
  moves — `background-color, border-color, color, transform`. `transition-all` also
  animates the outline, and a control interpolates it from its resting state: the wrong
  colour and the wrong thickness for the first 140ms of every keyboard step.

## Anti-slop guarantees

- No cream, no serif, no terracotta.
- No `rounded-xl` + `shadow-sm` + `border-gray-100` card (the exact thing being replaced).
- No pastel `bg-*-100 text-*-700` pill soup — status is a spine and a mono label.
- No purple→blue gradient, no glass, no neon.
- Numbers are mono and tabular everywhere; money never sits in a proportional face.
- Money is a **gauge readout**: the currency symbol is a unit mark at 62% size and 45%
  opacity so the digits carry the weight, the way a dial reads `12.4` and prints `PSI` small.
- Money reaches a component as **whole cents** and is printed by `formatCents`; the
  `<Money cents={…} />` prop is named for its unit. Handed dollars, every readout on the
  screen would print a hundredth of the bill.

## Screenshot-critique log (design-engine loop)

Three cycles. What the pixels caught that no test could:

1. **Cycle 1** — the punched notch rendered as a stray outlined circle (rotated-square
   trick), and it sat on `--plate` inside nested plates so it read as a grey blob rather
   than a bite. Fixed to a half-disc filled with `--deck`, and the dashboard lists were
   un-nested so tickets sit directly on the deck.
2. **Cycle 2** — the hover rule set `border-color` wholesale, so **hovering a ticket
   erased its status spine**. Now only the top/right/bottom borders darken. Same cycle:
   amber-as-text failed WCAG (`PARTIAL` at 1.9:1) → `textToneFor()` maps amber to
   `--amber-ink`; the seven-day rail was unreadable at 390px → it collapses to a stacked
   list of the days that actually have work.
3. **Cycle 3** — automated contrast sweep over all seven pages found `--ink-3` eyebrows at
   4.26:1 on the deck. Darkened to `#5D6B82`; sweep now returns zero failures.

### Revision, 2026-07-27 — "everything reads as identical boxes"

The owner's verdict on the shipped v1: *«опять одинаковая оконная вёрстка квадратиками»*.
Re-scored against the rubric and four items failed:

- **Squint test** — blurred, the deck was six grey bands of equal weight. Nothing dominated.
- **Card justification ladder** — the ladder was skipped straight to `border` for every group.
  Shadows were banned in v1 and quietly replaced by hairline rectangles: the same defect.
- **Type scale** — the working range was 13→15px. No 3× jump anywhere below the page title.
- **Spacing rhythm** — 28px between sections vs 16px interior. No hierarchy of air.

What changed:

1. **The row replaces the card.** New `.row` primitive: spine + bottom rule + air, no frame.
   Every list in the product uses it. `.ticket` (plate + notch) is now reserved for documents
   and record headers, where the frame means "a piece of paper you could hold".
2. **The desk became asymmetric.** Dispatch is `1fr / 300px`: the week board and the work on
   the left, the money rail on the right, separated by a single vertical rule. Different
   widths encode different importance — v1 stacked equal-width panels.
3. **The week board is the hero.** 188px tall, edge-to-edge in its column, day numerals at
   22px mono, today filled with `--sunk` and its date in amber-ink. It opens the deck.
4. **Frames removed** from filter bars, readout strips and empty states — all now ruled.
5. **Two more text-weight tokens** (`--sky-ink`, `--emerald-ink`) because rows moved off the
   plate onto the deck, where the spine hues drop below AA as small type.

Two loop cycles. Cycle 1 caught the rail header collapsing into three lines and overflowing
its 300px column; cycle 2 confirmed desktop and phone. Contrast sweep: zero failures.

### Revision 2, 2026-07-28 — "make it more interesting"

The row revision fixed the boxes and left the deck austere: correct, quiet, and without a
face. Stripping the frames had also stripped the signature — the punched notch retreated to
documents, so most screens carried no device at all. This pass gives the character back
without giving the rectangles back.

1. **Material** — the drawing grid on the deck. First attempt was invisible: the app shell
   paints its own opaque `bg-deck` over anything set on `<body>`, so the grid had to move to
   the scrolling `<main>`. Then it was too strong at `#DEE5ED` and competed with the rows;
   softened to `#E3E9F0`.
2. **The week board became a measuring rule** — tick-edged, today lit from above by amber
   and stepped up in size. This is now the page's dominant device, and it belongs to the
   subject rather than to a design trend.
3. **Gauge readouts** — the currency symbol recedes so the digits read as an instrument.
4. **The arming sequence** — verified from a frame burst at 90/180/300/460/700ms: at 180ms
   the board is in and the rail is still empty; at 700ms the readouts are visibly mid-settle.
   The orchestration the direction always claimed but never had.

Budget respected: one signature effect (the rule + arming), three structural (grid, gauge
numerals, machined rail edge), micro-interactions unchanged. Contrast: zero failures.

### Revision 3, 2026-08-04 — "каждому экрану свой прибор"

Owner's verdict on v2: *«все экраны почти одинаковые таблички — хочу индивидуальные в
зависимости от функции»*. He is right: Leads, Jobs, Clients and Invoices had converged on
one template — PageHead → full-width search bar → identical ruled rows. Only Crew (kanban)
and Today (field cards) had faces.

The rule that fixes it: **every screen is a different instrument from the same toolbox.**
Tokens, type, spines, rows and tickets stay law; what changes per screen is the DEVICE — the
one layout mechanism that could only belong to that screen's function. The search-bar-first
header is dead; search folds into the lane heads. Each screen's device, grounded in what a
contractor actually holds in his hands for that job:

| Screen | Device | Grounding |
|---|---|---|
| Dispatch | week board as measuring rule (v2, unchanged) | the dispatch desk |
| Leads | **call sheet + pipeline rail**: stage strip up top (NEW→CONTACTED→VERIFIED→closed, counts + share bars); body split 7/5 — "on the phone" (fresh + aging, phone numbers big, age tallies going rose past 3 days) vs "worked" (verified/converted/rejected, dimmed) | the morning call-back sheet by the shop phone |
| Jobs | **state ladder**: IN PROGRESS as full ticket plates with crew + an EST→PAID fill rule; SCHEDULED as rows on a left date rail (day numeral + month, board-style); COMPLETED as compressed one-line ledger rows | live orders on the desk, booked orders on the peg, closed orders in the drawer |
| Clients | **card index**: A–Z thumb rail; letter dividers in the gutter (22px mono); rows as file cards — initials tab, owing readout in rose, equipment chips | the rolodex / phone book |
| Contracts | **year rule**: 12-month strip board up top (visits due per month, current month lit by the amber light source); each contract carries its own 12-cell month strip — visit months marked, next due amber, done emerald | the annual maintenance wall planner |
| Invoices | **the ledger**: aging bar (one stacked rule: paid/partial/due/overdue with readouts); body grouped by aging band, rows as single-line ledger entries with dotted leaders to right-aligned money | the green-bar receivables book |
| Finance | **the T-account**: money-in column left, money-out column right, one center rule; NET on a double accounting rule at the bottom | the month-end books |
| Crew | kanban lanes (unchanged) | the whiteboard |
| Today | field cards (unchanged) | the clipboard in the truck |

New CSS vocabulary (globals.css): `.dotlead` (dotted leader line for ledger entries),
`.rule-double` (the accountant's double rule above a total). Everything else is assembled
from existing tokens and primitives — no new colours, no new type, no new radius.

Loop log, two cycles + gates:

1. **Cycle 1** (desktop, all six screens) — two semantic lies caught: the contract
   mini-strip painted every past cycle emerald ("done") while the same row said
   `0 BOOKED`; emerald is now paid out only for as many past cycles as `visitsBooked`
   vouches for, the rest get the pale `--line` fill (spent time, not done work). And an
   empty Finance month shouted `$0.00` in rose/emerald — zero totals now sit in neutral
   ink. Also identified (and disproved as a bug) the "white second row" — a stuck
   Playwright hover from the login click, not a rendering defect.
2. **Cycle 2** (desktop + 390px + Finance on a month with data) — two real phone
   defects: the Clients search input amputated the A–Z rail at "J" (search now stacks
   above the rail below `sm`), and invoice ledger lines crushed client names to "K.."
   (the number and dot leader now yield below `sm`; spine + name + aging + money carry
   the line). T-account verified against July's live entries, negative NET reads rose.
3. **Gates** — `tsc` clean, zero console errors across all six screens both viewports,
   automated contrast sweep: zero failures.

### Revision 3.1, 2026-08-04 — Leads and Clients get working depth

The owner asked for the two people-facing sections to be worked over properly. The
instruments stayed; they gained hands:

- **The call sheet acts.** Row-level outcomes (CONTACTED / VERIFY / quiet REJECT; primary
  OPEN JOB → on verified) PUT a partial `{status}` and mutate local state — search focus
  and scroll survive, the moved row gets the ticket-snap. Converted leads link `→ WO`.
- **The lead record is a call card.** The phone is the dominant object (24px mono + CALL /
  EMAIL); a 4-step pipeline ladder (NEW→CONTACTED→VERIFIED→JOB, done steps filled) replaces
  scattered buttons; `notes` render as a CALL LOG with `[04 AUG 21:56]` mono stamps and a
  one-line quick-add. `?convert=1` deep-links the convert modal from the sheet.
- **The client record is a dossier.** The boxed stat grid and jobs/equipment/invoices tabs
  are gone: file-plate header (initials tab, OWES readout or IN GOOD STANDING), 7/5 body —
  HISTORY on a date rail + PAPER ledger with dot leaders on the left; MONEY POSITION,
  IRON ON SITE (spined rows, emerald=under warranty, expired warranty in rose-ink) and
  SERVICE PLANS on the right. Equipment CRUD kept.
- **The index knows the iron.** `/api/clients` ships `equipmentKinds` ("FURNACE · Carrier")
  for real chips; phones are tel: links (row link became an overlay to keep the HTML valid).

Loop: live smoke (inline outcome click, call-log append, chips) + screenshot pass desktop
and 390px, zero console errors, contrast sweep over list + record pages: zero failures.

### Revision 3.2, 2026-08-13 — the day rail learns who is out and for how long

The week board was the one device that still reported a number nobody could act on:
`4/2 OVER`, jobs divided by heads. It went red on a day where the crew was free and stayed
quiet on a day where one man was booked twice, and it never named anybody. Two additions,
both assembled from the existing toolbox — no new colour, no new radius, no new type:

- **Load lines.** Under each day numeral, one mono line per person who is actually out
  (`SAM C`, `×2` when he has more than one stop), in `--ink-2`. A man whose jobs overlap in
  time turns `--rose-ink` and gains a leading `!`; work with nobody on it counts separately
  in `--amber-ink` as `n UNCREWED`, because an unassigned job is a truck that does not
  leave. The week head carries the same fact in one phrase: `1 DAY DOUBLE-BOOKED`.
- **Run bars.** A job that holds more than one day is drawn once, as a bar over the columns
  it occupies, laid on top of the seven-column grid at the band under the numerals and
  stacked into lanes when two runs overlap. `◀` and `▶` mark a run that continues outside
  this week. A mover's three-hour stop stays a stub inside its column — the two trades read
  the same rail with their own ruler. The phone stack keeps the same information as
  `day 2/4` on the job line plus the day's clash names in rose.

The dispatch strip on the job card (DAY · START · TAKES · CREW) reuses the form language of
every other screen — mono eyebrow above its control, 3px radius, no frame. The double-booking
warning is a rule in `--rose` over a plain block: what collides, at what time, and two
buttons. It reports; it never refuses.

Loop, two cycles: **1** — the strip's labels sat inline beside their controls (`<span>` is
inline, and only the other forms' `w-full` inputs had been forcing the stack); labels now
own a `flex flex-col` label, and the duration options lost their prose so the select stops
stretching. **2** — desktop and 390px re-shot, both correct: bars span the right columns,
the clash line names the right man, the phone stack numbers the day of the run. Gate: `tsc`
clean, `next lint` clean, 282 tests green, zero new console errors, and the only tones
introduced are `--rose-ink` and `--amber-ink`, both already AA-verified text twins.

One trap worth writing down: a stale service worker (`hp-shell-v1`) kept serving an old JS
chunk through server restarts, so three screenshot cycles were spent looking at code that
no longer existed. When a change refuses to appear, unregister the worker and drop its
caches before doubting the code.

### Revision 4, 2026-08-13 — the foundation, measured

A polish wave opened with a measurement instead of an opinion: every screen in both roles
at 1440 and 390, with a DOM probe counting sizes, radii, shadows, control heights, numbers
in the wrong face and labels with nothing to label (`var/polish/base/audit.mjs`).

What the measurement said. Zero shadows, one radius, zero contrast failures — the three
laws this document shouts about were being kept. What had drifted was everything the
document had left implicit: **twenty type sizes** in a ten-step scale, **fifteen button
heights** on the desk, form controls at 32/34/38/39/40px because nine screens each kept a
private copy of `const field = "w-full px-3 py-2 …"`, the page title starting at seven
different x positions, 149 numbers set in the proportional face, eight dates printed
`2026-07-27` beside fifteen printed `Jul 27, 2026`, and 110 labels of which one was
attached to its field.

The rule this proves: **a law that is not a token is not a law.** Colour and radius held
because they were tokens; type, space, width and control geometry drifted because they
were sentences. So they became tokens too — `--fs-*`, `--sp-*`, `.t-*`, `.control`,
`.chip`, `.actions`, `.page-doc`, `.measure` — and the primitives grew the parts screens
were re-inventing: `Num`, `Stamp`, `Chip`, `BackLink`, `ErrorNote`, `TableWrap`, `Th`, a
fourth `quiet` button rank, an `Empty` that says what to do next, a `Field` that hands the
control its own class, and `railToneFor` with three rail-weight twins so a status word can
be printed on the navy chrome at 7.7:1 instead of 3.0.

Three defects the pixels caught that no static check could:

1. **`transition-all` animated the focus ring.** A control inherits its resting outline —
   `medium` width in its own text colour — so for the first 140ms the keyboard ring on the
   VOID button was a 3px rose rectangle and on a ghost button a grey one. Buttons now name
   their transitioned properties, and the focus rule names them again, so no screen can
   re-introduce it.
2. **The focus rule was reshaping what it focused.** It set `border-radius: var(--r)` on
   the element, which squared off every `rounded-full` avatar and lamp the moment it took
   focus. Removed; the outline follows the element's own radius.
3. **The type scale, declared through Tailwind, deleted itself.** See the Type section:
   `tailwind-merge` reads `text-body` as a colour. Every button in the product was
   rendering at 16px and 42px tall, and `tsc`, `lint` and the 354 tests were all green.

Two cycles on the shared parts (`var/polish/base/*-specimen-*.png` — a specimen sheet of
every primitive on one deck, shot at 1440 and 390 with a keyboard-focus frame), plus a
before/after sweep of all 23 screens in both roles. Cycle 1 moved the page action under
the title on the phone and let the lane head wrap instead of shrink; cycle 2 fixed the
focus ring and turned the empty state from a centred poster into a left-aligned status
line that names the next move. Gates: `tsc` clean, `next lint` clean, **354 of 354 tests**.

One trap worth writing down beside the service worker: `npm run test` and a running dev
server share `dev.db`. Run together they produce up to five red files and a shifting
skipped-test count; run apart, the suite is green. Kill the server before the gate.

### Revision 5, 2026-08-13 — the wave closes: one word, one number, one height

Eight tracks polished a screen group each, three checked the result across all of them, and
this pass swept the seams the group reports named. Nothing here is a new direction: it is
the «НАРЯД / WORK ORDER» language finished where the implementation had drifted from it.

**What the check found and this pass fixed.** Every drift was invisible inside its own
screen and obvious the moment you walked from one screen to the next:

1. **One fact, six spellings.** The same overdue invoice read `23 DAYS LATE`, `23D LATE`,
   `8 DAYS PAST DUE`, `OVERDUE · 23D`, `IN 49D` and `IN 19 DAYS`. There is now one pair of
   helpers in `lib/invoice-state.ts` — `lateWord` / `dueWord` (plus the `…Tail` halves for
   the places that set the numeral in mono themselves). Full form by default; the short
   form is for a fixed-width column, and it is the same short form everywhere a column is
   narrow.
2. **One concept, one word.** Debt is `Owing` on the deck, in the book, on the invoice, in
   the dossier and in the card index — it had been `Outstanding` / `OPEN` / `Owed` /
   `Owing now` / `OWES`. People are `crew`, never `team`. The full glossary is
   `docs/COPY.md` §1; it is the canon, and the next screen takes its words from there.
3. **One counter shape.** `LaneHead` grew `count` and `unit`: right end of the head, mono,
   no leading zero. The work board had written it into the `h2` in a proportional face
   (`ON THE GO · 2`) and the whiteboard had padded it to `05`.
4. **Two control heights and no third.** `quiet` finally renders the 26px its own comment
   promised — `.t-micro { line-height: 1.1 }` is declared after the utilities layer and had
   been beating `leading-[16px]`, so the rank drew 21–22 on eight screens. `.control` states
   `min-height: 38px` outright, because a `<select>` and an `<input type="date">` take their
   height from the widget rather than from `line-height` and were landing at 35 and 40 in
   the same form as a 38px text field. The chrome's two hand-rolled buttons (31px) moved
   onto the shared rank. Measured after: **26 and 38, nothing else**.
5. **Three row densities became one plus two named ones.** `.row` is the law; `.row-tight`
   (8) belongs to the receivables ledger, `.row-tab` (16 above) to the card index whose
   file tab straddles the top rule. Both are declared in `globals.css`, so a screen can no
   longer invent a density with an inline `!py-2`.
6. **The filter bar has one home.** Anything that narrows a whole screen sits on the
   screen's own rule under the page head. The work board had folded it into the first
   lane's head, which made it read as that lane's control and left whichever lane came
   first without a count.
7. **The record heading is 22px on all five records.** The estimate had been carrying a
   44px page title, so walking lead → job → estimate → invoice the heading went
   22 → 22 → **44** → 22. The job record lost its two `mx-auto`, which had been pushing it
   84 points right of every neighbour.
8. **The lamp marks what is live.** An archive band (`Settled`) carries none.

**Three things the screens were saying that were not true**, all caught by walking the
product rather than by reading it:

- The deck's receivable summed `totalCents` and ignored payments, so the first number of
  the morning disagreed with the book it links to. The aging bar folded drafts into `OPEN`,
  and on a real book the drafts are the bigger half — $19,741 of paper the client had never
  seen was being read as money owed. Both now compute and name exactly what they show.
- The crew's MONEY tab printed «NOTHING RECORDED ON THIS JOB YET» over money the tech had
  taken himself, because the API strips `payments` for the role and the lane read an empty
  array as a fact. Silence is not a fact: the lane says the office book holds them.
- `Finance` had a loading state and an empty state and no refused state, so a 500 left the
  skeleton up for good and printed `$0.00` across all three totals. It names the refusal and
  offers Try again; both of its forms now read `res.ok` before saying «recorded».

**The offline card joined the product.** `public/offline.html` was the one surface set in a
system grotesque, with a hand-copied token set whose `--ink-3` was a revision behind. It
carries Chivo from `/fonts` (precached by the service worker, system stack as the fallback)
and the current tokens.

**One trap worth writing down beside the service worker and the shared `dev.db`:** the desk
throttles sign-ins at ten per IP per fifteen minutes (`lib/auth.ts`). A screenshot sweep
across two widths and two roles walks straight into it and then fails at the login form
with no explanation. Sign in once per role, save the storage state, and hand it to every
context.

Loop: two cycles at 1440 and 390 in both roles (`var/polish/integrate/iter1`, `after`), plus
a DOM probe over nine screens. Cycle 1 caught two of my own: removing the card index's
`!pt-4` dropped the file tab onto the row rule and into the client's name (hence `.row-tab`),
and the phone's More sheet printed section codes `04 · 06 · 07 · 08…`, a gap sequence that
asks a question it cannot answer — the codes came out. Gates: `tsc` clean, `next lint`
clean, **354 of 354 tests**, `next build` clean.

---

# Revision 4 — «НАРЯД, но дорого» (locked 2026-08-16)

Owner verdict on the shipped screens: they read as one flat grey-white table, screen after
screen. The bones (navy chrome, work-order voice, mono, 3px radius, the status palette) are
RIGHT and stay. What is missing is **richness and per-screen character** — the product looks
unfinished next to what it does. This revision adds depth without leaving the brand.

## What "dorogo" means here (do all of these; none is optional)

1. **Surface depth, used deliberately.** The three deck surfaces already exist
   (`--plate` raised, `--deck` field, `--sunk` recessed) — actually USE them to build
   layers: a plate panel sitting on the deck, a sunk well for a total. One hairline
   `--line` border plus at most a 1px inset/again is the elevation language — still no
   drop-shadow soup, but the page must stop being one flat plane. A "dorogo" screen has a
   clear foreground instrument and a quiet background.
2. **Status color as signal, not decoration.** The palette (amber live / sky / emerald in /
   rose owing / slate) is under-used. Money in is emerald, money owed is rose, a live job is
   amber, overdue escalates. Every screen should carry its own true colors where they mean
   something — never a rainbow, never color for its own sake (owner tone rule applies to
   pixels too).
3. **Micro-visualization primitives (NEW — build these once, reuse everywhere).**
   - `Sparkline` — a tiny mono/SVG week trend (leads/week, revenue/week). Flat, hairline,
     one accent stroke. No axes, no chrome.
   - `AgingBar` / `MeterBar` — a segmented bar for invoice aging (current→30→60→90) and for
     any proportion (capacity, collected vs owing). Uses status colors.
   - `StatTile` — the big living metric: a mono number at display size, an eyebrow label, an
     optional delta or sparkline under it. The command-bridge readout.
   - `Balance` — the two-sided in/out figure for the finance T-account, aligned and ruled.
   All flat, all tokenized, all zero-radius, all honoring `prefers-reduced-motion`.
4. **Every screen gets its own instrument (the owner's standing demand).**
   - **Dispatch** = the command bridge: a top band of StatTiles (leads today · money in this
     week + sparkline · overdue with an aging bar · crew out), then the week and the lists.
     This is the FLAGSHIP — build it first as the quality bar the others copy.
   - **Finance** = the ledger: a real two-sided T with a running balance meter, in emerald /
     out rose, the NET as the punched total. (Also FIX the right column overflowing the
     viewport — it currently clips.)
   - **Invoices** = the aging book: an AgingBar per row, an owed-vs-collected meter at top.
   - **Leads** = the call sheet (already close) + a source-mix strip and a response-time stat.
   - **Clients** = the card index (already close) — add an owing meter and a lifetime spark.
   - **Reports** = where the sparklines and bars earn their keep.
5. **Motion stays the §5 bar** — count-up on the StatTiles' real numbers, ticket-snap on
   status, a hairline draw under section heads. Transform/opacity only, reduced-motion honored.

## Hard rules that DO NOT change
- Navy chrome, cool deck, Chivo + Chivo Mono, `--r: 3px` (never rounder), the status tokens.
- No raw hex in components — tokens only. No drop-shadow pile-ups; depth comes from the three
  surfaces + one hairline. Owner tone: no "not X but Y", no emoji, numbers and nouns.
- Mobile/field: the tech's phone view stays first-class — StatTiles wrap, tap targets ≥44px.

## Also fix (bugs seen in the audit)
- The "Jobs" nav item points at a path that 404s by link — the route is `/projects`; make the
  nav label "Jobs" resolve to it (check Sidebar href vs the real route).
- Finance right column clips off the right edge — contain it.
