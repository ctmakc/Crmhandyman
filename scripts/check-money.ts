import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { lineTotalCents, parseLineItems } from "../src/lib/money";

/**
 * DOES THE PAPER ADD UP?
 *
 * Two promises are printed on every estimate and every invoice this shop sends:
 *
 *   Σ round(qty × unitPrice) = subtotal
 *   subtotal + tax           = total
 *
 * The cents migration made both true for everything written since; it moved older rows
 * column by column without ever checking them against each other. One row in the demo
 * workspace failed: three amounts adding to $1,550.00 printed under a subtotal of
 * $1,750.00, on a document a prospective customer is shown. Nobody looks at a stored
 * subtotal — they look at the column and the number under it.
 *
 * Read-only. Run it before handing a workspace to a client, and after any import:
 *
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-money.ts
 *
 * Exits 1 when something does not add up, so it can gate a release.
 */

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" }),
});

type Doc = {
  id: string;
  lineItems: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

function faultsIn(kind: string, docs: Doc[]): string[] {
  const faults: string[] = [];
  for (const doc of docs) {
    const lines = parseLineItems(doc.lineItems);
    // A row whose JSON will not parse prints from its stored totals and is not a
    // mismatch — `parseLineItems` returns nothing and there is nothing to compare.
    if (lines.length) {
      const sum = lines.reduce((s, line) => s + lineTotalCents(line), 0);
      if (sum !== doc.subtotalCents) {
        faults.push(
          `${kind} ${doc.id}: lines add to ${sum} cents, subtotal says ${doc.subtotalCents}`
        );
      }
    }
    if (doc.subtotalCents + doc.taxCents !== doc.totalCents) {
      faults.push(
        `${kind} ${doc.id}: ${doc.subtotalCents} + ${doc.taxCents} ≠ ${doc.totalCents}`
      );
    }
  }
  return faults;
}

async function main() {
  const select = {
    id: true,
    lineItems: true,
    subtotalCents: true,
    taxCents: true,
    totalCents: true,
  } as const;

  const [estimates, invoices] = await Promise.all([
    prisma.estimate.findMany({ select }),
    prisma.invoice.findMany({ select }),
  ]);

  const faults = [
    ...faultsIn("Estimate", estimates),
    ...faultsIn("Invoice", invoices),
  ];

  console.log(`checked ${estimates.length} estimates and ${invoices.length} invoices`);
  if (!faults.length) {
    console.log("every document adds up to its own total");
    return;
  }

  for (const fault of faults) console.error(fault);
  console.error(`\n${faults.length} document(s) do not add up`);
  process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
