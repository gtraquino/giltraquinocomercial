// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://giltraquinocomercial.lovable.app";
const SUPABASE_URL = "https://letrplxvycbggnjrypmk.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxldHJwbHh2eWNiZ2duanJ5cG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTI1NjgsImV4cCI6MjA5MTcyODU2OH0.rPPVUIRf3aji5p35bFsnrvDGclYiCP-g1-5q4goYDsg";

interface SitemapEntry { path: string; changefreq?: string; priority?: string }

async function main() {
  const entries: SitemapEntry[] = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/privacidade", changefreq: "yearly", priority: "0.3" },
    { path: "/termos", changefreq: "yearly", priority: "0.3" },
  ];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=id&is_blocked=eq.false`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (r.ok) for (const s of (await r.json()) as { id: string }[])
      entries.push({ path: `/loja/${s.id}`, changefreq: "weekly", priority: "0.8" });
  } catch { /* offline: keep static entries */ }

  const urls = entries.map((e) => [
    "  <url>", `    <loc>${BASE_URL}${e.path}</loc>`,
    e.changefreq && `    <changefreq>${e.changefreq}</changefreq>`,
    e.priority && `    <priority>${e.priority}</priority>`, "  </url>",
  ].filter(Boolean).join("\n"));
  writeFileSync(resolve("public/sitemap.xml"),
    ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>"].join("\n"));
  console.log(`sitemap.xml written (${entries.length} entries)`);
}
main();
