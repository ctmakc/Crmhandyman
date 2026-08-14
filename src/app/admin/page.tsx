"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Num, Stamp, TableWrap, railToneFor } from "@/components/ui/primitives";

/**
 * THE OPERATOR CONSOLE — every workspace on this box, one line each. It lives on the
 * navy chrome, so status words take the rail-weight twins (`railToneFor`): the deck
 * twins are darkened for light ground and land at 3:1 here, which on a laptop in
 * daylight is nothing at all.
 */

interface Tenant {
  id: string;
  slug: string;
  businessName: string;
  ownerEmail: string;
  plan: "DEMO" | "PAID";
  expiresAt: string | null;
  createdAt: string;
  _count: { users: number; leads: number; projects: number };
}

/* `.eyebrow` is declared after the utilities layer, so it wins the colour fight with
   a `text-*` class. On the navy chrome the label has to carry the rail tone, and an
   inline token is the one thing the cascade cannot take away. */
const th = "mono eyebrow whitespace-nowrap p-4 text-left";
const RAIL = { color: "var(--rail-ink)" } as const;
const cellBtn =
  "mono t-micro rounded border border-navy-700 px-3 py-1.5 uppercase tracking-[0.06em] transition-colors duration-fast ease-instrument";

export default function SuperAdminPage() {
  const { data: session } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(d)) {
          // «Failed to load» told nobody anything: the usual reason is a workspace
          // login on a console that only an operator account opens.
          setError(
            r.status === 401 || r.status === 403
              ? "This console opens for the operator account only. The login you are on belongs to a workspace."
              : "The roster did not load. Reload the page; if it stays empty the desk is down."
          );
          setTenants([]);
        } else {
          setTenants(d);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("No answer from the office — reload the page in a minute.");
        setLoading(false);
      });
  }, []);

  async function upgrade(id: string) {
    await fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, plan: "PAID", expiresAt: null }),
    });
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, plan: "PAID", expiresAt: null } : t))
    );
  }

  async function deleteTenant(id: string, name: string) {
    if (!confirm(`Delete tenant "${name}" and ALL their data? This cannot be undone.`)) return;
    await fetch(`/api/admin/tenants?id=${id}`, { method: "DELETE" });
    setTenants((prev) => prev.filter((t) => t.id !== id));
  }

  const email = (session?.user as { email?: string })?.email || "";
  const paid = tenants.filter((t) => t.plan === "PAID").length;

  return (
    <div className="min-h-screen bg-navy-900 p-6 text-plate">
      <div className="mx-auto max-w-6xl">
        <div className="mono eyebrow" style={RAIL}>
          Operator console
        </div>
        <h1 className="t-page mt-2 font-black leading-none tracking-tight">Tenants</h1>
        <p className="mono t-meta mb-7 mt-2 text-ink-rail">{email}</p>

        {loading && (
          <p className="mono t-meta text-ink-rail" role="status">
            Reading the roster…
          </p>
        )}

        {error && (
          <p
            className="t-body border-l-2 py-2 pl-3"
            role="alert"
            style={{ borderColor: "var(--rose)", color: "var(--rose-rail)" }}
          >
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            <div className="border border-navy-700 bg-navy-800">
              {/* Six columns of workspace admin never fit a phone; the table takes its
                  own scroll instead of dragging the page with it. */}
              <TableWrap>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-navy-700">
                      <th scope="col" className={th} style={RAIL}>
                        Tenant
                      </th>
                      <th scope="col" className={th} style={RAIL}>
                        Owner
                      </th>
                      <th scope="col" className={th} style={RAIL}>
                        Plan
                      </th>
                      <th scope="col" className={th} style={RAIL}>
                        Data
                      </th>
                      <th scope="col" className={th} style={RAIL}>
                        Created
                      </th>
                      <th scope="col" className={`${th} text-right`} style={RAIL}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => {
                      const expired =
                        t.plan === "DEMO" && t.expiresAt && new Date(t.expiresAt) < new Date();
                      const daysLeft = t.expiresAt
                        ? Math.max(
                            0,
                            Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / 86400000)
                          )
                        : null;
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-navy-700 transition-colors duration-fast ease-instrument hover:bg-navy-700/40"
                        >
                          <td className="p-4">
                            <div className="t-body font-bold">{t.businessName}</div>
                            <div className="mono t-micro text-ink-rail">{t.slug}</div>
                          </td>
                          <td className="mono t-meta p-4 text-ink-rail">{t.ownerEmail}</td>
                          <td className="p-4">
                            <span
                              className="mono eyebrow"
                              style={{
                                color:
                                  t.plan === "PAID"
                                    ? railToneFor("PAID")
                                    : expired
                                      ? railToneFor("OVERDUE")
                                      : "var(--amber)",
                              }}
                            >
                              {t.plan === "PAID" ? "Paid" : expired ? "Expired" : "Demo"}
                            </span>
                            {t.plan === "DEMO" && !expired && daysLeft !== null && (
                              <span className="mono t-micro ml-2 text-ink-rail">
                                <Num>{daysLeft}</Num>d left
                              </span>
                            )}
                          </td>
                          <td className="mono t-micro p-4 text-ink-rail">
                            <Num>{t._count.users}</Num>u · <Num>{t._count.leads}</Num>l ·{" "}
                            <Num>{t._count.projects}</Num>p
                          </td>
                          <td className="p-4 text-ink-rail">
                            <Stamp date={t.createdAt} className="t-micro" />
                          </td>
                          <td className="space-x-2 p-4 text-right">
                            {t.plan === "DEMO" && (
                              <button
                                onClick={() => upgrade(t.id)}
                                className={`${cellBtn} hover:border-plate`}
                              >
                                Upgrade
                              </button>
                            )}
                            <button
                              onClick={() => deleteTenant(t.id, t.businessName)}
                              className={`${cellBtn} hover:border-rose`}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6">
                          <p className="mono eyebrow" style={RAIL}>
                            No workspaces on this box
                          </p>
                          <p className="t-body mt-2 text-ink-rail">
                            Every trial that signs up through the register page appears here on
                            its first sign-in.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div className="mono eyebrow mt-4" style={RAIL}>
              <Num>{tenants.length}</Num> tenants · <Num>{paid}</Num> paid ·{" "}
              <Num>{tenants.length - paid}</Num> demo
            </div>
          </>
        )}
      </div>
    </div>
  );
}
