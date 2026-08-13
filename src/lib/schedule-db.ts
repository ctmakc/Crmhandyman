import { prisma } from "@/lib/prisma";
import { conflictsFor, MAX_SPAN_DAYS, type ScheduleJob } from "@/lib/schedule";

/**
 * The database half of scheduling. `schedule.ts` stays pure because the board, the day
 * rail and the job card all import it into the browser; anything touching Prisma has to
 * live on this side of the wall.
 */

export interface Clash {
  id: string;
  title: string;
  clientName: string;
  status: string;
  scheduledDate: Date | null;
  durationMinutes: number | null;
}

/**
 * The jobs the same person already holds while this one runs.
 *
 * Recomputed on the server after every write, even though the board warns before the
 * click: a board's copy of the week can be minutes old, and two dispatchers booking the
 * same tech from two phones would each see a clean day. It is a report, never a refusal
 * — a mover really does run two short jobs back to back, and software that says no to
 * that gets worked around inside a week.
 */
export async function doubleBooked(tenantId: string, job: ScheduleJob): Promise<Clash[]> {
  if (!job.assignedToId || !job.scheduledDate) return [];

  // One maximum span either side: SQLite cannot add a duration to a column in a WHERE
  // clause, so the reach is bounded here and the run length is applied in memory.
  const anchor = new Date(job.scheduledDate);
  const from = new Date(anchor);
  from.setDate(from.getDate() - MAX_SPAN_DAYS);
  const to = new Date(anchor);
  to.setDate(to.getDate() + MAX_SPAN_DAYS);

  const neighbours = await prisma.project.findMany({
    where: {
      tenantId,
      assignedToId: job.assignedToId,
      id: { not: job.id },
      status: { not: "CANCELLED" },
      scheduledDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      clientName: true,
      status: true,
      scheduledDate: true,
      durationMinutes: true,
      assignedToId: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  // The holder is already known — the caller asked about him. What travels back is the
  // work he is holding, which is what the dispatcher has to read before deciding.
  return conflictsFor(job, neighbours).map(({ assignedToId: _holder, ...clash }) => clash);
}
