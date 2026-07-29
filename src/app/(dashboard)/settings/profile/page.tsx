import DirectoryProfileForm from "@/components/settings/DirectoryProfileForm";

export default function DirectoryProfileSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
          Public marketplace
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Directory profile</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Control the public company page, services and geographic coverage from the same tenant
          account that owns the CRM data.
        </p>
      </div>
      <DirectoryProfileForm />
    </div>
  );
}
