"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { buttonClass, Empty, LaneHead } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface EvidenceItem {
  id: string;
  kind: "BEFORE" | "AFTER" | "OTHER";
  originalName: string;
  byteSize: number;
  caption: string | null;
  capturedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  contentUrl: string;
}

export default function JobEvidence({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [kind, setKind] = useState<"BEFORE" | "AFTER" | "OTHER">("BEFORE");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/evidence`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setItems(Array.isArray(data) ? data : []);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    form.set("caption", caption);
    form.set("capturedAt", new Date().toISOString());

    setUploading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/evidence`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      toast(`${kind.toLowerCase()} photo saved`);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(item: EvidenceItem) {
    const response = await fetch(`/api/projects/${projectId}/evidence/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast("Could not remove photo");
      return;
    }
    toast("Photo removed");
    await load();
  }

  const grouped = {
    BEFORE: items.filter((item) => item.kind === "BEFORE"),
    AFTER: items.filter((item) => item.kind === "AFTER"),
    OTHER: items.filter((item) => item.kind === "OTHER"),
  };

  return (
    <section>
      <LaneHead title="Job evidence" />
      <div className="border-t border-line pt-4">
        <div className="grid gap-3 md:grid-cols-[150px_1fr_auto] md:items-end">
          <label>
            <span className="eyebrow">Photo type</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className="mono mt-1.5 w-full px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
            >
              <option value="BEFORE">Before</option>
              <option value="AFTER">After</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            <span className="eyebrow">Note</span>
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Panel condition, damaged trim, completed repair…"
              maxLength={500}
              className="mt-1.5 w-full px-3 py-2 text-[13px]"
            />
          </label>
          <label className={`${buttonClass("primary")} min-h-11 cursor-pointer justify-center`}>
            <Camera className="h-4 w-4" />
            {uploading ? "Uploading…" : "Take / add photo"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              disabled={uploading}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </div>

        {items.length === 0 ? (
          <Empty>
            <ImagePlus className="mr-2 inline h-4 w-4" />
            No evidence yet — take a before photo before touching the job.
          </Empty>
        ) : (
          <div className="mt-5 space-y-6">
            {(["BEFORE", "AFTER", "OTHER"] as const).map((section) =>
              grouped[section].length ? (
                <div key={section}>
                  <div className="eyebrow mb-2">{section} · {grouped[section].length}</div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {grouped[section].map((item) => (
                      <figure key={item.id} className="relative overflow-hidden border border-line bg-plate">
                        {/* Authenticated API URL: intentionally not next/image/public CDN. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.contentUrl}
                          alt={item.caption || `${section.toLowerCase()} job evidence`}
                          className="aspect-[4/3] w-full object-cover"
                          loading="lazy"
                        />
                        <figcaption className="border-t border-line p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {item.caption && <p className="text-[12px] text-ink">{item.caption}</p>}
                              <p className="mono mt-1 text-[10px] text-ink-3">
                                {new Date(item.capturedAt || item.createdAt).toLocaleString()} · {(item.byteSize / 1024 / 1024).toFixed(1)} MB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void remove(item)}
                              aria-label="Remove evidence photo"
                              className="shrink-0 p-1.5 text-ink-3 hover:text-rose-ink"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </section>
  );
}
