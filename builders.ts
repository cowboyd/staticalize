import { ChangeFreq, Loc, Priority, Sitemap, SitemapURL } from "./types.ts";

export function urlset(urls: Iterable<SitemapURL>): Sitemap {
  return {
    urls,
  };
}

export function url(
  loc: Loc,
  lastmod?: Date,
  changefreq?: ChangeFreq,
  priority?: Priority,
): SitemapURL {
  return { loc, lastmod, changefreq, priority };
}

export function loc(value: string) {
  return value;
}
