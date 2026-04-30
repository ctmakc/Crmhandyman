import Link from "next/link";
import { Users, Plug } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-xl space-y-4 pb-20 md:pb-0">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/settings/users"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Team Members</h2>
            <p className="text-sm text-gray-500 mt-0.5">Add workers, manage access</p>
          </div>
        </Link>
        <Link href="/settings/integrations"
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-xl">
            <Plug className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Integrations</h2>
            <p className="text-sm text-gray-500 mt-0.5">Facebook, Instagram, Google, Email</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
