import { access, readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "../tools/site-manager/lib/content.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const expectedOrigin = "https://lytcnaorevision2018.github.io";
const ignoredDirectories = new Set([".git", ".site-manager", "_site", "node_modules", "tmp", "vendor"]);
const textExtensions = new Set([".html", ".md", ".markdown", ".json", ".scss", ".yml", ".yaml"]);
const forbiddenTemplateAssets = new Set([
  "images/500x300.png",
  "images/bio-photo.jpg",
  "images/bio-photo-2.jpg",
  "images/editing-talk.png",
  "images/profile.png"
]);
const errors = [];

function fail(message) {
  errors.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory, { ignore = ignoredDirectories } = {}) {
  const files = [];
  if (!(await exists(directory))) return files;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignore.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, { ignore }));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function displayPath(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function extractAttribute(html, tagPattern, attribute) {
  const match = html.match(tagPattern);
  if (!match) return "";
  return match[0].match(new RegExp(`${attribute}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function documentUrlPath(siteDirectory, filePath) {
  const relativePath = relative(siteDirectory, filePath).replaceAll("\\", "/");
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}

async function resolveBuiltTarget(siteDirectory, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const relativePath = decoded.replace(/^\/+/, "");
  const candidates = [];
  if (!relativePath || decoded.endsWith("/")) candidates.push(resolve(siteDirectory, relativePath, "index.html"));
  else {
    candidates.push(resolve(siteDirectory, relativePath));
    if (!extname(relativePath)) {
      candidates.push(resolve(siteDirectory, `${relativePath}.html`));
      candidates.push(resolve(siteDirectory, relativePath, "index.html"));
    }
  }
  const rootPrefix = `${siteDirectory}${sep}`;
  for (const candidate of candidates) {
    if (candidate !== siteDirectory && !candidate.startsWith(rootPrefix)) continue;
    if (await exists(candidate) && (await stat(candidate)).isFile()) return true;
  }
  return false;
}

function contentLinks(content) {
  const links = [];
  for (const url of Object.values(content.profile?.links || {})) {
    if (url) links.push(url);
  }
  for (const key of ["education", "projects", "experiences", "awards", "talks", "notes", "outsideResearch", "skills"]) {
    for (const item of content[key] || []) {
      for (const link of item.links || []) if (link.url) links.push(link.url);
    }
  }
  return links;
}

async function auditSource() {
  const contentPath = resolve(repositoryRoot, "_data", "site_content.json");
  const content = JSON.parse(await readFile(contentPath, "utf8"));
  for (const message of validateContent(content)) fail(`内容数据：${message}`);

  if (!content.meta?.siteUrl?.startsWith("https://") || !content.meta.siteUrl.endsWith("/")) {
    fail("meta.siteUrl 必须是以 / 结尾的 HTTPS 地址。");
  }
  if (/example\.com|name@name\.com|lorem ipsum|name name/i.test(JSON.stringify(content))) {
    fail("公开内容仍包含模板占位信息。");
  }

  const allFiles = await walk(repositoryRoot);
  for (const path of allFiles) {
    const name = displayPath(path);
    if (forbiddenTemplateAssets.has(name) || name.startsWith("_drafts/") || name.startsWith("_data/comments/")) {
      fail(`仓库仍包含模板占位资源：${name}`);
    }
    if (extname(path).toLowerCase() === ".pdf") fail(`仓库中不允许存在 PDF：${displayPath(path)}`);
  }

  const publicSourceRoots = ["_data", "_includes", "_layouts", "_pages"].map((path) => resolve(repositoryRoot, path));
  const publicSourceFiles = (await Promise.all(publicSourceRoots.map((path) => walk(path, { ignore: new Set() })))).flat();
  publicSourceFiles.push(resolve(repositoryRoot, "_config.yml"));
  for (const path of publicSourceFiles) {
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const text = await readFile(path, "utf8");
    const name = displayPath(path);
    if (/name name|name@name\.com|github university|paper title number|teaching experience|skill 1|your name|lorem ipsum/i.test(text)) {
      fail(`${name} 仍包含模板占位信息。`);
    }
    if (/\.pdf(?:$|[/?#&=])/im.test(text)) fail(`${name} 含有直接 PDF 引用。`);
    if (/\b(?:paperurl|slidesurl|bibtexurl)\b|Download (?:Paper|Slides|Bibtex)/i.test(text)) {
      fail(`${name} 仍保留旧的下载模板字段。`);
    }
    if (/\bjavascript\s*:/i.test(text)) fail(`${name} 含有 javascript: 地址。`);
    if (/href\s*=\s*["'][^"']*\/files\//i.test(text)) fail(`${name} 含有不受控的 /files/ 链接。`);
  }

  const config = await readFile(resolve(repositoryRoot, "_config.yml"), "utf8");
  const configUrl = config.match(/^url\s*:\s*([^\s#]+)/m)?.[1] || "";
  if (configUrl !== expectedOrigin) fail(`_config.yml 的 url 必须是 ${expectedOrigin}。`);
  if (!/^locale\s*:\s*["']?zh-CN["']?\s*$/m.test(config)) fail("_config.yml 的 locale 必须是 zh-CN。");
  if (/^\s*-\s+files\s*$/m.test(config)) fail("_config.yml 不得强制发布 files 目录。");

  const themeSource = await readFile(resolve(repositoryRoot, "_sass", "_themes.scss"), "utf8");
  const baseSource = await readFile(resolve(repositoryRoot, "_sass", "layout", "_base.scss"), "utf8");
  const managerCss = await readFile(resolve(repositoryRoot, "tools", "site-manager", "public", "app.css"), "utf8");
  for (const font of ["Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei"]) {
    if (!themeSource.includes(`"${font}"`)) fail(`网站字体栈缺少 ${font}。`);
    if (!managerCss.includes(`"${font}"`)) fail(`管理器字体栈缺少 ${font}。`);
  }
  if (!/body\s*\{[\s\S]*?font-family:\s*\$global-font-family/m.test(baseSource)) fail("正文没有使用指定的全局字体栈。");

  const pageFiles = await walk(resolve(repositoryRoot, "_pages"), { ignore: new Set() });
  const permalinks = new Set(["/"]);
  for (const path of pageFiles) {
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const text = await readFile(path, "utf8");
    const permalink = text.match(/^permalink:\s*["']?([^\s"']+)/m)?.[1];
    if (permalink) permalinks.add(permalink);
  }
  for (const link of contentLinks(content)) {
    if (!link.startsWith("/")) continue;
    const pathname = link.split(/[?#]/, 1)[0];
    const physicalPath = resolve(repositoryRoot, pathname.replace(/^\/+/, ""));
    if (!permalinks.has(pathname) && !(await exists(physicalPath))) fail(`站内链接不存在：${link}`);
  }
  if (content.profile.avatar && !content.profile.avatar.includes("://")) {
    const avatarPath = resolve(repositoryRoot, "images", content.profile.avatar);
    if (!(await exists(avatarPath))) fail(`头像文件不存在：images/${content.profile.avatar}`);
  }
  for (const talk of content.talks || []) {
    for (const page of talk.documentPages || []) {
      const pagePath = resolve(repositoryRoot, page.replace(/^\/+/, ""));
      if (!(await exists(pagePath))) fail(`公开讲义页面不存在：${page}`);
    }
  }
}

async function auditBuiltSite(siteDirectory) {
  const managedContent = JSON.parse(await readFile(resolve(repositoryRoot, "_data", "site_content.json"), "utf8"));
  const files = await walk(siteDirectory, { ignore: new Set() });
  for (const path of files) {
    if (extname(path).toLowerCase() === ".pdf") fail(`构建产物中不允许存在 PDF：${relative(siteDirectory, path).replaceAll("\\", "/")}`);
  }

  const htmlFiles = files.filter((path) => extname(path).toLowerCase() === ".html");
  if (htmlFiles.length === 0) fail("构建目录中没有 HTML 页面。");
  for (const path of htmlFiles) {
    const html = await readFile(path, "utf8");
    const name = relative(siteDirectory, path).replaceAll("\\", "/");
    const isRedirect = /http-equiv=["']refresh["']/i.test(html);
    if (!isRedirect && !/<html\b[^>]*\blang=["']zh-CN["']/i.test(html)) fail(`${name} 缺少规范的 lang=zh-CN。`);
    if (!/<meta\b[^>]*charset=["']?utf-8/i.test(html)) fail(`${name} 缺少 UTF-8 charset。`);
    if (/\.pdf(?:$|[/?#&=])/im.test(html)) fail(`${name} 含有 PDF 地址。`);
    if (/\bjavascript\s*:/i.test(html)) fail(`${name} 含有 javascript: 地址。`);

    if (!isRedirect) {
      const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() || "";
      if (!title) fail(`${name} 缺少页面标题。`);
      const description = extractAttribute(html, /<meta\b[^>]*\bname=["']description["'][^>]*>/i, "content");
      if (!description) fail(`${name} 缺少 meta description。`);
      const canonical = extractAttribute(html, /<link\b[^>]*\brel=["']canonical["'][^>]*>/i, "href");
      if (!canonical.startsWith(`${expectedOrigin}/`)) fail(`${name} 的 canonical 地址不正确：${canonical || "缺失"}`);
      const ogLocale = extractAttribute(html, /<meta\b[^>]*\bproperty=["']og:locale["'][^>]*>/i, "content");
      if (ogLocale !== "zh_CN") fail(`${name} 的 og:locale 必须是 zh_CN。`);
      if (!/<meta\b[^>]*\bproperty=["']og:type["'][^>]*>/i.test(html)) fail(`${name} 缺少 og:type。`);
      const ogDescription = extractAttribute(html, /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/i, "content");
      if (!ogDescription) fail(`${name} 缺少 og:description。`);
      const ogUrl = extractAttribute(html, /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/i, "content");
      if (ogUrl !== canonical) fail(`${name} 的 og:url 与 canonical 不一致。`);
      const ogImage = extractAttribute(html, /<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i, "content");
      if (!ogImage.startsWith(`${expectedOrigin}/`)) fail(`${name} 的 og:image 不是完整站点地址。`);

      let hasPersonData = false;
      for (const scriptMatch of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
          const structuredData = JSON.parse(scriptMatch[1]);
          if (structuredData["@type"] === "Person") {
            hasPersonData = true;
            if (structuredData.name !== managedContent.profile.name) fail(`${name} 的 Person JSON-LD 姓名与内容源不一致。`);
          }
        } catch {
          fail(`${name} 含有无效的 JSON-LD。`);
        }
      }
      if (!hasPersonData) fail(`${name} 缺少 Person JSON-LD。`);
    }

    const pageUrl = new URL(documentUrlPath(siteDirectory, path), `${expectedOrigin}/`);
    for (const match of html.matchAll(/<(a|link|img|script)\b[^>]*\b(href|src)=["']([^"']+)["'][^>]*>/gi)) {
      const tag = match[0];
      const value = match[3].trim();
      if (!value || value.startsWith("#") || /^(?:mailto|tel|data|blob):/i.test(value)) continue;
      let url;
      try {
        url = new URL(value, pageUrl);
      } catch {
        fail(`${name} 含有无效地址：${value}`);
        continue;
      }
      if (url.origin === expectedOrigin && !(await resolveBuiltTarget(siteDirectory, url.pathname))) {
        fail(`${name} 的站内资源不存在：${value}`);
      }
      if (match[1].toLowerCase() === "a" && url.origin !== expectedOrigin && /target=["']_blank["']/i.test(tag)) {
        const relValue = extractAttribute(tag, /<a\b[^>]*>/i, "rel");
        if (!/\bnoopener\b/.test(relValue) || !/\bnoreferrer\b/.test(relValue)) {
          fail(`${name} 的外部新窗口链接缺少 noopener noreferrer：${value}`);
        }
      }
    }
  }

  const cssPath = resolve(siteDirectory, "assets", "css", "main.css");
  if (!(await exists(cssPath))) fail("构建产物缺少 assets/css/main.css。");
  else {
    const css = await readFile(cssPath, "utf8");
    for (const font of ["Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei"]) {
      if (!css.includes(font)) fail(`构建后的 CSS 缺少指定字体 ${font}。`);
    }
  }

  const manifestPath = resolve(siteDirectory, "images", "manifest.json");
  if (!(await exists(manifestPath))) fail("构建产物缺少 images/manifest.json。");
  else {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.name !== managedContent.meta.siteTitle) fail("Web App Manifest 名称与内容源不一致。");
    } catch {
      fail("构建后的 Web App Manifest 不是有效 JSON。");
    }
  }
}

const siteArgumentIndex = process.argv.indexOf("--site");
if (siteArgumentIndex >= 0) {
  const sitePath = process.argv[siteArgumentIndex + 1];
  if (!sitePath) fail("--site 后必须提供构建目录。");
  else await auditBuiltSite(resolve(repositoryRoot, sitePath));
} else {
  await auditSource();
}

if (errors.length > 0) {
  console.error("网站审计失败：");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(siteArgumentIndex >= 0 ? "构建产物审计通过。" : "发布前网站审计通过。");
}
