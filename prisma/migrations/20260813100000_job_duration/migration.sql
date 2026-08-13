-- A job now carries how long it holds the crew, in minutes.
--
-- Additive column, nothing rebuilt: every existing row keeps NULL, which the schedule
-- reads as «one stop, nobody said how long» — exactly the behaviour before this column
-- existed. Movers fill it in hours, renovation crews in whole days (src/lib/schedule.ts).

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "durationMinutes" INTEGER;
