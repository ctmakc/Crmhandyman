import { describe, it, expect } from "vitest";
import { renderDocument, type DocumentSpec } from "@/lib/document";
import { toCents } from "@/lib/money";

/**
 * The printed estimate and invoice. This HTML is what actually leaves the shop —
 * mailed, printed, argued over — and it is assembled by string concatenation, so both
 * risks are real: a wrong amount due on the remittance stub, and an unescaped client
 * name breaking (or injecting into) the page.
 */

const doc = (over: Partial<DocumentSpec> = {}): DocumentSpec => ({
  kind: "INVOICE",
  number: "INV-2026-0007",
  status: "SENT",
  businessName: "Korvex Developments",
  clientName: "Jane Doe",
  jobTitle: "Basement reno",
  lineItems: [
    { description: "Installation labour", qty: 8, unit: "hr", unitPriceCents: toCents(115) },
  ],
  subtotalCents: toCents(920),
  taxCents: toCents(119.6),
  totalCents: toCents(1039.6),
  issuedAt: new Date(2026, 7, 1),
  dueDate: new Date(2099, 0, 1),
  ...over,
});

describe("renderDocument — money on paper", () => {
  it("prints the totals it was handed, to the cent", () => {
    const html = renderDocument(doc());
    expect(html).toContain("$920.00");
    expect(html).toContain("$119.60");
    expect(html).toContain("$1,039.60");
  });

  it("shows the remaining balance on the stub after a deposit", () => {
    const html = renderDocument(doc({ amountPaidCents: toCents(500) }));
    expect(html).toContain("OWING");
    expect(html).toContain("−$500.00");
    expect(html).toContain("$539.60");
  });

  it("never prints a negative amount due when a client overpays", () => {
    const html = renderDocument(doc({ amountPaidCents: toCents(1100) }));
    expect(html).toContain("$0.00");
    expect(html).not.toContain("-$60.40");
  });

  it("leaves the paid block off an invoice with nothing paid", () => {
    expect(renderDocument(doc({ amountPaidCents: 0 }))).not.toContain("OWING");
  });

  it("renders a credit line at a negative rate", () => {
    const html = renderDocument(
      doc({
        lineItems: [
          {
            description: "Less deposit invoice INV-2026-0006",
            qty: 1,
            unit: "ea",
            unitPriceCents: toCents(-1300),
          },
        ],
      })
    );
    expect(html).toContain("-$1,300.00");
  });

  it("stamps an invoice past its due date as overdue", () => {
    expect(renderDocument(doc({ dueDate: new Date(2020, 0, 1) }))).toContain("OVERDUE");
  });

  it("never stamps a settled invoice or an estimate as overdue", () => {
    const settled = doc({ dueDate: new Date(2020, 0, 1), amountPaidCents: toCents(1039.6) });
    expect(renderDocument(settled)).not.toContain("OVERDUE");
    const estimate = doc({ kind: "ESTIMATE", dueDate: new Date(2020, 0, 1), validUntil: new Date(2020, 1, 1) });
    expect(renderDocument(estimate)).not.toContain("OVERDUE");
  });

  it("puts a remittance stub on invoices only", () => {
    expect(renderDocument(doc())).toContain("Remittance stub");
    expect(renderDocument(doc({ kind: "ESTIMATE" }))).not.toContain("Remittance stub");
  });

  it("auto-prints only when asked", () => {
    // The manual print button always exists; only the load listener is conditional.
    expect(renderDocument(doc())).not.toContain("addEventListener('load'");
    expect(renderDocument(doc({ autoPrint: true }))).toContain("addEventListener('load'");
  });
});

describe("renderDocument — escaping", () => {
  it("escapes a client name that carries markup", () => {
    const html = renderDocument(doc({ clientName: '<script>alert("x")</script>' }));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes ampersands in a business name so the document stays valid", () => {
    expect(renderDocument(doc({ businessName: "Beaver Movers & Sons" }))).toContain(
      "Beaver Movers &amp; Sons"
    );
  });

  it("escapes line descriptions and notes, the free-text a client can influence", () => {
    const html = renderDocument(
      doc({
        lineItems: [
          { description: '12" duct <run>', qty: 1, unit: "ea", unitPriceCents: toCents(100) },
        ],
        notes: 'Access via <side gate> & "back lane"',
      })
    );
    expect(html).toContain("&lt;run&gt;");
    expect(html).toContain("&quot;back lane&quot;");
    expect(html).not.toContain("<run>");
  });
});

/**
 * The supplier block. CRA requires the GST/HST number on an invoice over $30; without
 * it a business customer loses the input tax credit and sends the paper back, so this
 * is the one omission that stops a Canadian shop from billing at all.
 */
describe("renderDocument — who is billing", () => {
  const business = {
    address: "120 Bank St, Ottawa, ON K1P 5N2",
    phone: "613-555-0100",
    email: "office@korvex.ca",
    hstNumber: "123456789RT0001",
    paymentInstructions: "Interac e-Transfer to pay@korvex.ca",
  };

  it("prints the contractor's registration, address and contacts", () => {
    const html = renderDocument(doc({ business }));
    expect(html).toContain("GST/HST 123456789RT0001");
    expect(html).toContain("120 Bank St, Ottawa, ON K1P 5N2");
    expect(html).toContain("613-555-0100");
    expect(html).toContain("office@korvex.ca");
  });

  it("puts how-to-pay on the stub the customer tears off", () => {
    const html = renderDocument(doc({ business }));
    expect(html).toContain("Interac e-Transfer to pay@korvex.ca");
    // An estimate has no stub, so it carries no payment instructions.
    expect(renderDocument(doc({ kind: "ESTIMATE", business }))).not.toContain(
      "Interac e-Transfer"
    );
  });

  it("prints nothing at all for a shop that has filled nothing in", () => {
    const html = renderDocument(doc());
    expect(html).not.toContain("GST/HST");
    expect(html).toContain("Korvex Developments");
  });

  it("escapes the supplier block like every other field", () => {
    const html = renderDocument(doc({ business: { ...business, address: "<script>alert(1)</script>" } }));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
