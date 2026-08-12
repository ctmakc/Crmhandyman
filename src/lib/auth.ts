import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        slug: { label: "Workspace", type: "text" },
      },
      /**
       * The tenant is resolved here from its slug — the browser never handles a tenant id.
       * The old flow had the login page fetch the id from a public endpoint and post it
       * back, which handed anyone the first half of an account takeover.
       */
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password || !credentials?.slug) return null;

        // Ten tries per address per quarter hour. Passwords are the only thing standing
        // between a stranger and a contractor's whole customer list.
        const forwarded = (req?.headers?.["x-forwarded-for"] as string | undefined) ?? "";
        const ip = forwarded.split(",")[0].trim() || "unknown";
        if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000).ok) return null;

        const tenant = await prisma.tenant.findUnique({
          where: { slug: credentials.slug },
          select: { id: true, slug: true },
        });
        if (!tenant) return null;

        const user = await prisma.user.findUnique({
          where: { email_tenantId: { email: credentials.email, tenantId: tenant.id } },
        });
        if (!user) return null;

        const passwordValid = await bcrypt.compare(credentials.password, user.password);
        if (!passwordValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          role: user.role as any,
          tenantId: user.tenantId,
          tenantSlug: tenant.slug,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role;
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.tenantId = (user as any).tenantId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.tenantSlug = (user as any).tenantSlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = session.user as any;
        u.role = token.role as string;
        u.id = token.id as string;
        u.tenantId = token.tenantId as string;
        u.tenantSlug = token.tenantSlug as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
