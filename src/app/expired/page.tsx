"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ExpiredContent() {
  const params = useSearchParams();
  const slug = params.get("slug");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-4">⏰</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Trial Expired</h1>
        <p className="text-gray-500 mb-6">
          Your 7-day free trial for <strong>{slug || "your account"}</strong> has ended.
          Upgrade to continue using HandymanPro CRM.
        </p>
        <a
          href="/register"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Start New Account
        </a>
        <p className="mt-4 text-sm text-gray-400">
          Contact support to upgrade your existing account.
        </p>
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
