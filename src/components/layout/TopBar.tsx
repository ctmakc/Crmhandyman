"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

interface TopBarProps {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

export default function TopBar({ user }: TopBarProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
      <div className="md:hidden text-lg font-bold text-gray-900">🔧 HandymanPro</div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{user?.name || user?.email}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
