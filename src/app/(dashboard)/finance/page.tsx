"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatCents, inCents, type InCents } from "@/lib/money";
import {
  PageHead,
  LaneHead,
  Plate,
  Empty,
  Field,
  Money,
  Num,
  Readout,
  Skeleton,
  ErrorNote,
  Stamp,
  Button,
  buttonClass,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface ApiPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
  project: { id: string; title: string; clientName: string };
}

interface ApiExpense {
  id: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
  project?: { id: string; title: string };
}

/** The books as the API serves them: dollars. */
interface ApiFinanceSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  projectCount: number;
  payments: ApiPayment[];
  expenses: ApiExpense[];
}

/** What this screen works in. */
type FinanceSummary = InCents<ApiFinanceSummary>;

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The four files a bookkeeper asks for, cut to the period on screen. */
const EXPORTS = [
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["expenses", "Costs"],
  ["jobs", "Jobs"],
] as const;

/**
 * ONE LINE OF THE BOOK.
 *
 * On the desk it reads the way a ledger reads: stamp and method, what it was, a
 * dotted leader, the money on the right margin. On a phone the leader and the
 * stamp step out of the way — at 390 the stamp is 190px of the 358 available, and
 * with it in the line every amount in the book was pushed off the right edge of
 * the screen and the owner's books showed no money at all.
 */
function BookLine({
  date,
  kind,
  title,
  hint,
  cents,
  tone,
}: {
  date: string;
  kind: string;
  title: string;
  hint?: string;
  cents: number;
  tone: string;
}) {
  const stamp = (
    <>
      <Stamp date={date} /> · {kind}
    </>
  );
  return (
    <div className="flex items-baseline gap-3 py-2">
      <span className="eyebrow hidden shrink-0 sm:inline">{stamp}</span>
      {/* On the phone this fills the line so the amount keeps the right margin and a
          column of money stays a column. On the desk it yields to the dot leader. */}
      <span className="min-w-0 flex-1 sm:flex-none">
        <span className="t-body block truncate font-medium text-ink" title={hint}>
          {title}
        </span>
        <span className="eyebrow mt-1 block sm:hidden">{stamp}</span>
      </span>
      <span className="dotlead hidden sm:block" aria-hidden="true" />
      <Money cents={cents} tone={tone} className="t-body shrink-0" />
    </div>
  );
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "">(new Date().getMonth() + 1);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    projectId: "",
    amount: "",
    method: "CASH",
    notes: "",
    date: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    projectId: "",
    amount: "",
    category: "MATERIALS",
    description: "",
    date: "",
  });
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  /**
   * A refused month used to look like an honest one: the skeleton stayed up for
   * good and TOTAL IN, TOTAL OUT and NET all printed `$0.00`. The books saying
   * zero is the one thing this screen must never guess at.
   */
  const [refused, setRefused] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function fetchData() {
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set("month", String(month));
    const [finRes, projRes] = await Promise.all([
      fetch(`/api/finance/summary?${params}`),
      fetch("/api/projects"),
    ]);
    if (!finRes.ok) {
      setRefused(true);
      setData(null);
      return;
    }
    setRefused(false);
    // The one door on this screen: dollars off the wire, cents in the ledger. Both
    // forms below post the other way, in the dollars the owner typed.
    setData(inCents((await finRes.json()) as ApiFinanceSummary));
    const proj = projRes.ok ? await projRes.json() : [];
    setProjects(Array.isArray(proj) ? proj : []);
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  /* Both handlers used to fire and forget: a 400 closed the form, cleared the
     fields and said «Payment recorded» over money that never reached the book. */
  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const res = await fetch("/api/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentForm),
    });
    if (!res.ok) {
      setSaveError("That payment was not written down — check the job and the amount, then press Save again.");
      return;
    }
    setShowPaymentForm(false);
    setPaymentForm({ projectId: "", amount: "", method: "CASH", notes: "", date: "" });
    toast("Payment recorded");
    fetchData();
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const res = await fetch("/api/finance/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expenseForm),
    });
    if (!res.ok) {
      setSaveError("That cost was not written down — check the job and the amount, then press Save again.");
      return;
    }
    setShowExpenseForm(false);
    setExpenseForm({ projectId: "", amount: "", category: "MATERIALS", description: "", date: "" });
    toast("Cost recorded");
    fetchData();
  }

  const loading = data === null;
  const netCents = data?.netProfitCents || 0;
  const payments = data?.payments || [];
  const expenses = data?.expenses || [];
  const periodLabel = month ? `${MONTHS[month]} ${year}` : `Full year ${year}`;
  const exportQuery = `year=${year}${month ? `&month=${month}` : ""}`;

  return (
    <div className="space-y-10 pb-24 md:pb-0">
      <PageHead
        eyebrow="Books"
        title="Finance"
        sub="What came in, what went out, what is left."
        action={
          <>
            {/* The period drives the whole page, the totals and the export, so it
                carries its own name instead of leaving two bare boxes by the title. */}
            <Field id="books-month" label="Month">
              {(f) => (
                <select
                  {...f}
                  className={`${f.className} mono uppercase tracking-[0.06em]`}
                  value={month}
                  onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Full year</option>
                  {MONTHS.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="books-year" label="Year">
              {(f) => (
                <select
                  {...f}
                  className={`${f.className} mono`}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        }
      />

      {saveError && <ErrorNote>{saveError}</ErrorNote>}

      {/* ================================================================
          THE T-ACCOUNT — money in on the left page, money out on the
          right, one center rule between them. The month-end books.
          ================================================================ */}
      {refused ? (
        <ErrorNote
          className="measure"
          retry={
            <Button variant="ghost" onClick={fetchData}>
              Try again
            </Button>
          }
        >
          The books for {periodLabel} did not open — the office did not answer. Nothing
          is wrong with the money; this page could not read it.
        </ErrorNote>
      ) : (
      <section>
        <div className="grid md:grid-cols-2">
          {/* IN — the left page of the book. `min-w-0`: a grid track will not go
              narrower than its widest line unless it is told it may, and without
              it the ledger pushed the phone's whole page sideways. */}
          <div className="min-w-0 md:pr-8">
            <LaneHead
              title="In — Payments"
              lamp="var(--emerald)"
              right={
                <Button
                  variant="quiet"
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  aria-expanded={showPaymentForm}
                >
                  <Plus className="h-3 w-3" aria-hidden /> Payment in
                </Button>
              }
            />

            {showPaymentForm && (
              <Plate className="mb-4 p-5">
                <div className="eyebrow">Record payment</div>
                <form
                  onSubmit={handleAddPayment}
                  className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <Field id="pay-job" label="Job" required className="sm:col-span-2">
                    {(f) => (
                      <select
                        {...f}
                        value={paymentForm.projectId}
                        onChange={(e) =>
                          setPaymentForm({ ...paymentForm, projectId: e.target.value })
                        }
                      >
                        <option value="">Select job…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="pay-amount" label="Amount" required>
                    {(f) => (
                      <input
                        {...f}
                        className={`${f.className} mono`}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={paymentForm.amount}
                        onChange={(e) =>
                          setPaymentForm({ ...paymentForm, amount: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field id="pay-method" label="Method">
                    {(f) => (
                      <select
                        {...f}
                        className={`${f.className} mono uppercase tracking-[0.06em]`}
                        value={paymentForm.method}
                        onChange={(e) =>
                          setPaymentForm({ ...paymentForm, method: e.target.value })
                        }
                      >
                        {["CASH", "E_TRANSFER", "CHEQUE", "CARD"].map((m) => (
                          <option key={m} value={m}>
                            {m.replace("_", "-")}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="pay-date" label="Date" hint="Leave it blank for today">
                    {(f) => (
                      <input
                        {...f}
                        className={`${f.className} mono`}
                        type="date"
                        value={paymentForm.date}
                        onChange={(e) =>
                          setPaymentForm({ ...paymentForm, date: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field id="pay-notes" label="Notes">
                    {(f) => (
                      <input
                        {...f}
                        value={paymentForm.notes}
                        onChange={(e) =>
                          setPaymentForm({ ...paymentForm, notes: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <div className="actions sm:col-span-2">
                    <Button type="submit">Save</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowPaymentForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Plate>
            )}

            {loading ? (
              <Skeleton lines={3} />
            ) : payments.length === 0 ? (
              <Empty
                hint="Money lands here when the crew takes a payment at the door or you record one against a job."
                action={
                  <Button variant="ghost" onClick={() => setShowPaymentForm(true)}>
                    Payment in
                  </Button>
                }
              >
                No money in · {periodLabel}
              </Empty>
            ) : (
              <div className="border-t border-line pt-1.5">
                {payments.map((p) => (
                  <BookLine
                    key={p.id}
                    date={p.date}
                    kind={p.method.replace("_", "-")}
                    title={`${p.project.clientName} · ${p.project.title}`}
                    hint={p.notes || undefined}
                    cents={p.amountCents}
                    tone="var(--emerald-ink)"
                  />
                ))}
              </div>
            )}

            <div className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2.5">
              <span className="eyebrow">Total in</span>
              <Readout
                value={formatCents(data?.totalRevenueCents || 0)}
                size={22}
                tone={data?.totalRevenueCents ? "var(--emerald-ink)" : "var(--ink-3)"}
              />
            </div>
          </div>

          {/* OUT — the right page. The center rule is this column's left edge;
              below md it becomes a horizontal rule and OUT stacks under IN. */}
          <div className="mt-10 min-w-0 border-t border-line pt-6 md:mt-0 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <LaneHead
              title="Out — Costs"
              lamp="var(--rose)"
              right={
                <Button
                  variant="quiet"
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  aria-expanded={showExpenseForm}
                >
                  <Plus className="h-3 w-3" aria-hidden /> Cost out
                </Button>
              }
            />

            {showExpenseForm && (
              <Plate className="mb-4 p-5">
                <div className="eyebrow">Record cost</div>
                <form
                  onSubmit={handleAddExpense}
                  className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <Field
                    id="cost-job"
                    label="Job"
                    hint="Leave it on general overhead for rent, fuel and advertising."
                    className="sm:col-span-2"
                  >
                    {(f) => (
                      <select
                        {...f}
                        value={expenseForm.projectId}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, projectId: e.target.value })
                        }
                      >
                        <option value="">General overhead</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="cost-amount" label="Amount" required>
                    {(f) => (
                      <input
                        {...f}
                        className={`${f.className} mono`}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={expenseForm.amount}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, amount: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field id="cost-category" label="Category">
                    {(f) => (
                      <select
                        {...f}
                        className={`${f.className} mono uppercase tracking-[0.06em]`}
                        value={expenseForm.category}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, category: e.target.value })
                        }
                      >
                        {["MATERIALS", "LABOR", "TOOLS", "VEHICLE", "OTHER"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="cost-date" label="Date" hint="Leave it blank for today">
                    {(f) => (
                      <input
                        {...f}
                        className={`${f.className} mono`}
                        type="date"
                        value={expenseForm.date}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, date: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field
                    id="cost-description"
                    label="Description"
                    hint='Advertising goes in as "Ad spend: FACEBOOK" so Reports can count it.'
                  >
                    {(f) => (
                      <input
                        {...f}
                        value={expenseForm.description}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, description: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <div className="actions sm:col-span-2">
                    <Button type="submit">Save</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowExpenseForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Plate>
            )}

            {loading ? (
              <Skeleton lines={3} />
            ) : expenses.length === 0 ? (
              <Empty
                hint="Materials, fuel, tools and the advertising bill go here. A cost with no job on it counts as overhead."
                action={
                  <Button variant="ghost" onClick={() => setShowExpenseForm(true)}>
                    Cost out
                  </Button>
                }
              >
                No costs out · {periodLabel}
              </Empty>
            ) : (
              <div className="border-t border-line pt-1.5">
                {expenses.map((e) => (
                  <BookLine
                    key={e.id}
                    date={e.date}
                    kind={e.category}
                    title={`${e.description || e.category}${
                      e.project ? ` · ${e.project.title}` : ""
                    }`}
                    cents={e.amountCents}
                    tone="var(--rose-ink)"
                  />
                ))}
              </div>
            )}

            <div className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2.5">
              <span className="eyebrow">Total out</span>
              <Readout
                value={formatCents(data?.totalExpensesCents || 0)}
                size={22}
                tone={data?.totalExpensesCents ? "var(--rose-ink)" : "var(--ink-3)"}
              />
            </div>
          </div>
        </div>

        {/* THE BOTTOM LINE — the one dominant number on the page. */}
        <div className="rule-double mt-10 flex flex-wrap items-end justify-between gap-4 pt-4">
          <div>
            <div className="eyebrow">Net · {periodLabel}</div>
            <div className="eyebrow mt-2">
              Jobs closed <Num>{data?.projectCount || 0}</Num>
            </div>
          </div>
          <Readout
            value={formatCents(netCents)}
            size={30}
            tone={
              netCents > 0
                ? "var(--emerald-ink)"
                : netCents < 0
                  ? "var(--rose-ink)"
                  : "var(--ink-2)"
            }
          />
        </div>
      </section>
      )}

      {/* ================================================================
          STRAIGHT TO THE BOOKKEEPER. Four grey words under the total were
          63px wide and read as a footnote; the files the accountant comes
          for get their own lane and their own buttons.
          ================================================================ */}
      <section>
        <LaneHead title="Export CSV" right={<span className="eyebrow">{periodLabel}</span>} />
        <div className="border-t border-line pt-4">
          <p className="measure t-body text-ink-2">
            Every file is cut to the period above — change the month and the download
            follows it.
          </p>
          <div className="actions mt-4">
            {EXPORTS.map(([kind, label]) => (
              <a
                key={kind}
                href={`/api/export/${kind}?${exportQuery}`}
                className={buttonClass("ghost")}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
