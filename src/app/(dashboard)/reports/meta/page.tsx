import Link from "next/link";
import { requireAdminPage } from "@/lib/page-guard";
import { MONTH_NAMES } from "@/lib/contracts";
import { toDollars } from "@/lib/money";
import {
  loadMetaCampaignReport,
  type MetaBreakdownNode,
} from "@/lib/meta-report";
import {
  Chip,
  Empty,
  Field,
  Money,
  Num,
  PageHead,
  buttonClass,
} from "@/components/ui/primitives";
import SyncSpendButton from "./SyncSpendButton";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function currencyText(cents: number | null, currency: string | null) {
  if (cents === null) return "—";
  const code = currency || "CAD";
  try {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: code }).format(toDollars(cents));
  } catch {
    return `${code} ${toDollars(cents).toFixed(2)}`;
  }
}

type FlatRow = { node: MetaBreakdownNode; depth: number; path: string };

function flatten(nodes: MetaBreakdownNode[], depth = 0, parentPath = ""): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    const path = `${parentPath}/${node.level}:${node.key}`;
    rows.push({ node, depth, path });
    rows.push(...flatten(node.children, depth + 1, path));
  }
  return rows;
}

const LEVEL_LABEL: Record<MetaBreakdownNode["level"], string> = {
  campaign: "Campaign",
  adset: "Ad set",
  ad: "Ad",
  form: "Form",
};

function Count({ value, rate }: { value: number; rate?: string }) {
  return (
    <div className="text-right">
      <Num className="t-row font-bold text-ink">{value}</Num>
      {rate ? <div className="eyebrow mt-0.5">{rate}</div> : null}
    </div>
  );
}

export default async function MetaCampaignReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { tenantId } = await requireAdminPage();
  const now = new Date();
  const rawYear = Number(one(searchParams.year));
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : now.getFullYear();
  const rawMonth = Number(one(searchParams.month));
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : null;

  const report = await loadMetaCampaignReport(tenantId, { year, month });
  const rows = flatten(report.campaigns);
  const period = month ? `${MONTH_NAMES[month]} ${year}` : `Full year ${year}`;
  const spend = report.spend;
  const spendText = spend.mixedCurrency
    ? "mixed"
    : currencyText(spend.spendCents, spend.spendCurrency);

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Meta Lead Ads"
        title="Campaign outcomes"
        sub="Campaign → ad set → ad → form, from Meta spend and lead response through booked jobs and money collected."
      />

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <Field id="meta-report-month" label="Month">
            {(f) => (
              <select
                {...f}
                name="month"
                defaultValue={month ?? ""}
                className={`${f.className} mono uppercase tracking-[0.06em]`}
              >
                <option value="">Full year</option>
                {MONTH_NAMES.slice(1).map((name, index) => (
                  <option key={index + 1} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="meta-report-year" label="Year">
            {(f) => (
              <select {...f} name="year" defaultValue={year} className={`${f.className} mono`}>
                {[year - 2, year - 1, year, year + 1].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button type="submit" className={buttonClass("ghost")}>
            Apply
          </button>
        </form>

        <div className="flex items-center gap-2">
          {spend.configured ? (
            <SyncSpendButton year={year} month={month} />
          ) : (
            <Link href="/settings/meta-ads" className={buttonClass("ghost")}>
              Connect Meta spend →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 border-y border-line py-4 sm:grid-cols-3 lg:grid-cols-9">
        <div>
          <div className="eyebrow">Period</div>
          <div className="t-row mt-1 font-bold text-ink">{period}</div>
        </div>
        <div>
          <div className="eyebrow">Leads</div>
          <Num className="t-record mt-1 block font-black text-ink">{report.total.leads}</Num>
        </div>
        <div>
          <div className="eyebrow">Reached</div>
          <div className="t-record mt-1 font-black text-ink"><Num>{report.total.reached}</Num></div>
          <div className="eyebrow mt-1">{pct(report.total.reached, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Qualified</div>
          <div className="t-record mt-1 font-black text-ink"><Num>{report.total.qualified}</Num></div>
          <div className="eyebrow mt-1">{pct(report.total.qualified, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Jobs</div>
          <div className="t-record mt-1 font-black text-ink"><Num>{report.total.jobs}</Num></div>
          <div className="eyebrow mt-1">{pct(report.total.jobs, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Spend</div>
          <div className="t-row mt-1 font-bold text-ink">{spendText}</div>
        </div>
        <div>
          <div className="eyebrow">Collected</div>
          <Money cents={report.total.collectedCents} className="t-record mt-1 block font-black" />
        </div>
        <div>
          <div className="eyebrow">ROAS</div>
          <div className="t-record mt-1 font-black text-ink">
            {spend.roas === null ? "—" : `${spend.roas.toFixed(2)}×`}
          </div>
        </div>
        <div>
          <div className="eyebrow">Cost / job</div>
          <div className="t-row mt-1 font-bold text-ink">
            {spend.costPerJobCents === null ? "—" : currencyText(spend.costPerJobCents, "CAD")}
          </div>
        </div>
      </div>

      {!spend.configured ? (
        <div className="border-l-2 border-amber-ink pl-4">
          <p className="measure t-meta text-ink-2">
            Outcomes are live, but campaign spend is not connected. Add the ad account and a
            read-only token under <Link className="underline" href="/settings/meta-ads">Settings → Meta Ads reporting</Link>.
          </p>
        </div>
      ) : !report.spendAllocated ? (
        <div className="border-l-2 border-amber-ink pl-4">
          <p className="measure t-meta text-ink-2">
            Meta Ads is connected, but this period has not been synced yet (or Meta returned no ad/day rows).
            Use <strong>Sync spend</strong> above. The sync replaces only this reporting cache; it never books a second Finance expense.
          </p>
        </div>
      ) : spend.mixedCurrency || spend.spendCurrency !== "CAD" ? (
        <div className="border-l-2 border-amber-ink pl-4">
          <p className="measure t-meta text-ink-2">
            Meta spend is {spend.mixedCurrency ? "in multiple currencies" : `in ${spend.spendCurrency || "an unknown currency"}`}.
            Revenue in HandyCRM is CAD, so ROAS stays blank instead of comparing unlike currencies.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-emerald pl-4">
          <p className="measure t-meta text-ink-2">
            Spend is trusted Ads Insights data for ad account {spend.accountId}. Campaign/ad-set/ad ROAS is real CRM collected revenue divided by real CAD ad spend. Form spend remains blank because Meta does not report spend by lead form.
          </p>
          <span className="eyebrow whitespace-nowrap">
            Last sync {spend.lastSyncAt ? new Date(spend.lastSyncAt).toLocaleString("en-CA") : "—"}
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty hint="Sync Meta spend or receive a Lead Ad. Spend-only campaigns remain visible even when they produced zero CRM leads.">
          No Meta activity in this period
        </Empty>
      ) : (
        <div className="overflow-x-auto border-y border-line">
          <table className="w-full min-w-[1520px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="eyebrow px-2 py-3 font-normal">Campaign structure</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Leads</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Reached</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Qualified</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Rejected</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Jobs</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Spend</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">CPL</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Cost/job</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Collected</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">ROAS</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth, path }) => (
                <tr key={path} className={depth === 0 ? "border-y border-line bg-sunk" : "border-b border-line"}>
                  <td className="px-2 py-3 align-top">
                    <div className="flex min-w-[300px] items-start gap-2" style={{ paddingLeft: depth * 20 }}>
                      <span className="eyebrow mt-0.5 w-[58px] shrink-0">{LEVEL_LABEL[node.level]}</span>
                      <div className="min-w-0">
                        <div className={depth === 0 ? "t-row font-bold text-ink" : "t-body font-medium text-ink"}>{node.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {node.id ? <span className="mono t-micro text-ink-3">{node.id}</span> : null}
                          {node.platforms.map((platform) => <Chip key={platform}>{platform}</Chip>)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 align-top"><Count value={node.leads} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.reached} rate={pct(node.reached, node.leads)} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.qualified} rate={pct(node.qualified, node.leads)} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.rejected} rate={pct(node.rejected, node.leads)} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.jobs} rate={pct(node.jobs, node.leads)} /></td>
                  <td className="px-2 py-3 text-right align-top mono t-meta">{node.mixedCurrency ? "mixed" : currencyText(node.spendCents, node.spendCurrency)}</td>
                  <td className="px-2 py-3 text-right align-top mono t-meta">{currencyText(node.costPerLeadCents, "CAD")}</td>
                  <td className="px-2 py-3 text-right align-top mono t-meta">{currencyText(node.costPerJobCents, "CAD")}</td>
                  <td className="px-2 py-3 text-right align-top"><Money cents={node.collectedCents} tone={node.collectedCents > 0 ? "var(--emerald-ink)" : undefined} /></td>
                  <td className="px-2 py-3 text-right align-top mono t-meta font-bold">{node.roas === null ? "—" : `${node.roas.toFixed(2)}×`}</td>
                  <td className="px-2 py-3 text-right align-top"><Money cents={node.marginCents} tone={node.marginCents < 0 ? "var(--rose-ink)" : undefined} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
