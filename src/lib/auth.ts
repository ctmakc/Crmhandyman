import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
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

/**
 * The root domain every workspace subdomain shares, e.g. ".agintent.com". Google's OAuth
 * redirect must point at ONE host (the front door, crm.<root>), so a login started on any
 * <slug>.<root> travels through the front door and back. That only works if the session
 * cookie is written for the whole root, and if the redirect back to the worker's own
 * subdomain is allowed. Unset (dev/test) → cookie stays host-only, Google is off, and
 * every redirect is same-origin, exactly as before.
 */
const COOKIE_DOMAIN = (process.env.NEXTAUTH_COOKIE_DOMAIN ?? "").trim();
const GOOGLE_ID = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const GOOGLE_SECRET = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
export const googleEnabled = Boolean(GOOGLE_ID && GOOGLE_SECRET);

export const authOptions: NextAuthOptions = {
  providers: [
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: GOOGLE_ID,
            clientSecret: GOOGLE_SECRET,
            // We never write the account without a workspace decision, so no linking here.
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
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
    async jwt({ token, user, account, profile }) {
      // First pass of a credentials sign-in: authorize() already resolved the workspace.
      if (account?.provider === "credentials" && user) {
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
       * First pass of a Google sign-in. Google proves the email; the workspace is ours to
       * resolve. Three outcomes: a linked account signs straight in; an unlinked email
       * that already belongs to exactly one workspace is linked and let in; a brand-new
       * Google account carries no workspace and is sent to name one (which opens PENDING,
       * awaiting approval). A workspace that is not ACTIVE never yields a live session.
       */
      if (account?.provider === "google" && profile?.email) {
        const sub = account.providerAccountId;
        const email = profile.email.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fullName = (profile as any).name || email;

        let row = await prisma.user.findUnique({
          where: { googleSub: sub },
          include: { tenant: { select: { slug: true, status: true } } },
        });

        // Not linked yet: adopt the link only when the email names exactly one user, so a
        // Google account can never silently seize a workspace it was never part of.
        if (!row) {
          const byEmail = await prisma.user.findMany({
            where: { email },
            include: { tenant: { select: { slug: true, status: true } } },
          });
          if (byEmail.length === 1) {
            row = await prisma.user.update({
              where: { id: byEmail[0].id },
              data: { googleSub: sub },
              include: { tenant: { select: { slug: true, status: true } } },
            });
          }
        }

        if (row) {
          if (row.tenant.status !== "ACTIVE") {
            token.pending = true;
            token.pendingSlug = row.tenant.slug;
            token.email = email;
            return token;
          }
          token.id = row.id;
          token.role = row.role;
          token.tenantId = row.tenantId;
          token.tenantSlug = row.tenant.slug;
          token.email = email;
          delete token.needsWorkspace;
          delete token.pending;
          return token;
        }

        // Brand-new Google account: no workspace yet. /register/finish will name one.
        token.needsWorkspace = true;
        token.googleSub = sub;
        token.email = email;
        token.name = fullName;
        return token;
      }

      // A signup that has not finished naming its workspace: nothing to re-check yet.
      if (token.needsWorkspace) return token;

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
        // A finished Google sign-up in waiting: no desk, just the two facts the finish
        // page and the pending screen read.
        if (token.needsWorkspace) {
          u.needsWorkspace = true;
          u.googleSub = token.googleSub as string;
          u.email = token.email as string;
          u.name = token.name as string;
          return session;
        }
        if (token.pending) {
          u.pending = true;
          u.pendingSlug = token.pendingSlug as string;
          u.email = token.email as string;
          return session;
        }
        u.role = token.role as string;
        u.id = token.id as string;
        u.tenantId = token.tenantId as string;
        u.tenantSlug = token.tenantSlug as string;
      }
      return session;
    },
    /**
     * Google enters through the front door (crm.<root>) but a worker belongs on their own
     * <slug>.<root>. Allow any subdomain of the configured root as a post-login target so
     * the front door can hand the session back to the workspace; everything else stays
     * same-origin, NextAuth's safe default.
     */
    async redirect({ url, baseUrl }) {
      if (COOKIE_DOMAIN) {
        try {
          const target = new URL(url, baseUrl);
          const root = COOKIE_DOMAIN.replace(/^\./, "");
          if (target.hostname === root || target.hostname.endsWith(`.${root}`)) {
            return target.toString();
          }
        } catch {
          /* fall through to same-origin */
        }
      }
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
  },
  ...(COOKIE_DOMAIN
    ? {
        cookies: {
          sessionToken: {
            name: "__Secure-next-auth.session-token",
            options: {
              domain: COOKIE_DOMAIN,
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: true,
            },
          },
        },
      }
    : {}),
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
