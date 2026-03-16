import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  const workerPassword = await bcrypt.hash("worker123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@handyman.ca" },
    update: {},
    create: {
      name: "Mike Johnson",
      email: "admin@handyman.ca",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  const worker1 = await prisma.user.upsert({
    where: { email: "worker1@handyman.ca" },
    update: {},
    create: {
      name: "Steve Brown",
      email: "worker1@handyman.ca",
      password: workerPassword,
      role: "WORKER",
    },
  });

  const worker2 = await prisma.user.upsert({
    where: { email: "worker2@handyman.ca" },
    update: {},
    create: {
      name: "Dave Wilson",
      email: "worker2@handyman.ca",
      password: workerPassword,
      role: "WORKER",
    },
  });

  // Sample lead
  await prisma.lead.upsert({
    where: { id: "lead-sample-1" },
    update: {},
    create: {
      id: "lead-sample-1",
      name: "John Smith",
      phone: "416-555-0101",
      email: "john@example.com",
      address: "123 Maple St",
      city: "Toronto",
      source: "FACEBOOK",
      jobType: "Drywall Repair",
      notes: "Needs patch in living room ceiling, water damage",
      status: "NEW",
      assignedToId: admin.id,
    },
  });

  // Sample project
  const project = await prisma.project.upsert({
    where: { id: "project-sample-1" },
    update: {},
    create: {
      id: "project-sample-1",
      clientName: "Sarah Connor",
      phone: "416-555-0202",
      email: "sarah@example.com",
      address: "456 Oak Ave, Toronto, ON",
      title: "Kitchen Renovation",
      description: "Full kitchen renovation including cabinets, drywall and painting",
      jobType: "Renovation",
      status: "IN_PROGRESS",
      scheduledDate: new Date("2026-03-20"),
      assignedToId: worker1.id,
    },
  });

  // Sample estimate
  await prisma.estimate.upsert({
    where: { id: "estimate-sample-1" },
    update: {},
    create: {
      id: "estimate-sample-1",
      projectId: project.id,
      lineItems: JSON.stringify([
        { description: "Drywall materials", qty: 10, unit: "sheet", unitPrice: 25 },
        { description: "Labour - drywall", qty: 8, unit: "hr", unitPrice: 75 },
        { description: "Paint (2 coats)", qty: 2, unit: "room", unitPrice: 350 },
      ]),
      subtotal: 1750,
      tax: 227.5,
      total: 1977.5,
      notes: "Price includes GST. Valid for 30 days.",
      status: "SENT",
    },
  });

  // Sample task
  await prisma.task.upsert({
    where: { id: "task-sample-1" },
    update: {},
    create: {
      id: "task-sample-1",
      projectId: project.id,
      title: "Buy drywall supplies from Home Depot",
      description: "2 sheets of 5/8\" drywall, joint compound, screws",
      assignedToId: worker1.id,
      createdById: admin.id,
      dueDate: new Date("2026-03-19"),
      status: "TODO",
    },
  });

  await prisma.task.upsert({
    where: { id: "task-sample-2" },
    update: {},
    create: {
      id: "task-sample-2",
      projectId: project.id,
      title: "Sand and prime walls",
      description: "Sand all walls, apply primer coat",
      assignedToId: worker2.id,
      createdById: admin.id,
      dueDate: new Date("2026-03-21"),
      status: "TODO",
    },
  });

  // Sample payment
  await prisma.payment.upsert({
    where: { id: "payment-sample-1" },
    update: {},
    create: {
      id: "payment-sample-1",
      projectId: project.id,
      amount: 500,
      method: "E_TRANSFER",
      notes: "Deposit 50%",
    },
  });

  // Sample expense
  await prisma.expense.upsert({
    where: { id: "expense-sample-1" },
    update: {},
    create: {
      id: "expense-sample-1",
      projectId: project.id,
      amount: 250,
      category: "MATERIALS",
      description: "Home Depot - drywall and supplies",
    },
  });

  console.log("✅ Seed complete");
  console.log("Admin: admin@handyman.ca / admin123");
  console.log("Worker 1: worker1@handyman.ca / worker123");
  console.log("Worker 2: worker2@handyman.ca / worker123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
