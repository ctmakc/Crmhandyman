import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function seedDemoData(tenantId: string, adminUserId: string) {
  const workerPassword = await bcrypt.hash("demo123", 10);

  const worker = await prisma.user.create({
    data: {
      tenantId,
      name: "Alex Worker",
      email: `worker.${tenantId}@demo.local`,
      password: workerPassword,
      role: "WORKER",
    },
  });

  // Sample leads
  await prisma.lead.createMany({
    data: [
      {
        tenantId,
        name: "David Lee",
        phone: "416-555-0110",
        email: "david@example.com",
        address: "10 King St W",
        city: "Toronto",
        source: "FACEBOOK",
        jobType: "Deck Repair",
        notes: "Boards rotting, needs replacement",
        status: "NEW",
        assignedToId: adminUserId,
      },
      {
        tenantId,
        name: "Maria Garcia",
        phone: "905-555-0221",
        email: "maria@example.com",
        address: "5 Queen St E",
        city: "Mississauga",
        source: "GOOGLE",
        jobType: "Bathroom Tile",
        notes: "Grout cracking in shower",
        status: "CONTACTED",
      },
      {
        tenantId,
        name: "Tom Baker",
        phone: "647-555-0332",
        email: "tom@example.com",
        source: "MANUAL",
        jobType: "Fence Install",
        status: "VERIFIED",
      },
    ],
  });

  // Sample project
  const project = await prisma.project.create({
    data: {
      tenantId,
      clientName: "Emily White",
      phone: "416-555-0445",
      email: "emily@example.com",
      address: "200 University Ave, Toronto, ON",
      title: "Basement Renovation",
      description: "Framing, drywall, painting",
      jobType: "Renovation",
      status: "IN_PROGRESS",
      scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      assignedToId: worker.id,
    },
  });

  await prisma.estimate.create({
    data: {
      projectId: project.id,
      lineItems: JSON.stringify([
        { description: "Framing lumber", qty: 20, unit: "pc", unitPrice: 15 },
        { description: "Drywall sheets", qty: 12, unit: "sheet", unitPrice: 30 },
        { description: "Labour", qty: 24, unit: "hr", unitPrice: 80 },
      ]),
      subtotal: 2580,
      tax: 335.4,
      total: 2915.4,
      notes: "Includes HST. Valid 30 days.",
      status: "SENT",
    },
  });

  await prisma.task.createMany({
    data: [
      {
        tenantId,
        projectId: project.id,
        title: "Pick up lumber from Home Depot",
        assignedToId: worker.id,
        createdById: adminUserId,
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        status: "TODO",
      },
      {
        tenantId,
        projectId: project.id,
        title: "Frame basement walls",
        assignedToId: worker.id,
        createdById: adminUserId,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: "TODO",
      },
    ],
  });

  await prisma.payment.create({
    data: {
      tenantId,
      projectId: project.id,
      amount: 1000,
      method: "E_TRANSFER",
      notes: "Deposit",
    },
  });

  await prisma.expense.create({
    data: {
      tenantId,
      projectId: project.id,
      amount: 450,
      category: "MATERIALS",
      description: "Lumber and drywall",
    },
  });
}
