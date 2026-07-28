"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { SERVICE_CATALOG } from "@/lib/marketplace-config";

export default function NearbyContractorSearch({
  defaultPostalCode = "",
  defaultCity = "",
  defaultProvince = "",
  defaultService = "",
  defaultRadiusKm = 50,
}: {
  defaultPostalCode?: string;
  defaultCity?: string;
  defaultProvince?: string;
  defaultService?: string;
  defaultRadiusKm?: number;
}) {
  const router = useRouter();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    router.push(`/contractors/nearby?${params.toString()}`);
  }

  function useLocation() {
    setLocating(true);
    setError("");

    if (!navigator.geolocation) {
      setError("This browser does not support location access.");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          radiusKm: String(defaultRadiusKm),
        });
        if (defaultService) params.set("service", defaultService);
        router.push(`/contractors/nearby?${params.toString()}`);
        setLocating(false);
      },
      (reason) => {
        setError(
          reason.code === reason.PERMISSION_DENIED
            ? "Location permission was denied. Search by postal code or city instead."
            : "Unable to determine your location. Search by postal code or city instead."
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 10 * 60 * 1000,
      }
    );
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black">Search service coverage near you</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Use approximate browser location, Canadian postal/FSA coverage or city and province.
          </p>
        </div>
        <button
          type="button"
          onClick={useLocation}
          disabled={locating}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="mr-2 h-4 w-4" />
          )}
          Use my location
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <label>
          <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">
            Postal code
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-100">
            <MapPin className="h-4 w-4 text-slate-400" />
            <input
              name="postalCode"
              defaultValue={defaultPostalCode}
              maxLength={7}
              className="w-full bg-transparent py-3 text-sm uppercase outline-none"
              placeholder="K2K 1X7"
            />
          </div>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">
            City
          </span>
          <input name="city" defaultValue={defaultCity} className={inputClass} placeholder="Ottawa" />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">
            Province
          </span>
          <input
            name="province"
            defaultValue={defaultProvince}
            className={inputClass}
            placeholder="Ontario"
          />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">
            Service
          </span>
          <select name="service" defaultValue={defaultService} className={inputClass}>
            <option value="">All services</option>
            {SERVICE_CATALOG.map((service) => (
              <option key={service.slug} value={service.slug}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wider text-slate-500">
              Radius km
            </span>
            <input
              name="radiusKm"
              type="number"
              min="1"
              max="250"
              defaultValue={defaultRadiusKm}
              className={inputClass}
            />
          </label>
          <button
            className="mt-[22px] inline-flex h-[46px] items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-black text-white hover:bg-orange-600"
            aria-label="Search nearby contractors"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
