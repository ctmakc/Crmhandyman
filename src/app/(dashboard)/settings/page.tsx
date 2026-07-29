import Link from "next/link";
import { Store, Users, Plug } from "lucide-react";

const settings = [
  {
    href: "/settings/profile",
    title: "Directory Profile",
    description: "Public services, locations, contact details and publishing",
    icon: Store,
    iconClass: "bg-orange-100 text-orange-700",
  },
  {
    href: "/settings/users",
    title: "Team Members",
    description: "Add workers, manage access",
    icon: Users,
    iconClass: "bg-blue-100 text-blue-600",
  },
  {
    href: "/settings/integrations",
    title: "Integrations",
    description: "Facebook, Instagram, Google, Email",
    icon: Plug,
    iconClass: "bg-purple-100 text-purple-600",
  },
];

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-4 pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage the internal CRM and the public marketplace profile from one tenant.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {settings.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className={`rounded-xl p-3 ${item.iconClass}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{item.title}</h2>
                <p className="mt-0.5 text-sm text-gray-500">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
