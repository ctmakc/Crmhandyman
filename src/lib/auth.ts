import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

/** One header, whichever shape the runtime delivered it in. */
function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

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
        // between a stranger and a contractor's whole customer list, so the address is
        // read the one trustworthy way — see clientIpFromHeaders. `headerValue` copes
        // with either shape NextAuth may hand over (plain object or WHATWG Headers).
        const ip = clientIpFromHeaders(
          headerValue(req?.headers, "x-forwarded-for"),
          headerValue(req?.headers, "x-real-ip")
        );
        if (!(await rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)).ok) return null;

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
        return token;
      }

      /**
       * On every later request the token is stateless — nothing has asked the database
       * whether this person still works here. A fired worker's cookie stayed a valid
       * session for the ~30 days until it expired, and that session could still read and
       * tamper with the desk. So re-check the row each pass: gone → the session is dead,
       * role changed → the token follows it (a demoted admin loses the owner's desk on
       * the next request, not on the next login).
       */
      if (token.id && token.tenantId) {
        const row = await prisma.user.findFirst({
          where: { id: token.id as string, tenantId: token.tenantId as string },
          select: { role: true },
        });
        if (!row) {
          token.dead = true;
        } else {
          token.role = row.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = session.user as any;
        // A revoked user carries no identity: guards and the page guard read the empty
        // id as "signed out" and answer 401 / bounce to login.
        if (token.dead) {
          u.role = "";
          u.id = "";
          u.tenantId = "";
          u.tenantSlug = "";
          u.dead = true;
          return session;
        }
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
