import { requireAdminPage } from "@/lib/page-guard";
import { MONTH_NAMES } from "@/lib/contracts";
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

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

type FlatRow = { node: MetaBreakdownNode; depth: number; path: string };

function flatten(
  nodes: MetaBreakdownNode[],
  depth = 0,
  parentPath = ""
): FlatRow[] {
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

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Meta Lead Ads"
        title="Campaign outcomes"
        sub="Which campaign, ad set, ad and form produced leads that were reached, qualified, booked and paid. This report follows the lead cohort through collected money."
      />

      <form method="GET" className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
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

      <div className="grid gap-4 border-y border-line py-4 sm:grid-cols-3 lg:grid-cols-7">
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
          <div className="t-record mt-1 font-black text-ink">
            <Num>{report.total.reached}</Num>
          </div>
          <div className="eyebrow mt-1">{pct(report.total.reached, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Qualified</div>
          <div className="t-record mt-1 font-black text-ink">
            <Num>{report.total.qualified}</Num>
          </div>
          <div className="eyebrow mt-1">{pct(report.total.qualified, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Rejected</div>
          <div className="t-record mt-1 font-black text-ink">
            <Num>{report.total.rejected}</Num>
          </div>
          <div className="eyebrow mt-1">{pct(report.total.rejected, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Jobs</div>
          <div className="t-record mt-1 font-black text-ink">
            <Num>{report.total.jobs}</Num>
          </div>
          <div className="eyebrow mt-1">{pct(report.total.jobs, report.total.leads)}</div>
        </div>
        <div>
          <div className="eyebrow">Collected</div>
          <Money cents={report.total.collectedCents} className="t-record mt-1 block font-black" />
        </div>
      </div>

      <div className="border-l-2 border-amber-ink pl-4">
        <p className="measure t-meta text-ink-2">
          Campaign ROAS is intentionally not shown yet. HandyCRM knows the total Meta channel
          spend, but it does not invent a campaign split. Campaign spend belongs here only
          after Ads Insights or another trusted campaign-level spend source is connected.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty hint="When a Facebook Lead Ad lands with campaign metadata, its hierarchy and downstream job money will appear here. Leads whose Meta attribution is unavailable remain visible under Campaign unavailable.">
          No Meta Lead Ads in this period
        </Empty>
      ) : (
        <div className="overflow-x-auto border-y border-line">
          <table className="w-full min-w-[1120px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="eyebrow px-2 py-3 font-normal">Campaign structure</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Leads</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Reached</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Qualified</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Rejected</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Jobs</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Quoted</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Invoiced</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Collected</th>
                <th className="eyebrow px-2 py-3 text-right font-normal">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth, path }) => (
                <tr
                  key={path}
                  className={depth === 0 ? "border-y border-line bg-sunk" : "border-b border-line"}
                >
                  <td className="px-2 py-3 align-top">
                    <div className="flex min-w-[300px] items-start gap-2" style={{ paddingLeft: depth * 20 }}>
                      <span className="eyebrow mt-0.5 w-[58px] shrink-0">{LEVEL_LABEL[node.level]}</span>
                      <div className="min-w-0">
                        <div className={depth === 0 ? "t-row font-bold text-ink" : "t-body font-medium text-ink"}>
                          {node.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {node.id ? <span className="mono t-micro text-ink-3">{node.id}</span> : null}
                          {node.platforms.map((platform) => (
                            <Chip key={platform}>{platform}</Chip>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 align-top"><Count value={node.leads} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.reached} rate={pct(node.reached, node.leads)} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.qualified} rate={pct(node.qualified, node.leads)} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.rejected} rate={pct(node.rejected, node.leads)} /></td>
                  <td className="px-2 py-3 align-top"><Count value={node.jobs} rate={pct(node.jobs, node.leads)} /></td>
                  <td className="px-2 py-3 text-right align-top"><Money cents={node.quotedCents} /></td>
                  <td className="px-2 py-3 text-right align-top"><Money cents={node.invoicedCents} /></td>
                  <td className="px-2 py-3 text-right align-top"><Money cents={node.collectedCents} tone={node.collectedCents > 0 ? "var(--emerald-ink)" : undefined} /></td>
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
