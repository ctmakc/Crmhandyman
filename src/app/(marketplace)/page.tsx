import type { Metadata } from "next";
import DirectoryPage from "./directory/page";

export const metadata: Metadata = {
  title: "Find local contractors and trade work in Canada",
  description:
    "Search Canadian home-service contractors, post a project and find skilled-trade jobs through a network connected to real CRM operations.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

export default DirectoryPage;
