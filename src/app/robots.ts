import type { MetadataRoute } from "next";

const siteUrl = "https://main.d2ywd3m1zdoku3.amplifyapp.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
