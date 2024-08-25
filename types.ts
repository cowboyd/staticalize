export interface Sitemap {
  urls: Iterable<SitemapURL>;
}

export interface SitemapURL {
  loc: string;
  lastmod?: Date;
  changefreq?: ChangeFreq;
  priority?: Priority;
}

export type Loc = string;

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface Priority {
  value: number;
}
