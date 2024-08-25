import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";

import { loc, staticalize, url, urlset } from "../mod.ts";
import { emptyDir, exists } from "@std/fs";

import { Hono } from "jsr:@hono/hono";
import { parse } from "@libs/xml";

describe("staticalize", () => {
  let server: ReturnType<typeof Deno.serve>;
  let address: Deno.NetAddr;
  let host: URL;

  beforeEach(async () => {
    await emptyDir("test/dist");
    let app = new Hono();
    app.get("/", (c) => c.html("<h1>Index</h1>"));
    app.get("/about", (c) => c.html("<h1>About</h1>"));
    app.get("/contact", (c) => c.html("<h1>Contact</h1>"));
    app.get("/deeply/nested/page", (c) => c.html("<h1>Nested</h1>"));

    let listening = Promise.withResolvers<Deno.NetAddr>();

    server = Deno.serve({
      onListen: (addr) => listening.resolve(addr),
    }, app.fetch);

    address = await listening.promise;
    host = new URL(`http://${address.hostname}:${address.port}`);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  it("generates a site from static urls", async () => {
    await staticalize({
      host,
      base: new URL("https://frontside.com"),
      sitemap: urlset([
        url(
          loc("/"),
        ),
        url(
          loc("/about"),
        ),
        url(
          loc("/contact"),
        ),
      ]),
      dir: "test/dist",
    });

    await expect(content("test/dist/index.html")).resolves.toEqual(
      "<h1>Index</h1>",
    );
    await expect(content("test/dist/about")).resolves.toEqual("<h1>About</h1>");
    await expect(content("test/dist/contact")).resolves.toEqual(
      "<h1>Contact</h1>",
    );

    let xml = parse(await Deno.readTextFile("test/dist/sitemap.xml"));

    //@ts-expect-error this is an unknown xml doc
    let [one, two, three] = xml.urlset.urls.map((u) => u.loc);
    expect([one, two, three]).toEqual([
      "https://frontside.com/",
      "https://frontside.com/about",
      "https://frontside.com/contact",
    ]);
  });

  it("handles nested subdirectories", async () => {
    await staticalize({
      base: new URL("https://fs.com"),
      host,
      dir: "test/dist",
      sitemap: urlset([
        url(
          loc("/deeply/nested/page"),
        ),
      ]),
    });
    expect(content("test/dist/deeply/nested/page")).resolves.toEqual(
      "<h1>Nested</h1>",
    );
  });

  it("fetches assets from downloaded html pages", () => {
  });
});

async function content(path: string): Promise<string> {
  await expect(exists(path)).resolves.toEqual(true);
  let bytes = await Deno.readFile(path);
  return new TextDecoder().decode(bytes);
}
