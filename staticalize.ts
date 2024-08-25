import { all, call, run, spawn, Task } from "effection";
import { Sitemap } from "./types.ts";
import { dirname, join, normalize } from "jsr:@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { stringify } from "@libs/xml/stringify";

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

    yield* call(() => ensureDir(dir));

    for (let spec of sitemap.urls) {
      let source = new URL(host.toString());
      source.pathname = spec.loc;
      let pathname = spec.loc.trim() === "/" ? "index.html" : spec.loc.trim();
      let destpath = normalize(join(dir, pathname));
      tasks.push(
        yield* spawn(function* () {
          let response = yield* call(() => fetch(source.toString()));
          try {
            if (response.ok) {
              yield* call(async () => {
                let destdir = dirname(destpath);
                await ensureDir(destdir);
                await Deno.writeFile(destpath, response.body!);
              });
            } else {
              throw new Error(`${response.status} ${response.statusText}`);
            }
          } finally {
            yield* call(() => response.body?.cancel());
          }
        }),
      );
    }

    tasks.push(
      yield* spawn(function* () {
        let xml = stringify({
          urlset: {
            "@xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
            "urls": [...sitemap.urls].map((url) => ({
              loc: { "#text": contextualize(url.loc, base) },
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

    let task = tasks.pop();
    while (task) {
      yield* task;
      task = tasks.pop();
    }
  });
}

function contextualize(pathname: string, base: URL): string {
  if (pathname.match(/^\w+:/)) {
    return pathname;
  } else {
    let url = new URL(base.toString());
    url.pathname = pathname;
    return url.toString();
  }
}
