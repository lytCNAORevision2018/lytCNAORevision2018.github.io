import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
await mkdir("tools/site-manager/vendor", { recursive: true });
await build({
  entryPoints: ["tools/site-manager/lib/reader-source.mjs"],
  outfile: "tools/site-manager/vendor/reader.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  minify: true,
  legalComments: "eof",
});
await mkdir("assets/reader", { recursive: true });
await cp(
  "node_modules/katex/dist/katex.min.css",
  "assets/reader/katex.min.css",
);
await cp("node_modules/katex/dist/fonts", "assets/reader/fonts", {
  recursive: true,
});
await cp("node_modules/katex/LICENSE", "assets/reader/KATEX-LICENSE.txt");
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || info.optional) continue;
  const licenseFiles = (await readdir(path)).filter((name) =>
    /^(?:license|licence|copying)(?:\.|$)/i.test(name),
  );
  for (const name of licenseFiles)
    notices.push(
      `--- ${path} ${info.version}: ${name} ---\n${await readFile(`${path}/${name}`, "utf8")}`,
    );
}
await writeFile(
  "tools/site-manager/vendor/THIRD-PARTY-LICENSES.txt",
  notices.join("\n\n"),
);
