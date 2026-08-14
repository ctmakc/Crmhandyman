"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import {
  buttonClass,
  controlClass,
  Empty,
  ErrorNote,
  LaneHead,
  Num,
  Stamp,
  inertLook,
} from "@/components/ui/primitives";
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
 *
 * Order matters here. The caption box used to stand in front of the camera, so a man
 * in a basement with one free hand was asked to type before he was allowed to shoot
 * (FIELD-TEST Б8). The camera comes first now; the caption is an optional note that
 * rides along with the next shot.
 */
const KINDS: Array<{ key: string; label: string; lead: boolean }> = [
  { key: "BEFORE", label: "Before", lead: true },
  { key: "AFTER", label: "After", lead: true },
  { key: "DAMAGE", label: "Damage", lead: false },
  { key: "DOC", label: "Paperwork", lead: false },
];

export default function JobPhotos({ projectId }: { projectId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);

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
    setLastAttempt(KINDS.find((k) => k.key === kind)?.label ?? kind);
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
          failed = data?.error || "The shot did not reach the office — try it again when you have a bar of signal";
          break;
        }
      } catch {
        failed = "The shot did not go up — the phone lost signal partway.";
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
      toast("The photo is still there — the office did not answer", "bad");
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    toast("Photo deleted");
  }

  const busy = progress !== null;
  const pct = progress ? (progress.done / progress.total) * 100 : 0;

  /** One capture target. The two leads run full width; the other two share a line. */
  function Capture({ k }: { k: (typeof KINDS)[number] }) {
    return (
      <label
        className={`${buttonClass(k.lead ? "ghost" : "quiet")} ${
          busy ? inertLook : "cursor-pointer"
        } ${k.lead ? "text-ink" : ""}`}
      >
        <Camera className={k.lead ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
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
    );
  }

  return (
    <section>
      <LaneHead
        title="Before / after"
        right={
          photos.length > 0 ? (
            <span className="eyebrow">
              <Num>{photos.length}</Num> SHOT{photos.length === 1 ? "" : "S"}
            </span>
          ) : undefined
        }
      />

      <div className="border-t border-line pt-4">
        {/* One tap opens the camera. BEFORE and AFTER are what the section is named
            after, so they take the full line; the other two share the one below.
            The block stops at 512px — stretched across a 980px record these read as
            two banners, and nobody shoots a basement from the dispatch desk. */}
        <div className="max-w-lg">
          <div className="grid grid-cols-2 gap-2">
            {KINDS.filter((k) => k.lead).map((k) => (
              <Capture key={k.key} k={k} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {KINDS.filter((k) => !k.lead).map((k) => (
              <Capture key={k.key} k={k} />
            ))}
          </div>
        </div>

        {/* The upload reports next to the button that started it, not in the header
            of the section, and it says which of how many is going up. */}
        {progress && (
          <div className="mt-3 max-w-lg" role="status">
            <div className="h-1 bg-sunk">
              <div
                className="h-full transition-[width] duration-instrument ease-instrument"
                style={{ width: `${pct}%`, background: "var(--amber)" }}
              />
            </div>
            <p className="eyebrow mt-1.5" style={{ color: "var(--amber-ink)" }}>
              SENDING <Num>{Math.min(progress.done + 1, progress.total)}</Num> OF{" "}
              <Num>{progress.total}</Num> — KEEP THE PHONE AWAKE
            </p>
          </div>
        )}

        {error && (
          <ErrorNote className="mt-3">
            {error} Nothing was lost — the {lastAttempt?.toLowerCase() ?? "next"} shot is
            still on the phone, so try it again when the bars come back.
          </ErrorNote>
        )}

        <div className="mt-4 max-w-sm">
          <label className="eyebrow block" htmlFor="photo-caption">
            Caption for the next shot
          </label>
          <input
            id="photo-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={160}
            placeholder="Kitchen, north wall"
            className={controlClass("mt-1.5")}
          />
        </div>

        {photos.length === 0 && !busy ? (
          <Empty
            className="mt-5"
            hint="Two shots from the same spot, one before the tools come out and one after the clean-up, settle any argument six months from now."
          >
            No photos on this job yet
          </Empty>
        ) : (
          KINDS.filter((k) => photos.some((p) => p.kind === k.key)).map((k) => (
            <div key={k.key} className="mt-5">
              <div className="eyebrow border-b border-line pb-2">{k.label}</div>
              {/* One shot to a line on a phone: at two columns the proof of a job was a
                  171px thumbnail. Two on a tablet, three on the desk. */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
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
                            <p className="t-body line-clamp-2 leading-tight text-ink">
                              {p.caption}
                            </p>
                          )}
                          {/* Wraps rather than truncates: on a 390px phone the shooter's
                              name is the half that gets cut, and that is the half that
                              makes the photo evidence. */}
                          {/* The one date form in the product, and not in the eyebrow's
                              uppercase: «AUG 13, 2026, 07:33 P.M.» took three lines of a
                              caption box that is 171px wide. */}
                          <p className="mono t-micro mt-1 break-words leading-tight text-ink-3">
                            <Stamp date={p.createdAt} withTime />
                            {p.uploadedBy ? ` · ${p.uploadedBy}` : ""}
                          </p>
                        </div>
                        {p.canDelete && (
                          <button
                            onClick={() => remove(p)}
                            aria-label={`Delete the ${k.label.toLowerCase()} photo`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-3 transition-colors duration-fast ease-instrument hover:text-rose"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
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
