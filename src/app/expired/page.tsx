"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ExpiredContent() {
  const params = useSearchParams();
  const slug = params.get("slug");

  return (
    <div className="flex min-h-screen items-center justify-center bg-deck p-6">
      <div
        className="plate w-full max-w-md px-8 py-8"
        style={{ borderLeft: "4px solid var(--rose)" }}
      >
        <div className="eyebrow">Trial ended</div>
        <h1 className="mt-2 text-[28px] font-black leading-none tracking-tight text-ink">
          The desk is closed
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
          The 7-day trial for <span className="mono text-ink">{slug || "your account"}</span> has
          run out. Your data is still here — upgrading reopens it.
        </p>
        <a
          href="/register"
          className="mt-6 inline-flex items-center justify-center rounded border border-navy-900 bg-navy-900 px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.05em] text-plate transition-colors duration-[140ms] ease-instrument hover:bg-navy-800"
        >
          Start a new account
        </a>
        <p className="eyebrow mt-5">Or contact support to upgrade this one</p>
      </div>
    </div>
  );
}

export default function ExpiredPage() {
  return (
    <Suspense>
      <ExpiredContent />
    </Suspense>
  );
}
