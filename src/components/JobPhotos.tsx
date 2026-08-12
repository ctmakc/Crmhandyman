"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { buttonClass, Empty, LaneHead } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface Photo {
  id: string;
  kind: string;
  caption: string | null;
  mime: string;
  sizeBytes: number;
  uploadedBy: string | null;
  canDelete: boolean;
  createdAt: string;
}

/**
 * «До / После» — the proof the work happened. On a renovation this is what settles the
 * argument six months later, so the crew has to be able to shoot it one-handed: the
 * capture buttons open the phone camera directly and are sized for a glove.
 */
const KINDS: Array<{ key: string; label: string; lead: boolean }> = [
  { key: "BEFORE", label: "Before", lead: true },
  { key: "AFTER", label: "After", lead: true },
  { key: "DAMAGE", label: "Damage", lead: false },
  { key: "DOC", label: "Paperwork", lead: false },
];

/** Stamp in the call-log dialect: 12 AUG 09:14. */
function stamp(iso: string) {
  const d = new Date(iso);
  return `${d
    .toLocaleDateString("en-CA", { day: "2-digit", month: "short" })
    .toUpperCase()} ${d.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

export default function JobPhotos({ projectId }: { projectId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/photos`);
      if (!res.ok) return;
      const data = await res.json();
      setPhotos(Array.isArray(data) ? data : []);
    } catch {
      // The section stays empty; the job card itself is still usable.
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(kind: string, files: FileList) {
    const list = Array.from(files);
    setError(null);
    setProgress({ done: 0, total: list.length });

    let failed: string | null = null;
    for (let i = 0; i < list.length; i++) {
      const body = new FormData();
      body.append("file", list[i]);
      body.append("kind", kind);
      if (caption) body.append("caption", caption);

      try {
        const res = await fetch(`/api/projects/${projectId}/photos`, { method: "POST", body });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          failed = data?.error || `Upload failed (${res.status})`;
          break;
        }
      } catch {
        failed = "Upload failed — check the signal and try again";
        break;
      }
      setProgress({ done: i + 1, total: list.length });
    }

    setProgress(null);
    setCaption("");
    await load();

    if (failed) {
      setError(failed);
      toast(failed, "bad");
    } else {
      toast(list.length === 1 ? "Photo added" : `${list.length} photos added`);
    }
  }

  async function remove(photo: Photo) {
    if (!confirm("Delete this photo? It is the proof this job was done.")) return;
    const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast(data?.error || "Could not delete the photo", "bad");
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    toast("Photo deleted");
  }

  const busy = progress !== null;

  return (
    <section>
      <LaneHead
        title="Before / after"
        right={
          progress ? (
            <span className="eyebrow" style={{ color: "var(--amber-ink)" }}>
              Uploading {Math.min(progress.done + 1, progress.total)}/{progress.total}
            </span>
          ) : photos.length > 0 ? (
            <span className="eyebrow">
              {photos.length} shot{photos.length === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      />

      <div className="border-t border-line pt-4">
        <label className="block max-w-sm">
          <span className="eyebrow">Caption for the next shot</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={160}
            placeholder="Kitchen, north wall"
            className="mt-1.5 w-full px-3 py-2 text-[13px]"
          />
        </label>

        {/* One tap opens the camera. Targets are 48px tall — same law as /today.
            All four stay ghost: the plate above owns the job's primary action, and a
            second row of filled slabs would out-shout it. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => (
            <label
              key={k.key}
              className={`${buttonClass("ghost")} h-12 ${k.lead ? "text-ink" : ""} ${
                busy ? "pointer-events-none opacity-50" : "cursor-pointer"
              }`}
            >
              <Camera className="h-4 w-4" />
              {k.label}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                capture="environment"
                multiple
                disabled={busy}
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length) upload(k.key, files);
                  // Clear it, or shooting the same file twice fires no change event.
                  e.target.value = "";
                }}
              />
            </label>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-[13px]" style={{ color: "var(--rose-ink)" }}>
            {error}
          </p>
        )}

        {photos.length === 0 && !busy ? (
          <Empty>No photos on this job yet</Empty>
        ) : (
          KINDS.filter((k) => photos.some((p) => p.kind === k.key)).map((k) => (
            <div key={k.key} className="mt-5">
              <div className="eyebrow border-b border-line pb-2">{k.label}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos
                  .filter((p) => p.kind === k.key)
                  .map((p) => (
                    <figure key={p.id} className="plate overflow-hidden">
                      <a href={`/api/photos/${p.id}`} target="_blank" rel="noopener">
                        {/* Plain <img>: the Next optimiser fetches without the session
                            cookie, and these files are behind one. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/photos/${p.id}`}
                          alt={p.caption || `${k.label} photo`}
                          loading="lazy"
                          className="block aspect-[4/3] w-full bg-sunk object-cover"
                        />
                      </a>
                      <figcaption className="flex items-center gap-1 border-t border-line pl-3">
                        <div className="min-w-0 flex-1 py-2">
                          {p.caption && (
                            <p className="line-clamp-2 text-[13px] leading-tight text-ink">
                              {p.caption}
                            </p>
                          )}
                          {/* Wraps rather than truncates: on a 390px phone the shooter's
                              name is the half that gets cut, and that is the half that
                              makes the photo evidence. */}
                          <p className="mono mt-0.5 break-words text-[11px] leading-tight text-ink-3">
                            {stamp(p.createdAt)}
                            {p.uploadedBy ? ` · ${p.uploadedBy}` : ""}
                          </p>
                        </div>
                        {p.canDelete && (
                          <button
                            onClick={() => remove(p)}
                            aria-label="Delete photo"
                            className="flex h-12 w-12 shrink-0 items-center justify-center text-ink-3 transition-colors duration-[140ms] ease-instrument hover:text-rose"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </figcaption>
                    </figure>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
