import {
  call,
  Operation,
  resource,
  spawn,
  Task,
  useAbortSignal,
  useScope,
} from "effection";
import { dirname, join, normalize } from "jsr:@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { stringify } from "@libs/xml/stringify";
import { DOMParser, Element } from "deno-dom";
import { parse } from "@libs/xml/parse";
import z from "npm:zod";

export interface StaticalizeOptions {
  host: URL;
  base: URL;
  dir: string;
}

export interface StaticalizeSummary {
  durationMS: number;
}

export function* staticalize(options: StaticalizeOptions): Operation<void> {
  let { host, base, dir } = options;

  let signal = yield* useAbortSignal();

  let urls: SitemapURL[] = yield* call(async () => {
    let url = new URL("/sitemap.xml", host);
    let response = await fetch(url, { signal });
    if (!response.ok) {
      let error = new Error(
        `GET ${url} ${response.status} ${response.statusText}`,
      );
      error.name = `SitemapError`;
      throw error;
    }
    let text = await response.text();
    let xml = parse(text, {
      flatten: { attributes: false, empty: false, text: true },
    }) as unknown as SitemapXML;

    let urls = xml.urlset.url;

    return Array.isArray(urls) ? urls : [urls];
  });

  let downloader = yield* useDownloader({ host, outdir: dir });

  yield* call(() => ensureDir(dir));

  for (let url of urls) {
    downloader.download(url.loc);
  }

  let sitemap = yield* spawn(function* () {
    let xml = stringify({
      urlset: {
        "@xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
        "urls": urls.map((url) => {
          let loc = new URL(url.loc);
          loc.host = base.host;
          loc.port = base.port;
          loc.protocol = base.protocol;
          return { loc: { "#text": loc } };
        }),
      },
    });
    yield* call(() =>
      Deno.writeFile(
        join(dir, "sitemap.xml"),
        new TextEncoder().encode(xml),
      )
    );
  });

  yield* sitemap;
  yield* downloader;
}

interface Downloader extends Operation<void> {
  download(spec: string): void;
}

interface DownloaderOptions {
  host: URL;
  outdir: string;
}

function useDownloader(opts: DownloaderOptions): Operation<Downloader> {
  let seen = new Map<string, boolean>();
  return resource(function* (provide) {
    let { host, outdir } = opts;
    let tasks: Task<void>[] = [];

    let scope = yield* useScope();

    let signal = yield* useAbortSignal();

    let downloader: Downloader = {
      download(loc) {
        if (seen.get(loc)) {
          return;
        }
        seen.set(loc, true);
        if (loc.startsWith("//")) {
          return;
        }
        let source = loc.match(/^\w+:/) ? new URL(loc) : new URL(loc, host);
        if (source.host !== host.host) {
          return;
        }

        let destpath = normalize(
          join(
            outdir,
            source.pathname === "/" ? "/index.html" : source.pathname,
          ),
        );
        tasks.push(
          scope.run(function* () {
            let response = yield* call(() =>
              fetch(source.toString(), { signal })
            );
            if (response.ok) {
              if (response.headers.get("Content-Type")?.includes("html")) {
                let content = yield* call(() => response.text());
                let document = new DOMParser().parseFromString(
                  content,
                  "text/html",
                );
                let links = document.querySelectorAll("link[href]");
                for (let node of links) {
                  let link = node as Element;
                  let href = link.getAttribute("href");
                  downloader.download(href!);
                }

                let assets = document.querySelectorAll("[src]");
                for (let node of assets) {
                  let element = node as Element;
                  let src = element.getAttribute("src")!;
                  downloader.download(src!);
                }

                yield* call(async () => {
                  let destdir = dirname(destpath);
                  await ensureDir(destdir);
                  await Deno.writeTextFile(destpath, content);
                });
              } else {
                yield* call(async () => {
                  let destdir = dirname(destpath);
                  await ensureDir(destdir);
                  await Deno.writeFile(destpath, response.body!);
                });
              }
            } else {
              throw new Error(
                `GET ${source} ${response.status} ${response.statusText}`,
              );
            }
          }),
        );
      },
      *[Symbol.iterator]() {
        let task = tasks.pop();
        while (task) {
          yield* task;
          task = tasks.pop();
        }
      },
    };

    yield* provide(downloader);
  });
}

interface SitemapURL {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

interface SitemapXML {
  urlset: {
    url: SitemapURL | SitemapURL[];
  };
}
