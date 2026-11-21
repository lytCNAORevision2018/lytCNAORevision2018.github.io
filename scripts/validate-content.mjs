import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateContent } from "../tools/site-manager/lib/content.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const contentPath = resolve(repositoryRoot, "_data", "site_content.json");

try {
  const content = JSON.parse(await readFile(contentPath, "utf8"));
  const errors = validateContent(content);
  if (errors.length > 0) {
    console.error("主页内容校验失败：");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log("主页内容校验通过。");
  }
} catch (error) {
  console.error(`无法读取主页内容：${error.message}`);
  process.exitCode = 1;
}
