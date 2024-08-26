import {
  call,
  Operation,
  resource,
  run,
  spawn,
  Task,
  useScope,
} from "effection";
import { Sitemap } from "./types.ts";
import { dirname, join, normalize } from "jsr:@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { stringify } from "@libs/xml/stringify";
import { DOMParser, Element } from "deno-dom";

export interface StaticalizeOptions {
  host: URL;
  base: URL;
  sitemap: Sitemap;
  dir: string;
}

export interface StaticalizeSummary {
  durationMS: number;
}

export function staticalize(options: StaticalizeOptions): Promise<void> {
  let { sitemap, host, base, dir } = options;
  return run(function* () {
    let tasks: Task<void>[] = [];

    let downloader = yield* useDownloader({ host, outdir: dir });

    yield* call(() => ensureDir(dir));

    for (let spec of sitemap.urls) {
      downloader.download(spec.loc);
    }

    tasks.push(
      yield* spawn(function* () {
        let xml = stringify({
          urlset: {
            "@xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "urls": [...sitemap.urls].map((url) => ({
              loc: { "#text": contextualize(url.loc, base).toString() },
            })),
          },
        });
        yield* call(() =>
          Deno.writeFile(
            join(dir, "sitemap.xml"),
            new TextEncoder().encode(xml),
          )
        );
      }),
    );

    yield* downloader;
  });
}

function contextualize(location: string, base: URL): URL {
  if (location.match(/^\w+:/)) {
    return new URL(location);
  } else {
    let url = new URL(base.toString());
    url.pathname = location;
    return url;
  }
}

interface Downloader extends Operation<void> {
  download(spec: string): void;
}

interface DownloaderOptions {
  host: URL;
  outdir: string;
}

function useDownloader(opts: DownloaderOptions): Operation<Downloader> {
  return resource(function* (provide) {
    let { host, outdir } = opts;
    let tasks: Task<void>[] = [];

    let scope = yield* useScope();

    let downloader: Downloader = {
      download(loc) {
	let source = contextualize(loc, host);
	if (source.host !== host.host) {
	  return;
	}
	
        let destpath = normalize(join(outdir, source.pathname === "/" ? "/index.html" : source.pathname));
        tasks.push(
          scope.run(function* () {
            let response = yield* call(() => fetch(source.toString()));
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
                  downloader.download(src);
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
              throw new Error(`GET ${source} ${response.status} ${response.statusText}`);
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
