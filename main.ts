import { main } from "effection";
import { parser } from "npm:zod-opts";
import { z } from "npm:zod";
import { exec } from "./zx.ts";
import type { Sitemap } from "./types.ts";
import { parse } from "@libs/xml/parse";
import { staticalize } from "./staticalize.ts";

const url = () =>
  z.string().refine((str) => str.match(/^http/), {
    message: `must be a hypertext (http) url`,
  });

await main(function* (args) {
  let options = parser()
    .name("statical")
    .description(
      "Create a static version of a website by traversing a dynamically evaluated sitemap.xml",
    )
    .version("0.0.0")
    .options({
      site: {
        alias: "s",
        type: url(),
        description:
          "URL of the website to staticalize. E.g. http://localhost:8000",
      },
      outputdir: {
        type: z.string().default("dist"),
        description: "Directory to place the downloaded site",
        alias: "o",
      },
      "base-url": {
        type: url(),
        description:
          "Base URL of the public website. E.g. http://frontside.com",
      },
      "eval-sitemap": {
        type: z.string(),
        alias: "e",
        description: "Command that when executed prints sitemap.xml to stdout",
      },
    })
    .parse(args);

  let sitemap = parseSitemap(
    (yield* exec(options["eval-sitemap"])).stdout.trim(),
  );

  yield* staticalize({
    base: new URL(options["base-url"]),
    host: new URL(options.site),
    sitemap,
    dir: options.outputdir,
  });
});

function parseSitemap(buffer: string): Sitemap {
  let SitemapURL = z.object({
    loc: z.string(),
  });

  let SitemapXML = z.object({
    urlset: z.object({
      urls: z.union([SitemapURL, z.array(SitemapURL)]),
    }),
  });

  let xml = parse(buffer, {
    mode: "xml",
    flatten: { empty: false, text: true, attributes: false },
  });

  let sitemap = SitemapXML.parse(xml);

  return {
    urls: Array.isArray(sitemap.urlset.urls)
      ? sitemap.urlset.urls
      : [sitemap.urlset.urls],
  };
}
