import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  const workerPassword = await bcrypt.hash("worker123", 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      businessName: "Mike's Handyman Services",
      ownerEmail: "admin@handyman.ca",
      plan: "PAID",
      expiresAt: null,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email_tenantId: { email: "admin@handyman.ca", tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Mike Johnson",
      email: "admin@handyman.ca",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  const worker1 = await prisma.user.upsert({
    where: { email_tenantId: { email: "worker1@handyman.ca", tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Steve Brown",
      email: "worker1@handyman.ca",
      password: workerPassword,
      role: "WORKER",
    },
  });

  const worker2 = await prisma.user.upsert({
    where: { email_tenantId: { email: "worker2@handyman.ca", tenantId: tenant.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Dave Wilson",
      email: "worker2@handyman.ca",
      password: workerPassword,
      role: "WORKER",
    },
  });

  await prisma.lead.upsert({
    where: { id: "lead-sample-1" },
    update: {},
    create: {
      id: "lead-sample-1",
      tenantId: tenant.id,
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

  const project = await prisma.project.upsert({
    where: { id: "project-sample-1" },
    update: {},
    create: {
      id: "project-sample-1",
      tenantId: tenant.id,
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
      notes: "Price includes HST. Valid for 30 days.",
      status: "SENT",
    },
  });

  await prisma.task.upsert({
    where: { id: "task-sample-1" },
    update: {},
    create: {
      id: "task-sample-1",
      tenantId: tenant.id,
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
      tenantId: tenant.id,
      projectId: project.id,
      title: "Sand and prime walls",
      description: "Sand all walls, apply primer coat",
      assignedToId: worker2.id,
      createdById: admin.id,
      dueDate: new Date("2026-03-21"),
      status: "TODO",
    },
  });

  await prisma.payment.upsert({
    where: { id: "payment-sample-1" },
    update: {},
    create: {
      id: "payment-sample-1",
      tenantId: tenant.id,
      projectId: project.id,
      amount: 500,
      method: "E_TRANSFER",
      notes: "Deposit 50%",
    },
  });

  await prisma.expense.upsert({
    where: { id: "expense-sample-1" },
    update: {},
    create: {
      id: "expense-sample-1",
      tenantId: tenant.id,
      projectId: project.id,
      amount: 250,
      category: "MATERIALS",
      description: "Home Depot - drywall and supplies",
    },
  });

  const profile = await prisma.contractorProfile.upsert({
    where: { tenantId: tenant.id },
    update: {
      displayName: "Mike's Handyman Services",
      city: "Toronto",
      province: "Ontario",
      profileStatus: "PUBLISHED",
    },
    create: {
      tenantId: tenant.id,
      slug: "mikes-handyman-services",
      displayName: "Mike's Handyman Services",
      headline: "Repairs, drywall and residential renovations across the GTA",
      description:
        "Demo contractor profile connected to the HandymanPro CRM. It demonstrates published services, verified reviews, geographic coverage and trade vacancies without relying on fabricated production listings.",
      phone: "416-555-0100",
      publicEmail: "admin@handyman.ca",
      city: "Toronto",
      province: "Ontario",
      postalCode: "M5V",
      serviceRadiusKm: 45,
      yearsInBusiness: 12,
      emergencyService: true,
      minimumJobValue: 250,
      languages: "English, Ukrainian",
      insuranceVerified: true,
      identityVerified: true,
      verificationStatus: "VERIFIED",
      profileStatus: "PUBLISHED",
      averageRating: 4.8,
      reviewCount: 2,
      responseTimeMinutes: 95,
      completedJobs: 126,
      seoTitle: "Mike's Handyman Services | Toronto contractor",
      seoDescription: "Drywall, repairs and residential renovation services across Toronto and the GTA.",
    },
  });

  await prisma.contractorService.deleteMany({ where: { profileId: profile.id } });
  await prisma.contractorService.createMany({
    data: [
      {
        profileId: profile.id,
        slug: "general-handyman",
        name: "General handyman",
        category: "General repairs",
        description: "Small repairs, installations and punch-list work.",
        priceFrom: 150,
        isPrimary: true,
      },
      {
        profileId: profile.id,
        slug: "drywall-repair",
        name: "Drywall repair",
        category: "Interior",
        description: "Patches, water-damage repair, finishing and repaint preparation.",
        priceFrom: 250,
      },
      {
        profileId: profile.id,
        slug: "bathroom-renovation",
        name: "Bathroom renovation",
        category: "Renovation",
        description: "Bathroom refreshes and full renovation project coordination.",
        priceFrom: 4500,
      },
    ],
  });

  await prisma.serviceArea.deleteMany({ where: { profileId: profile.id } });
  await prisma.serviceArea.createMany({
    data: [
      { profileId: profile.id, city: "Toronto", province: "Ontario", postalPrefix: "M5", radiusKm: 35 },
      { profileId: profile.id, city: "Mississauga", province: "Ontario", postalPrefix: "L5", radiusKm: 30 },
    ],
  });

  await prisma.review.upsert({
    where: { id: "review-demo-1" },
    update: {},
    create: {
      id: "review-demo-1",
      profileId: profile.id,
      authorName: "Demo Customer",
      rating: 5,
      title: "Clear estimate and reliable scheduling",
      body: "The project scope and estimate were documented clearly, and the work was completed as scheduled.",
      source: "VERIFIED_PROJECT",
    },
  });

  await prisma.review.upsert({
    where: { id: "review-demo-2" },
    update: {},
    create: {
      id: "review-demo-2",
      profileId: profile.id,
      authorName: "Sample Homeowner",
      rating: 5,
      body: "Fast response and a clean drywall repair.",
      source: "VERIFIED_CUSTOMER",
    },
  });

  await prisma.vacancy.upsert({
    where: { slug: "renovation-technician-toronto-demo" },
    update: {},
    create: {
      profileId: profile.id,
      slug: "renovation-technician-toronto-demo",
      title: "Renovation Technician",
      description:
        "Demo vacancy for a multi-skilled renovation technician comfortable with drywall, painting, trim and occupied residential sites.",
      serviceSlug: "general-handyman",
      employmentType: "FULL_TIME",
      city: "Toronto",
      province: "Ontario",
      compensationMin: 28,
      compensationMax: 38,
      compensationUnit: "HOUR",
      status: "PUBLISHED",
      validThrough: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("✅ Seed complete");
  console.log(`Tenant slug: demo (${tenant.id})`);
  console.log("Admin: admin@handyman.ca / admin123");
  console.log("Worker 1: worker1@handyman.ca / worker123");
  console.log("Worker 2: worker2@handyman.ca / worker123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
