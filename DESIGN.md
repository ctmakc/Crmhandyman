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
--ink-3    #5D6B82   labels, mono eyebrows — tuned so 11px eyebrows clear AA on the deck
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
Use `textToneFor(status)` — never the spine value — for status text.
```

Semantic colours carry meaning ONLY. A pill is never blue because blue is pretty.

### Type

- **Chivo** — display 700/900, body 400/500. A utility grotesque with plate-lettering bones;
  reads like fleet numbering, not like a startup.
- **Chivo Mono** — every number, ID, date, money, phone. `tabular-nums` always.
- No third family. No Inter, no Space Grotesk, no Geist as identity.

Scale (revised — v1 clustered everything between 13 and 28px, so nothing could dominate):
`10/11` mono eyebrows (uppercase, `0.1em` tracking) · `12` meta · `13/14` body ·
`15` row titles · `22` day numerals on the week board · `30` money readouts ·
`34/44` page titles. Real jumps, not 400-vs-600 weight nudges.

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

## Anti-slop guarantees

- No cream, no serif, no terracotta.
- No `rounded-xl` + `shadow-sm` + `border-gray-100` card (the exact thing being replaced).
- No pastel `bg-*-100 text-*-700` pill soup — status is a spine and a mono label.
- No purple→blue gradient, no glass, no neon.
- Numbers are mono and tabular everywhere; money never sits in a proportional face.
- Money is a **gauge readout**: the currency symbol is a unit mark at 62% size and 45%
  opacity so the digits carry the weight, the way a dial reads `12.4` and prints `PSI` small.

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
