import { prisma } from "@/lib/prisma";
import { RESERVED_LABELS } from "@/lib/tenant-slug";

/** A business name reduced to a subdomain label: lowercase, hyphen-joined, 40 chars. */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * A slug no other workspace holds and no infrastructure host shadows. Reserved labels
 * (crm, www, api…) are refused so a workspace can never be minted on the front door's
 * own name or a name no subdomain could reach.
 */
export async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let i = 0;
  while (!slug || RESERVED_LABELS.has(slug) || (await prisma.tenant.findUnique({ where: { slug } }))) {
    slug = `${slugify(base) || "workspace"}-${++i}`;
  }
  return slug;
}
