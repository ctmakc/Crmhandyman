"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, Save, Send } from "lucide-react";
import { SERVICE_CATALOG } from "@/lib/marketplace";

type ProfilePayload = {
  tenant: { businessName: string; slug: string } | null;
  profile: {
    slug: string;
    displayName: string;
    headline: string | null;
    description: string | null;
    phone: string | null;
    publicEmail: string | null;
    website: string | null;
    city: string;
    province: string;
    postalCode: string | null;
    serviceRadiusKm: number;
    yearsInBusiness: number | null;
    emergencyService: boolean;
    minimumJobValue: number | null;
    languages: string;
    profileStatus: string;
    services: Array<{ slug: string }>;
    serviceAreas: Array<{
      city: string;
      province: string;
      postalPrefix: string | null;
      radiusKm: number;
    }>;
  } | null;
};

export default function DirectoryProfileForm() {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [areas, setAreas] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings/profile")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load profile.");
        return response.json();
      })
      .then((payload: ProfilePayload) => {
        setData(payload);
        setServices(payload.profile?.services.map((service) => service.slug) ?? []);
        setAreas(
          payload.profile?.serviceAreas
            .map(
              (area) =>
                `${area.city} | ${area.province} | ${area.postalPrefix ?? ""} | ${area.radiusKm}`
            )
            .join("\n") ?? ""
        );
        setState("ready");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Unable to load profile.");
        setState("error");
      });
  }, []);

  const publicUrl = useMemo(
    () => (data?.profile?.slug ? `/pro/${data.profile.slug}` : null),
    [data]
  );

  function toggleService(slug: string) {
    setServices((current) =>
      current.includes(slug)
        ? current.filter((service) => service !== slug)
        : [...current, slug]
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const profileStatus = submitter?.value === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    const serviceAreas = areas
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [city, province, postalPrefix, radiusKm] = line
          .split("|")
          .map((part) => part.trim());
        return { city, province, postalPrefix, radiusKm };
      });

    const payload = {
      displayName: form.get("displayName"),
      slug: form.get("slug"),
      headline: form.get("headline"),
      description: form.get("description"),
      phone: form.get("phone"),
      publicEmail: form.get("publicEmail"),
      website: form.get("website"),
      city: form.get("city"),
      province: form.get("province"),
      postalCode: form.get("postalCode"),
      serviceRadiusKm: form.get("serviceRadiusKm"),
      yearsInBusiness: form.get("yearsInBusiness"),
      minimumJobValue: form.get("minimumJobValue"),
      languages: form.get("languages"),
      emergencyService: form.get("emergencyService") === "on",
      serviceSlugs: services,
      serviceAreas,
      profileStatus,
    };

    try {
      const response = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        const details = Array.isArray(result.details) ? result.details.join(" ") : result.error;
        throw new Error(details || "Unable to save profile.");
      }

      setData((current) =>
        current ? { ...current, profile: result.profile } : { tenant: null, profile: result.profile }
      );
      setMessage(profileStatus === "PUBLISHED" ? "Profile published." : "Draft saved.");
      setState("saved");
      window.setTimeout(() => setState("ready"), 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save profile.");
      setState("error");
    }
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading directory profile...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {message || "Profile settings are unavailable."}
      </div>
    );
  }

  const profile = data.profile;
  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

  return (
    <form onSubmit={submit} className="space-y-6 pb-24 md:pb-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Public identity</h2>
            <p className="mt-1 text-sm text-slate-500">
              This data appears on the public contractor page.
            </p>
          </div>
          {publicUrl && profile?.profileStatus === "PUBLISHED" && (
            <Link
              href={publicUrl}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
            >
              View profile <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Business name</span>
            <input
              name="displayName"
              required
              defaultValue={profile?.displayName ?? data.tenant?.businessName ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Public slug</span>
            <input
              name="slug"
              required
              defaultValue={profile?.slug ?? data.tenant?.slug ?? ""}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Headline</span>
            <input
              name="headline"
              maxLength={180}
              defaultValue={profile?.headline ?? ""}
              className={inputClass}
              placeholder="Reliable repairs and renovations across Ottawa West"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-bold">Description</span>
            <textarea
              name="description"
              rows={7}
              maxLength={5000}
              defaultValue={profile?.description ?? ""}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Services</h2>
        <p className="mt-1 text-sm text-slate-500">
          The first selected service becomes the primary category.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_CATALOG.map((service) => {
            const selected = services.includes(service.slug);
            return (
              <label
                key={service.slug}
                className={`cursor-pointer rounded-xl border p-4 ${
                  selected
                    ? "border-orange-400 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => toggleService(service.slug)}
                />
                <div className="font-extrabold">{service.name}</div>
                <div className="mt-1 text-xs text-slate-500">{service.category}</div>
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Primary location and coverage</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label>
            <span className="text-sm font-bold">City</span>
            <input name="city" required defaultValue={profile?.city ?? ""} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Province</span>
            <input
              name="province"
              required
              defaultValue={profile?.province ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Postal code</span>
            <input
              name="postalCode"
              defaultValue={profile?.postalCode ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Default radius, km</span>
            <input
              name="serviceRadiusKm"
              type="number"
              min="1"
              max="500"
              defaultValue={profile?.serviceRadiusKm ?? 30}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Years in business</span>
            <input
              name="yearsInBusiness"
              type="number"
              min="0"
              max="150"
              defaultValue={profile?.yearsInBusiness ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Minimum job value, CAD</span>
            <input
              name="minimumJobValue"
              type="number"
              min="0"
              step="50"
              defaultValue={profile?.minimumJobValue ?? ""}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-3">
            <span className="text-sm font-bold">Additional service areas</span>
            <textarea
              value={areas}
              onChange={(event) => setAreas(event.target.value)}
              rows={5}
              className={inputClass}
              placeholder={"Kanata | Ontario | K2K | 25\nNepean | Ontario | K2G | 20"}
            />
            <span className="mt-1 block text-xs text-slate-500">
              One area per line: City | Province | Postal prefix | Radius km
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Public contact and operating details</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-bold">Phone</span>
            <input name="phone" defaultValue={profile?.phone ?? ""} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Public email</span>
            <input
              name="publicEmail"
              type="email"
              defaultValue={profile?.publicEmail ?? ""}
              className={inputClass}
            />
          </label>
          <label>
            <span className="text-sm font-bold">Website</span>
            <input name="website" defaultValue={profile?.website ?? ""} className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-bold">Languages</span>
            <input
              name="languages"
              defaultValue={profile?.languages ?? "English"}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 sm:col-span-2">
            <input
              name="emergencyService"
              type="checkbox"
              defaultChecked={profile?.emergencyService ?? false}
              className="h-4 w-4"
            />
            <span className="text-sm font-bold">Accept emergency project requests</span>
          </label>
        </div>
      </section>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl p-4 text-sm font-semibold ${
            state === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {state !== "error" && <CheckCircle2 className="h-4 w-4" />}
          {message}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="submit"
          value="DRAFT"
          disabled={state === "saving"}
          className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-800"
        >
          <Save className="mr-2 h-4 w-4" />
          Save draft
        </button>
        <button
          type="submit"
          value="PUBLISHED"
          disabled={state === "saving"}
          className="inline-flex items-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {state === "saving" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Publish profile
        </button>
      </div>
    </form>
  );
}
