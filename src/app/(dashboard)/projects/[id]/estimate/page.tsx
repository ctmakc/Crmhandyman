"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Download, Send } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

interface Estimate {
  id: string;
  status: string;
  lineItems: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
  clientName: string;
  email?: string;
}

export default function EstimatePage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [creating, setCreating] = useState(false);
  const [taxRate, setTaxRate] = useState(0.13);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", qty: 1, unit: "hr", unitPrice: 0 }
  ]);

  async function fetchData() {
    const [projRes, estRes] = await Promise.all([
      fetch(`/api/projects/${params.id}`),
      fetch(`/api/projects/${params.id}/estimate`),
    ]);
    setProject(await projRes.json());
    setEstimates(await estRes.json());
  }

  useEffect(() => { fetchData(); }, []);

  const subtotal = lineItems.reduce((s, item) => s + item.qty * item.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  }

  function addLineItem() {
    setLineItems([...lineItems, { description: "", qty: 1, unit: "hr", unitPrice: 0 }]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/projects/${params.id}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineItems, taxRate, notes }),
    });
    setSaving(false);
    setCreating(false);
    setLineItems([{ description: "", qty: 1, unit: "hr", unitPrice: 0 }]);
    setNotes("");
    fetchData();
  }

  async function handleUpdateStatus(estimateId: string, status: string) {
    await fetch(`/api/projects/${params.id}/estimate`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: estimateId, status }),
    });
    fetchData();
  }

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SENT: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${params.id}`} className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Estimates</h1>
          <p className="text-sm text-gray-500">{project?.clientName}</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Estimate
          </button>
        )}
      </div>

      {/* New Estimate Form */}
      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          <h2 className="font-semibold text-gray-900">New Estimate</h2>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-5">Description</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-2">Unit</div>
              <div className="col-span-2">Price</div>
              <div className="col-span-1"></div>
            </div>
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-5 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Description"
                  value={item.description}
                  onChange={e => updateLineItem(index, "description", e.target.value)}
                />
                <input
                  className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  type="number" min="0" step="0.5"
                  value={item.qty}
                  onChange={e => updateLineItem(index, "qty", Number(e.target.value))}
                />
                <input
                  className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="hr"
                  value={item.unit}
                  onChange={e => updateLineItem(index, "unit", e.target.value)}
                />
                <input
                  className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  value={item.unitPrice || ""}
                  onChange={e => updateLineItem(index, "unitPrice", Number(e.target.value))}
                />
                <button onClick={() => removeLineItem(index)}
                  className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button onClick={addLineItem}
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-1">
              <Plus className="h-4 w-4" /> Add line
            </button>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-gray-500">
                Tax
                <select value={taxRate} onChange={e => setTaxRate(Number(e.target.value))}
                  className="border border-gray-200 rounded px-1 py-0.5 text-xs">
                  <option value={0}>0%</option>
                  <option value={0.05}>5% GST</option>
                  <option value={0.13}>13% HST (ON)</option>
                  <option value={0.15}>15% HST (NS/NB/NL/PE)</option>
                </select>
              </label>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-gray-100 pt-1">
              <span>Total</span>
              <span className="text-blue-600">{formatCurrency(total)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Payment terms, warranty, etc."
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || lineItems.every(i => !i.description)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save Estimate"}
            </button>
            <button onClick={() => setCreating(false)}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Estimates */}
      <div className="space-y-3">
        {estimates.length === 0 && !creating && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
            No estimates yet. Create one above.
          </div>
        )}
        {estimates.map((estimate, i) => {
          const items = JSON.parse(estimate.lineItems) as LineItem[];
          return (
            <div key={estimate.id} className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div>
                  <p className="font-semibold text-gray-900">Estimate #{estimates.length - i}</p>
                  <p className="text-xs text-gray-500">{new Date(estimate.createdAt).toLocaleDateString("en-CA")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[estimate.status]}`}>
                    {estimate.status}
                  </span>
                  <a href={`/api/projects/${params.id}/estimate/pdf?estimateId=${estimate.id}`}
                    target="_blank"
                    className="text-gray-400 hover:text-gray-700">
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <div className="p-4 space-y-1">
                {items.map((item, j) => (
                  <div key={j} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.description} ({item.qty} {item.unit})</span>
                    <span className="text-gray-900">{formatCurrency(item.qty * item.unitPrice)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-2 mt-2 space-y-0.5 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span><span>{formatCurrency(estimate.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tax</span><span>{formatCurrency(estimate.tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total</span><span className="text-blue-600">{formatCurrency(estimate.total)}</span>
                  </div>
                </div>
                {estimate.status === "DRAFT" && (
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleUpdateStatus(estimate.id, "SENT")}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                      <Send className="h-3 w-3" /> Mark Sent
                    </button>
                  </div>
                )}
                {estimate.status === "SENT" && (
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleUpdateStatus(estimate.id, "ACCEPTED")}
                      className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                      Accepted
                    </button>
                    <button onClick={() => handleUpdateStatus(estimate.id, "REJECTED")}
                      className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                      Rejected
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
