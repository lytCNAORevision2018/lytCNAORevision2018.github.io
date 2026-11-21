import http from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import {
  access,
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat
} from "node:fs/promises";
import {
  contentRevision,
  parseTalkDocumentFile,
  parseTalkDocumentPdf,
  talkDocumentFiles,
  sectionDefinitions,
  websiteProfileFields,
  websiteTextDefaults,
  toPublishedContent,
  validateContent
} from "./lib/content.mjs";

const execFileAsync = promisify(execFile);
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..", "..");
const publicDirectory = resolve(currentDirectory, "public");
const publishedContentPath = resolve(repositoryRoot, "_data", "site_content.json");
const localStateDirectory = resolve(repositoryRoot, ".site-manager");
const draftPath = resolve(localStateDirectory, "draft.json");
const pendingPublishPath = resolve(localStateDirectory, "pending-publish.json");
const draftTalkDocumentDirectory = resolve(localStateDirectory, "talk-documents");
const pdfTemporaryRoot = resolve(localStateDirectory, "pdf-temp");
const publishTalkTemporaryRoot = resolve(localStateDirectory, "publish-talk-documents");
const publicTalkDocumentDirectory = resolve(repositoryRoot, "images", "talk-documents");
const profileAvatarNames = ["profile-user.jpg", "profile-user.jpeg", "profile-user.png", "profile-user.webp"];
const profileAvatarPaths = profileAvatarNames.map((name) => resolve(repositoryRoot, "images", name));
const websiteAvatarNames = ["website-profile.jpg", "website-profile.jpeg", "website-profile.png", "website-profile.webp"];
const websiteAvatarPaths = websiteAvatarNames.map((name) => resolve(repositoryRoot, "images", name));
const allAvatarPaths = [...profileAvatarPaths, ...websiteAvatarPaths];
const host = "127.0.0.1";
const port = Number(process.env.SITE_MANAGER_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("SITE_MANAGER_PORT 必须是 1024 到 65535 之间的整数。");
const token = randomBytes(32).toString("base64url");
const maxRequestBytes = 30 * 1024 * 1024;
const maxTalkDocumentBytes = 50 * 1024 * 1024;
const maxPublishedTalkDocumentBytes = 200 * 1024 * 1024;
const maxTalkPageBytes = 5 * 1024 * 1024;
const externalReferenceProbeBytes = 4096;
const execOptions = { cwd: repositoryRoot, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 };
const validationBranchPrefix = "site-manager-validation";
const validationWorkflowName = "Validate website content";
const validationWorkflowPath = ".github/workflows/validate-content.yml";
const validationRunDiscoveryTimeoutMs = 5 * 60 * 1000;
const validationRunTimeoutMs = 20 * 60 * 1000;
const validationPollIntervalMs = 45 * 1000;
const githubApiToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const bootstrapBaseCommit = "f8869e14f24584750528a12fbd8eb68fb1d9d558";

const bootstrapManagedPaths = [
  ".github/workflows/validate-content.yml",
  ".github/workflows/scrape_talks.yml",
  ".gitignore",
  "CONTRIBUTING.md",
  "README.md",
  "package.json",
  "_config.yml",
  "_data/authors.yml",
  "_data/comments",
  "_data/navigation.yml",
  "_data/cv.json",
  "_data/site_content.json",
  "_includes/author-profile.html",
  "_includes/archive-single.html",
  "_includes/content",
  "_includes/cv-template.html",
  "_includes/footer.html",
  "_includes/head.html",
  "_includes/masthead.html",
  "_includes/page__hero.html",
  "_includes/seo.html",
  "_layouts/cv-layout.html",
  "_layouts/default.html",
  "_layouts/single.html",
  "_drafts",
  "_pages/404.md",
  "_pages/about.md",
  "_pages/archive-layout-with-content.md",
  "_pages/category-archive.html",
  "_pages/collection-archive.html",
  "_pages/cv-json.md",
  "_pages/cv.md",
  "_pages/honors-awards.md",
  "_pages/interships.md",
  "_pages/markdown.md",
  "_pages/notes-exercises.md",
  "_pages/non-menu-page.md",
  "_pages/outside-research.md",
  "_pages/portfolio.html",
  "_pages/publications.html",
  "_pages/page-archive.html",
  "_pages/research-competitions.md",
  "_pages/sitemap.md",
  "_pages/talks-presentations.md",
  "_pages/tag-archive.html",
  "_pages/talkmap.html",
  "_pages/talks.html",
  "_pages/teaching.html",
  "_pages/terms.md",
  "_pages/year-archive.html",
  "_posts",
  "_publications",
  "_talks",
  "_teaching",
  "_portfolio",
  "_honors-awards",
  "_internships",
  "_notes-exercises",
  "_outside-research",
  "_research-competitions",
  "_talks-presentations",
  "_sass/layout/_managed_content.scss",
  "_sass/layout/_base.scss",
  "_sass/layout/_json_cv.scss",
  "_sass/_themes.scss",
  "assets/css/main.scss",
  "files/bibtex1.bib",
  "files/paper1.pdf",
  "files/paper2.pdf",
  "files/paper3.pdf",
  "files/slides1.pdf",
  "files/slides2.pdf",
  "files/slides3.pdf",
  "images/500x300.png",
  "images/bio-photo-2.jpg",
  "images/bio-photo.jpg",
  "images/editing-talk.png",
  "images/profile.png",
  "images/profile-user.jpg",
  "images/profile-user.jpeg",
  "images/profile-user.png",
  "images/profile-user.webp",
  "images/manifest.json",
  "images/talk-documents",
  "markdown_generator",
  "scripts/validate-content.mjs",
  "scripts/audit-site.mjs",
  "scripts/test-content.mjs",
  "scripts/test-site-manager.mjs",
  "talkmap",
  "talkmap.ipynb",
  "talkmap.py",
  "talkmap_out.ipynb",
  "tools/site-manager",
  "主页管理器.cmd",
  "维护主页说明.md"
];

const dailyManagedPaths = [
  "_data/site_content.json",
  "images/profile-user.jpg",
  "images/profile-user.jpeg",
  "images/profile-user.png",
  "images/profile-user.webp",
  "images/talk-documents",
  ...websiteAvatarNames.map((name) => `images/${name}`)
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

let operationQueue = Promise.resolve();
let pdfToolStatusPromise;

function enqueue(operation) {
  const queued = operationQueue.then(operation, operation);
  operationQueue = queued.catch(() => undefined);
  return queued;
}

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function errorResponse(response, statusCode, message, details = []) {
  jsonResponse(response, statusCode, { ok: false, message, details });
}

function clientError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${relative(dirname(path), path)}.${process.pid}.${Date.now()}.tmp`);
  let handle;
  try {
    handle = await open(temporaryPath, "wx");
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await rename(temporaryPath, path);
        return;
      } catch (error) {
        if (!["EBUSY", "EPERM"].includes(error.code) || attempt === 3) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50 * (attempt + 1)));
      }
    }
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function snapshotOptionalFiles(paths) {
  const snapshot = new Map();
  for (const path of paths) {
    snapshot.set(path, await exists(path) ? await readFile(path) : undefined);
  }
  return snapshot;
}

async function restoreOptionalFiles(snapshot) {
  for (const [path, value] of snapshot) {
    if (value === undefined) await rm(path, { force: true });
    else await atomicWrite(path, value);
  }
}

async function popplerExecutable(name) {
  const candidates = [];
  if (process.platform === "win32" && process.env.USERPROFILE) {
    candidates.push(join(
      process.env.USERPROFILE,
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "native",
      "poppler",
      "Library",
      "bin",
      `${name}.exe`
    ));
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", `${name}.exe`));
    }
    if (process.env.ProgramFiles) {
      candidates.push(join(process.env.ProgramFiles, "poppler", "Library", "bin", `${name}.exe`));
      candidates.push(join(process.env.ProgramFiles, "poppler", "bin", `${name}.exe`));
    }
  }
  candidates.push(name);
  for (const candidate of candidates) {
    if (candidate !== name && !(await exists(candidate))) continue;
    try {
      await execFileAsync(candidate, ["-v"], { ...execOptions, timeout: 15000 });
      return candidate;
    } catch (error) {
      if (candidate !== name && error.code !== 99) continue;
      if (candidate === name && error.code === "ENOENT") continue;
      return candidate;
    }
  }
  throw clientError("未找到 PDF 转换组件 Poppler。请在当前电脑安装 Poppler 后重试。", 503);
}

function getPdfToolStatus() {
  if (!pdfToolStatusPromise) {
    pdfToolStatusPromise = Promise.all([
      popplerExecutable("pdfinfo"),
      popplerExecutable("pdftoppm")
    ]).then(() => ({ available: true, message: "PDF 转换组件可用。" }))
      .catch(() => ({
        available: false,
        message: "未检测到 Poppler，暂时不能转换为逐页图片。"
      }));
  }
  return pdfToolStatusPromise;
}

async function copyDirectory(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = join(sourceDirectory, entry.name);
    const targetPath = join(targetDirectory, entry.name);
    if (entry.isDirectory()) await copyDirectory(sourcePath, targetPath);
    else if (entry.isFile()) await copyFile(sourcePath, targetPath);
    else throw new Error(`不支持的文件类型：${sourcePath}`);
  }
}

async function replaceDirectory(sourceDirectory, targetDirectory) {
  const parentDirectory = dirname(targetDirectory);
  const targetName = basename(targetDirectory);
  const suffix = randomBytes(6).toString("hex");
  const stagedDirectory = join(parentDirectory, `.${targetName}-new-${suffix}`);
  const oldDirectory = join(parentDirectory, `.${targetName}-old-${suffix}`);
  await mkdir(parentDirectory, { recursive: true });
  try {
    await copyDirectory(sourceDirectory, stagedDirectory);
    const hadTarget = await exists(targetDirectory);
    if (hadTarget) await rename(targetDirectory, oldDirectory);
    try {
      await rename(stagedDirectory, targetDirectory);
    } catch (error) {
      if (hadTarget && await exists(oldDirectory)) await rename(oldDirectory, targetDirectory).catch(() => undefined);
      throw error;
    }
    await rm(oldDirectory, { recursive: true, force: true });
  } finally {
    await rm(stagedDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function pageNumber(name) {
  return Number(name.match(/(\d+)(?=\.[^.]+$)/)?.[1] || 0);
}

function validatePdfBytes(bytes) {
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) throw clientError("PDF 文件必须小于 20 MB。");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-" || !bytes.includes(Buffer.from("%%EOF"))) throw clientError("文件不是完整的 PDF。");
}

async function renderTalkPdf(itemId, bytes, mode = "images") {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(itemId || "")) throw clientError("讲座条目 ID 不合法。");
  if (!["images", "pdf"].includes(mode)) throw clientError("讲义展示方式不正确。");
  validatePdfBytes(bytes);

  const documentId = `doc-${randomBytes(10).toString("hex")}`;
  const temporaryDirectory = resolve(pdfTemporaryRoot, randomBytes(10).toString("hex"));
  const inputPath = join(temporaryDirectory, "source.pdf");
  const outputPrefix = join(temporaryDirectory, "rendered-page");
  const normalizedDirectory = join(temporaryDirectory, "normalized");
  let processingError;
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    await atomicWrite(inputPath, bytes);
    await mkdir(normalizedDirectory, { recursive: true });
    await copyFile(inputPath, join(normalizedDirectory, "document.pdf"));
    const pdf = `/images/talk-documents/${itemId}/${documentId}/document.pdf`;
    if (mode === "pdf") {
      await replaceDirectory(normalizedDirectory, resolve(draftTalkDocumentDirectory, itemId, documentId));
      return { documentId, mode, pdf, pages: [] };
    }
    const [pdfinfo, pdftoppm] = await Promise.all([
      popplerExecutable("pdfinfo"),
      popplerExecutable("pdftoppm")
    ]);
    const { stdout: infoOutput } = await execFileAsync(pdfinfo, [inputPath], {
      ...execOptions,
      timeout: 30000
    });
    const pageCount = Number(infoOutput.match(/^Pages:\s+(\d+)\s*$/m)?.[1] || 0);
    if (pageCount < 1) throw clientError("无法读取 PDF 页数，文件可能已损坏或加密。");
    if (pageCount > 80) throw clientError("讲义最多支持 80 页，请拆分后再上传。");

    await execFileAsync(pdftoppm, [
      "-jpeg",
      "-jpegopt", "quality=90,optimize=y,progressive=y",
      "-scale-to", "2200",
      "-cropbox",
      inputPath,
      outputPrefix
    ], { ...execOptions, timeout: 180000 });

    const renderedFiles = (await readdir(temporaryDirectory))
      .filter((name) => /^rendered-page-\d+\.jpg$/i.test(name))
      .sort((left, right) => pageNumber(left) - pageNumber(right));
    if (renderedFiles.length !== pageCount) {
      throw clientError(`PDF 转换不完整：应有 ${pageCount} 页，实际生成 ${renderedFiles.length} 页。`);
    }

    await mkdir(normalizedDirectory, { recursive: true });
    let totalBytes = 0;
    for (let index = 0; index < renderedFiles.length; index += 1) {
      const outputName = `page-${String(index + 1).padStart(3, "0")}.jpg`;
      const sourcePath = join(temporaryDirectory, renderedFiles[index]);
      const fileStat = await stat(sourcePath);
      if (fileStat.size > maxTalkPageBytes) throw clientError(`讲义第 ${index + 1} 页转换后超过 5 MB，请压缩或拆分 PDF。`);
      totalBytes += fileStat.size;
      if (totalBytes > maxTalkDocumentBytes) throw clientError("讲义页面图片合计超过 50 MB，请压缩或拆分 PDF。");
      const signature = (await readFile(sourcePath)).subarray(0, 3).toString("hex");
      if (signature !== "ffd8ff") throw clientError(`讲义第 ${index + 1} 页未生成有效的 JPEG 图片。`);
      await copyFile(sourcePath, join(normalizedDirectory, outputName));
    }
    await replaceDirectory(normalizedDirectory, resolve(draftTalkDocumentDirectory, itemId, documentId));
    return {
      documentId,
      mode,
      pdf,
      pages: renderedFiles.map((_, index) => `/images/talk-documents/${itemId}/${documentId}/page-${String(index + 1).padStart(3, "0")}.jpg`)
    };
  } catch (error) {
    processingError = error.statusCode
      ? error
      : clientError(`PDF 转换失败：${String(error.stderr || error.message).trim()}`, 422);
    throw processingError;
  } finally {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch (error) {
      const cleanupMessage = `临时 PDF 目录删除失败：${error.message}。请关闭占用文件的程序，并检查 .site-manager/pdf-temp/`;
      if (processingError) processingError.message = `${processingError.message}\n${cleanupMessage}`;
      else throw clientError(`讲义已处理，但${cleanupMessage}`, 500);
    }
  }
}

async function materializeDraftTalkDocuments(content, publishedContent) {
  const publishedPages = new Set((publishedContent.talks || []).flatMap(talkDocumentFiles));
  for (const talk of content.talks || []) {
    for (const page of talkDocumentFiles(talk)) {
      const parsed = parseTalkDocumentFile(page);
      if (!parsed || parsed.itemId !== talk.id) {
        throw clientError(`讲座“${talk.title}”包含不安全的讲义页面路径。`);
      }
      if (publishedPages.has(page)) continue;
      const draftFile = resolve(draftTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
      if (await exists(draftFile)) continue;
      const publicFile = resolve(publicTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
      if (!(await exists(publicFile))) {
        throw clientError(`讲座“${talk.title}”缺少已转换的讲义页面：${page}`);
      }
      await mkdir(dirname(draftFile), { recursive: true });
      await copyFile(publicFile, draftFile);
    }
  }
}

async function syncPublishedTalkDocuments(content) {
  const stagedRoot = resolve(publishTalkTemporaryRoot, randomBytes(10).toString("hex"));
  await mkdir(stagedRoot, { recursive: true });
  try {
    const copiedPages = new Set();
    let totalBytes = 0;
    for (const talk of content.talks) {
      for (const page of talkDocumentFiles(talk)) {
        const parsed = parseTalkDocumentFile(page);
        if (!parsed || parsed.itemId !== talk.id) throw clientError(`讲座“${talk.title}”包含不安全的讲义页面路径。`);
        const relativePage = `${parsed.itemId}/${parsed.documentId}/${parsed.fileName}`;
        if (copiedPages.has(relativePage)) continue;
        const draftFile = resolve(draftTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
        const publicFile = resolve(publicTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
        const sourceFile = await exists(draftFile) ? draftFile : publicFile;
        if (!(await exists(sourceFile))) throw clientError(`讲座“${talk.title}”缺少已转换的讲义页面：${page}`);
        const sourceStat = await stat(sourceFile);
        if (!sourceStat.isFile()) throw clientError(`讲座“${talk.title}”的讲义页面不是普通文件：${page}`);
        if (parsed.fileName === "document.pdf") validatePdfBytes(await readFile(sourceFile));
        totalBytes += sourceStat.size;
        if (totalBytes > maxPublishedTalkDocumentBytes) {
          throw clientError("所有公开讲义文件合计超过 200 MB，请移除旧讲义或压缩后再发布。");
        }
        const destination = resolve(stagedRoot, parsed.itemId, parsed.documentId, parsed.fileName);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(sourceFile, destination);
        copiedPages.add(relativePage);
      }
    }
    await replaceDirectory(stagedRoot, publicTalkDocumentDirectory);
  } finally {
    await rm(stagedRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function syncPublishedAvatar(content) {
  const references = new Set([content.profile?.avatar, content.website?.profile?.avatar]);
  for (const avatarPath of allAvatarPaths) {
    if (references.has(basename(avatarPath))) {
      if (!(await exists(avatarPath))) throw clientError(`头像文件不存在：images/${basename(avatarPath)}`);
    } else await rm(avatarPath, { force: true });
  }
}

function avatarTarget(content, scope) {
  if (scope !== undefined && !["profile", "website"].includes(scope)) throw clientError("头像用途不正确。");
  if (scope === "website") {
    content.website ||= {};
    content.website.profile ||= {};
    return { profile: content.website.profile, prefix: "website-profile", paths: websiteAvatarPaths };
  }
  return { profile: content.profile, prefix: "profile-user", paths: profileAvatarPaths };
}

async function validateTalkDocumentFiles(content) {
  for (const talk of content.talks || []) {
    for (const page of talkDocumentFiles(talk)) {
      const parsed = parseTalkDocumentFile(page);
      if (!parsed || parsed.itemId !== talk.id) continue;
      const draftFile = resolve(draftTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
      const publicFile = resolve(publicTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
      if (!(await exists(draftFile)) && !(await exists(publicFile))) {
        throw clientError(`讲座“${talk.title}”引用的讲义预览已失效，请重新选择 PDF：${page}`);
      }
      if (parsed.fileName === "document.pdf") validatePdfBytes(await readFile(await exists(draftFile) ? draftFile : publicFile));
    }
  }
}

async function pruneDraftTalkDocuments(content) {
  if (!(await exists(draftTalkDocumentDirectory))) return;
  const referenced = new Set();
  for (const talk of content.talks || []) {
    for (const page of talkDocumentFiles(talk)) {
      const parsed = parseTalkDocumentFile(page);
      if (parsed) referenced.add(`${parsed.itemId}/${parsed.documentId}`);
    }
  }
  for (const itemEntry of await readdir(draftTalkDocumentDirectory, { withFileTypes: true })) {
    const itemPath = join(draftTalkDocumentDirectory, itemEntry.name);
    if (!itemEntry.isDirectory()) {
      await rm(itemPath, { recursive: true, force: true });
      continue;
    }
    for (const documentEntry of await readdir(itemPath, { withFileTypes: true })) {
      const documentPath = join(itemPath, documentEntry.name);
      if (!documentEntry.isDirectory() || !referenced.has(`${itemEntry.name}/${documentEntry.name}`)) {
        await rm(documentPath, { recursive: true, force: true });
      }
    }
    if ((await readdir(itemPath)).length === 0) await rm(itemPath, { recursive: true, force: true });
  }
}

async function backupDraft() {
  if (!(await exists(draftPath))) return;
  const baseDirectory = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || repositoryRoot, "AppData", "Local");
  const backupDirectory = join(baseDirectory, "PersonalSiteManager", "backups");
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(draftPath, join(backupDirectory, `draft-${stamp}.json`));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function currentHeadCommit() {
  const { stdout } = await git(["rev-parse", "HEAD"]);
  return stdout.trim();
}

async function reconciledDraftBaseCommit(content, storedBaseCommit, headCommit) {
  if (!storedBaseCommit || storedBaseCommit === headCommit) return storedBaseCommit || headCommit;
  try {
    if (await exists(pendingPublishPath)) {
      const pending = await readJson(pendingPublishPath);
      if (pending?.managerPendingPublishVersion === 1
        && pending.commit === headCommit
        && pending.baseCommit === storedBaseCommit) {
        return storedBaseCommit;
      }
    }
    await git(["merge-base", "--is-ancestor", storedBaseCommit, headCommit]);
    const published = await readJson(publishedContentPath);
    const projected = toPublishedContent(content, published.meta?.lastUpdated || content.meta?.lastUpdated || shanghaiDate());
    if (contentRevision(projected) === contentRevision(published)) return headCommit;
  } catch {
    // Keep the stored base until Git ancestry and the public content agree.
  }
  return storedBaseCommit;
}

async function readWorkingContent() {
  const headCommit = await currentHeadCommit();
  if (await exists(draftPath)) {
    const rawDraft = await readJson(draftPath);
    const isEnvelope = rawDraft?.managerDraftVersion === 1 && rawDraft.content;
    const content = isEnvelope ? rawDraft.content : rawDraft;
    const storedBaseCommit = isEnvelope && rawDraft.baseCommit ? rawDraft.baseCommit : headCommit;
    return {
      content,
      revision: contentRevision(content),
      source: "draft",
      baseCommit: await reconciledDraftBaseCommit(content, storedBaseCommit, headCommit),
      headCommit
    };
  }
  const content = await readJson(publishedContentPath);
  return { content, revision: contentRevision(content), source: "published", baseCommit: headCommit, headCommit };
}

async function saveDraft(content, baseRevision, baseCommit, { pruneTalkDocuments = false } = {}) {
  const current = await readWorkingContent();
  if (baseRevision && current.revision !== baseRevision) {
    const error = new Error("内容已在另一个窗口或外部工具中发生变化，请重新载入后再保存。");
    error.statusCode = 409;
    throw error;
  }
  const errors = validateContent(content);
  if (errors.length > 0) {
    const error = new Error("内容校验未通过。");
    error.statusCode = 422;
    error.details = errors;
    throw error;
  }
  await validateTalkDocumentFiles(content);
  await backupDraft();
  const draftBaseCommit = baseCommit && baseCommit === current.headCommit
    ? baseCommit
    : (current.source === "draft" ? current.baseCommit : current.headCommit);
  const serialized = `${JSON.stringify({
    managerDraftVersion: 1,
    baseCommit: draftBaseCommit,
    content
  }, null, 2)}\n`;
  await atomicWrite(draftPath, serialized);
  if (pruneTalkDocuments) {
    await pruneDraftTalkDocuments(content).catch((error) => {
      console.warn(`无法清理未引用的本地讲义页面：${error.message}`);
    });
  }
  return { revision: contentRevision(content), baseCommit: draftBaseCommit };
}

async function updateDraftBaseCommit(baseCommit, fallbackContent) {
  if (!(await exists(draftPath))) {
    if (!fallbackContent) return;
    await atomicWrite(draftPath, `${JSON.stringify({
      managerDraftVersion: 1,
      baseCommit,
      content: fallbackContent
    }, null, 2)}\n`);
    return;
  }
  const working = await readWorkingContent();
  await atomicWrite(draftPath, `${JSON.stringify({
    managerDraftVersion: 1,
    baseCommit,
    content: working.content
  }, null, 2)}\n`);
}

async function readBody(request) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    const error = new Error("请求必须使用 application/json。");
    error.statusCode = 415;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) {
      const error = new Error("请求内容过大。");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("请求 JSON 格式不正确。");
    error.statusCode = 400;
    throw error;
  }
}

async function git(args, options = {}) {
  return execFileAsync("git", args, { ...execOptions, ...options });
}

function githubRepositoryFromRemote(remote) {
  const value = String(remote || "").trim();
  let hostname;
  let pathname;
  const scpStyle = value.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
  try {
    if (scpStyle && !value.includes("://")) {
      [, hostname, pathname] = scpStyle;
    } else {
      const parsed = new URL(value);
      hostname = parsed.hostname;
      pathname = parsed.pathname;
    }
  } catch {
    throw clientError("无法从 origin 地址识别 GitHub 仓库，云端发布校验无法启动。", 503);
  }
  if (hostname.toLowerCase() !== "github.com") {
    throw clientError("当前 origin 不是 github.com 仓库，管理器无法通过 GitHub Actions 执行发布门禁。", 503);
  }
  const parts = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw clientError("origin 中的 GitHub 仓库地址格式不正确，云端发布校验无法启动。", 503);
  }
  return { owner: parts[0], repository: parts[1] };
}

async function githubJson(url) {
  let response;
  let tokenFailureStatus;
  const authorizationValues = githubApiToken ? [`Bearer ${githubApiToken}`, ""] : [""];
  for (const authorization of authorizationValues) {
    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "Yutong-Li-Site-Manager/1.0",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (authorization) headers.Authorization = authorization;
    try {
      response = await fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(15000)
      });
    } catch (cause) {
      const error = clientError(`暂时无法连接 GitHub Actions：${cause.message}`, 503);
      error.retryable = true;
      throw error;
    }
    if (response.ok || !authorization || ![401, 403, 404].includes(response.status)) break;
    tokenFailureStatus = response.status;
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  const body = await response.text();
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    if (response.ok) {
      const error = clientError("GitHub Actions 返回了无法解析的状态响应。", 503);
      error.retryable = true;
      throw error;
    }
  }
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const resetAt = Number(response.headers.get("x-ratelimit-reset"));
    const resetMessage = remaining === "0" && Number.isFinite(resetAt)
      ? `；API 限额预计于 ${new Date(resetAt * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 恢复`
      : "";
    const accessMessage = tokenFailureStatus
      ? `；已配置的 GITHUB_TOKEN/GH_TOKEN 返回 HTTP ${tokenFailureStatus}，请检查 token 是否有效且具有 Actions 读取权限`
      : (!githubApiToken && response.status === 403
        ? "；当前使用匿名 API 查询，可配置具有 Actions 读取权限的 GITHUB_TOKEN 或 GH_TOKEN 提高限额"
        : "");
    const error = clientError(
      `GitHub Actions 状态查询失败（HTTP ${response.status}）：${payload.message || "未知错误"}${resetMessage}${accessMessage}`,
      503
    );
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  return payload;
}

function matchesValidationRun(run, branch, commit) {
  const workflowPath = String(run?.path || "").split("@")[0].replaceAll("\\", "/");
  return run?.event === "push"
    && run?.head_branch === branch
    && run?.head_sha === commit
    && run?.name === validationWorkflowName
    && workflowPath === validationWorkflowPath;
}

function validationRunError(run) {
  const conclusionLabels = {
    action_required: "需要人工批准",
    cancelled: "已取消",
    failure: "失败",
    neutral: "未明确成功",
    skipped: "已跳过",
    stale: "已失效",
    startup_failure: "启动失败",
    timed_out: "超时"
  };
  const conclusion = conclusionLabels[run.conclusion] || run.conclusion || "状态未知";
  const error = clientError(`云端发布校验${conclusion}，未向 master 推送。`, 422);
  error.details = [
    `候选提交：${run.head_sha}`,
    ...(run.html_url ? [`GitHub Actions：${run.html_url}`] : [])
  ];
  return error;
}

async function waitForValidationRun(remote, branch, commit) {
  const { owner, repository } = githubRepositoryFromRemote(remote);
  const apiRoot = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const startedAt = Date.now();
  const discoveryDeadline = startedAt + validationRunDiscoveryTimeoutMs;
  const completionDeadline = startedAt + validationRunTimeoutMs;
  let runId;
  let lastTransientError;

  while (Date.now() < completionDeadline) {
    try {
      let run;
      if (runId) {
        const candidate = await githubJson(`${apiRoot}/actions/runs/${runId}`);
        if (!matchesValidationRun(candidate, branch, commit)) {
          throw clientError("GitHub Actions 返回了与候选提交不一致的运行记录，已停止发布。", 503);
        }
        run = candidate;
      } else {
        const url = new URL(`${apiRoot}/actions/runs`);
        url.searchParams.set("branch", branch);
        url.searchParams.set("event", "push");
        url.searchParams.set("head_sha", commit);
        url.searchParams.set("per_page", "10");
        const payload = await githubJson(url);
        run = Array.isArray(payload.workflow_runs)
          ? payload.workflow_runs.find((candidate) => matchesValidationRun(candidate, branch, commit))
          : undefined;
        if (run) runId = run.id;
      }

      lastTransientError = undefined;
      if (run?.status === "completed") {
        if (run.conclusion === "success") {
          return { runId: run.id, runUrl: run.html_url || "" };
        }
        throw validationRunError(run);
      }
      if (!run && Date.now() >= discoveryDeadline) {
        const error = clientError("候选分支已推送，但 GitHub Actions 在 5 分钟内没有启动发布校验；未向 master 推送。", 504);
        error.details = [`候选提交：${commit}`];
        throw error;
      }
    } catch (error) {
      if (!error.retryable) throw error;
      lastTransientError = error;
    }

    const remaining = completionDeadline - Date.now();
    if (remaining > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(validationPollIntervalMs, remaining)));
    }
  }

  const error = clientError("GitHub Actions 未在 20 分钟内完成发布校验；未向 master 推送。", 504);
  error.details = [
    `候选提交：${commit}`,
    ...(lastTransientError ? [`最后一次状态查询错误：${lastTransientError.message}`] : [])
  ];
  throw error;
}

async function removeRemoteValidationBranch(branch) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await git(["push", "origin", "--delete", branch], { timeout: 60000 });
      return;
    } catch (error) {
      const output = `${error.stdout || ""}\n${error.stderr || ""}`;
      if (/remote ref does not exist|unable to delete .* remote ref does not exist/i.test(output)) return;
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1000));
      }
    }
  }
  throw lastError || new Error("未知的远端分支删除错误。");
}

async function historicalPdfPaths(revision) {
  const { stdout } = await git(["rev-list", "--objects", revision]);
  return [...new Set(stdout.split(/\r?\n/)
    .map((line) => line.slice(line.indexOf(" ") + 1).trim())
    .filter((path) => path && /\.pdf$/i.test(path)))].sort();
}

async function gitStatus({ requireDivergence = false } = {}) {
  const [{ stdout: branchOutput }, { stdout: statusOutput }, { stdout: remoteOutput }] = await Promise.all([
    git(["branch", "--show-current"]),
    git(["-c", "core.quotepath=false", "status", "--short", "--untracked-files=all"]),
    git(["remote", "get-url", "origin"])
  ]);
  let ahead = 0;
  let behind = 0;
  try {
    const { stdout } = await git(["rev-list", "--left-right", "--count", "HEAD...origin/master"]);
    const [localAhead, localBehind] = stdout.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(localAhead) || localAhead < 0 || !Number.isInteger(localBehind) || localBehind < 0) {
      throw new Error(`无法解析 Git 分歧计数：${stdout.trim()}`);
    }
    ahead = localAhead;
    behind = localBehind;
  } catch (error) {
    if (requireDivergence) {
      const wrapped = new Error(`无法确认本地与 origin/master 的提交关系，已停止发布：${String(error.stderr || error.message).trim()}`);
      wrapped.statusCode = 503;
      throw wrapped;
    }
    // The first fetch may not have created origin/master yet.
  }
  return {
    branch: branchOutput.trim(),
    remote: remoteOutput.trim(),
    changes: statusOutput ? statusOutput.replace(/\r?\n$/, "").split(/\r?\n/) : [],
    ahead,
    behind
  };
}

function normalizedGitPath(statusLine) {
  const path = statusLine.slice(3).trim();
  return path.includes(" -> ") ? path.split(" -> ").at(-1) : path;
}

function isManagedPath(path, allowedPaths) {
  const normalized = path.replaceAll("\\", "/");
  return allowedPaths.some((managed) => normalized === managed || normalized.startsWith(`${managed}/`));
}

async function ensureManagedCommitRange(baseRevision, headRevision, allowedPaths) {
  try {
    await git(["merge-base", "--is-ancestor", baseRevision, headRevision]);
  } catch {
    const error = new Error("本地提交不是当前 origin/master 的快进后继，管理器已停止发布。");
    error.statusCode = 409;
    throw error;
  }
  const { stdout } = await git([
    "log",
    "--format=",
    "--name-only",
    "-z",
    "--no-renames",
    `${baseRevision}..${headRevision}`
  ]);
  const unrelated = stdout.split("\0").filter(Boolean).filter((path) => !isManagedPath(path, allowedPaths));
  if (unrelated.length > 0) {
    const error = new Error("本地已有提交包含不属于主页管理器的文件，已停止发布，避免把其他工作一并推送。");
    error.statusCode = 409;
    error.details = unrelated;
    throw error;
  }
}

async function managedTreeDelta(baseRevision, headRevision, allowedPaths) {
  const { stdout } = await git([
    "diff",
    "--raw",
    "-z",
    "--no-renames",
    baseRevision,
    headRevision,
    "--",
    ...allowedPaths
  ]);
  return stdout;
}

async function committedPublicContentRevision(commit) {
  try {
    const { stdout } = await git(["show", `${commit}:_data/site_content.json`]);
    return contentRevision(JSON.parse(stdout));
  } catch {
    throw clientError("本地候选提交中的公开内容无法读取，管理器已拒绝继续发布。", 409);
  }
}

async function assertHeadCommit(expectedCommit, message) {
  const actualCommit = await currentHeadCommit();
  if (actualCommit === expectedCommit) return actualCommit;
  const error = new Error(message || "本地 HEAD 在发布过程中发生变化，已停止发布。");
  error.statusCode = 409;
  error.details = [`预期 HEAD：${expectedCommit}`, `当前 HEAD：${actualCommit}`];
  throw error;
}

async function verifyCandidateForContent(baseCommit, bootstrapMode, expectedPublishedRevision) {
  const receipt = await verifyPendingCandidate(baseCommit, bootstrapMode);
  if (receipt.publishedRevision !== expectedPublishedRevision) {
    const error = new Error("候选提交中的公开内容与本次发布内容不一致，已停止发布。");
    error.statusCode = 409;
    error.details = [
      `预期公开内容 revision：${expectedPublishedRevision}`,
      `候选公开内容 revision：${receipt.publishedRevision}`
    ];
    throw error;
  }
  return receipt;
}

async function recordPendingCandidate(baseCommit, bootstrapMode) {
  const commit = await currentHeadCommit();
  const publishedRevision = await committedPublicContentRevision(commit);
  await mkdir(localStateDirectory, { recursive: true });
  await atomicWrite(pendingPublishPath, `${JSON.stringify({
    managerPendingPublishVersion: 1,
    commit,
    baseCommit,
    bootstrapMode,
    publishedRevision,
    recordedAt: new Date().toISOString()
  }, null, 2)}\n`);
  return { commit, baseCommit, bootstrapMode, publishedRevision };
}

async function verifyPendingCandidate(remoteCommit, bootstrapMode) {
  let receipt;
  try {
    receipt = await readJson(pendingPublishPath);
  } catch {
    const error = new Error("本地存在尚未推送的提交，但没有可验证的管理器候选收据。为避免把手工提交或中间版本带入公开历史，已停止发布。");
    error.statusCode = 409;
    throw error;
  }
  const headCommit = await currentHeadCommit();
  const { stdout: parentLine } = await git(["rev-list", "--parents", "-n", "1", headCommit]);
  const parents = parentLine.trim().split(/\s+/).slice(1);
  const publishedRevision = await committedPublicContentRevision(headCommit);
  const valid = receipt?.managerPendingPublishVersion === 1
    && receipt.commit === headCommit
    && receipt.baseCommit === remoteCommit
    && receipt.bootstrapMode === bootstrapMode
    && receipt.publishedRevision === publishedRevision
    && parents.length === 1
    && parents[0] === remoteCommit;
  if (!valid) {
    const error = new Error("本地尚未推送的提交与管理器候选收据不一致，已停止发布，避免泄露手工或中间提交历史。");
    error.statusCode = 409;
    error.details = [
      `当前 HEAD：${headCommit}`,
      `远端基准：${remoteCommit}`,
      "请保留 .site-manager 和 git status 输出，人工核对后再处理。"
    ];
    throw error;
  }
  return receipt;
}

async function stageableManagedPaths(allowedPaths) {
  const paths = [];
  for (const managed of allowedPaths) {
    if (await exists(resolve(repositoryRoot, managed))) {
      paths.push(managed);
      continue;
    }
    try {
      await git(["ls-files", "--error-unmatch", "--", managed]);
      paths.push(managed);
    } catch {
      // Optional managed files, such as an uploaded avatar, may not exist yet.
    }
  }
  return paths;
}

async function ensurePublishState() {
  const gitDirectory = resolve(repositoryRoot, ".git");
  const blockers = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "index.lock", "rebase-apply", "rebase-merge"];
  for (const blocker of blockers) {
    if (await exists(resolve(gitDirectory, blocker))) {
      throw new Error(`Git 当前存在未完成操作（${blocker}），请先在终端处理后再发布。`);
    }
  }
  let status = await gitStatus();
  if (status.branch !== "master") throw new Error(`当前分支为 ${status.branch || "未知"}，管理器只允许从 master 发布。`);
  await git(["fetch", "origin", "master"]);
  const { stdout: remoteOutput } = await git(["rev-parse", "origin/master"]);
  const remoteCommit = remoteOutput.trim();
  const bootstrapMode = remoteCommit === bootstrapBaseCommit;
  const allowedPaths = bootstrapMode ? bootstrapManagedPaths : dailyManagedPaths;
  status = await gitStatus({ requireDivergence: true });
  const unrelated = status.changes.filter((line) => !isManagedPath(normalizedGitPath(line), allowedPaths));
  if (unrelated.length > 0) {
    const error = new Error("仓库中存在不属于主页管理器的修改，已停止发布以免误提交。");
    error.details = unrelated;
    throw error;
  }
  let pendingCandidate;
  if (status.ahead > 0) {
    await ensureManagedCommitRange("origin/master", "HEAD", allowedPaths);
    pendingCandidate = await verifyPendingCandidate(remoteCommit, bootstrapMode);
  } else {
    await rm(pendingPublishPath, { force: true }).catch(() => undefined);
  }
  return { ...status, remoteCommit, bootstrapMode, allowedPaths, pendingCandidate };
}

function shanghaiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function externalReferences(content) {
  const references = new Map();
  const add = (url, label) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) references.set(url, label);
  };
  add(content.meta?.siteUrl, "站点地址");
  for (const [name, url] of Object.entries(content.profile?.links || {})) add(url, `个人链接 ${name}`);
  if (/^https?:\/\//i.test(content.profile?.avatar || "")) add(content.profile.avatar, "头像");
  add(content.website?.profile?.avatar, "网站独立头像");
  for (const section of sectionDefinitions) {
    for (const item of content[section.key] || []) {
      for (const link of item.links || []) add(link.url, `${section.label}“${item.title}”`);
    }
  }
  return [...references.entries()].map(([url, label]) => ({ url, label }));
}

function containsPdfMarker(value) {
  let normalized = String(value || "");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return /\.pdf(?:$|[\s'";/?#&=])/i.test(normalized)
    || /(?:^|[?&#;\s])(?:format|type|download|file|filename)\*?=[^&#;]*\bpdf\b/i.test(normalized)
    || /application\/pdf/i.test(normalized);
}

function responseIsPdf(response) {
  const contentType = response.headers.get("content-type") || "";
  const disposition = response.headers.get("content-disposition") || "";
  return /application\/pdf/i.test(contentType)
    || containsPdfMarker(disposition)
    || containsPdfMarker(response.url);
}

async function readResponsePrefix(response, maximumBytes = externalReferenceProbeBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (totalBytes < maximumBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maximumBytes - totalBytes;
      const chunk = Buffer.from(value).subarray(0, remaining);
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (value.length > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks, totalBytes);
}

function prefixIsPdf(prefix) {
  return prefix.subarray(0, 1024).includes(Buffer.from("%PDF-", "ascii"));
}

async function auditExternalReferences(content) {
  const warnings = [];
  const hardErrors = [];
  const references = externalReferences(content);
  let nextIndex = 0;
  async function checkNextReference() {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= references.length) return;
    const reference = references[index];
    try {
      const headResponse = await fetch(reference.url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
        headers: { "User-Agent": "Yutong-Li-Site-Manager/1.0" }
      });
      if (responseIsPdf(headResponse)) throw clientError(`${reference.label} 实际返回 PDF，不允许发布：${reference.url}`);
      if ([404, 410].includes(headResponse.status)) throw clientError(`${reference.label} 无法访问（HTTP ${headResponse.status}）：${reference.url}`);

      const getResponse = await fetch(reference.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Range": `bytes=0-${externalReferenceProbeBytes - 1}`,
          "User-Agent": "Yutong-Li-Site-Manager/1.0"
        }
      });
      const prefix = await readResponsePrefix(getResponse);
      if (responseIsPdf(getResponse) || prefixIsPdf(prefix)) {
        throw clientError(`${reference.label} 实际返回 PDF，不允许发布：${reference.url}`);
      }
      const effectiveStatus = [405, 501].includes(getResponse.status) ? headResponse.status : getResponse.status;
      if ([404, 410].includes(effectiveStatus)) throw clientError(`${reference.label} 无法访问（HTTP ${effectiveStatus}）：${reference.url}`);
      if (effectiveStatus >= 400) warnings.push(`${reference.label} 返回 HTTP ${effectiveStatus}：${reference.url}`);
    } catch (error) {
      if (error.statusCode) hardErrors.push(error);
      else warnings.push(`${reference.label} 暂时无法联网确认：${reference.url}`);
    }
    await checkNextReference();
  }
  await Promise.all(Array.from({ length: Math.min(4, references.length) }, () => checkNextReference()));
  if (hardErrors.length) throw hardErrors[0];
  return warnings;
}

async function snapshotPublishState() {
  const root = resolve(publishTalkTemporaryRoot, `rollback-${randomBytes(10).toString("hex")}`);
  const contentBackup = resolve(root, "site_content.json");
  const talkDocumentsBackup = resolve(root, "talk-documents");
  const hadContent = await exists(publishedContentPath);
  const hadTalkDocuments = await exists(publicTalkDocumentDirectory);
  const { stdout: indexTreeOutput } = await git(["write-tree"]);
  const avatarSnapshot = await snapshotOptionalFiles(allAvatarPaths);
  await mkdir(root, { recursive: true });
  if (hadContent) await copyFile(publishedContentPath, contentBackup);
  if (hadTalkDocuments) await copyDirectory(publicTalkDocumentDirectory, talkDocumentsBackup);
  return {
    root,
    contentBackup,
    talkDocumentsBackup,
    hadContent,
    hadTalkDocuments,
    avatarSnapshot,
    indexTree: indexTreeOutput.trim()
  };
}

async function restorePublishState(snapshot) {
  if (snapshot.hadContent) {
    await atomicWrite(publishedContentPath, await readFile(snapshot.contentBackup));
  } else {
    await rm(publishedContentPath, { force: true });
  }
  if (snapshot.hadTalkDocuments) {
    await replaceDirectory(snapshot.talkDocumentsBackup, publicTalkDocumentDirectory);
  } else {
    await rm(publicTalkDocumentDirectory, { recursive: true, force: true });
  }
  await restoreOptionalFiles(snapshot.avatarSnapshot);
  await git(["read-tree", snapshot.indexTree]);
}

async function publishContent(content, commitMessage, baseCommit) {
  const initialStatus = await ensurePublishState();
  const headBeforeFetch = await currentHeadCommit();
  const remoteCommit = initialStatus.remoteCommit;
  const allowedPaths = initialStatus.allowedPaths;
  const expectedBase = baseCommit || headBeforeFetch;
  if (remoteCommit !== expectedBase) {
    const error = new Error("云端内容已在本次编辑期间发生变化；旧草稿基准保持不变。请先备份草稿并人工三方核对，避免静默覆盖。");
    error.statusCode = 409;
    throw error;
  }
  await ensureManagedCommitRange(remoteCommit, headBeforeFetch, allowedPaths);

  const publicContent = toPublishedContent(content, shanghaiDate());
  const expectedPublicRevision = contentRevision(publicContent);
  const errors = validateContent(publicContent);
  if (errors.length > 0) {
    const error = new Error("公开内容校验未通过。");
    error.details = errors;
    throw error;
  }
  const linkWarnings = await auditExternalReferences(publicContent);
  await assertHeadCommit(headBeforeFetch, "本地 HEAD 在发布准备期间发生变化，已停止发布，避免夹带其他提交。");
  const snapshot = await snapshotPublishState();
  let committed = false;
  let preparedCandidateCommit;
  let preparedManagedDelta;
  try {
    await syncPublishedAvatar(publicContent);
    await materializeDraftTalkDocuments(content, publicContent);
    await syncPublishedTalkDocuments(publicContent);
    await atomicWrite(publishedContentPath, `${JSON.stringify(publicContent, null, 2)}\n`);
    await execFileAsync(process.execPath, [resolve(repositoryRoot, "scripts", "audit-site.mjs"), "--source"], execOptions);

    const pathsToStage = await stageableManagedPaths(allowedPaths);
    await git(["add", "-A", "--", ...pathsToStage]);
    const { stdout: stagedPdfOutput } = await git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--", "*.pdf", "**/*.pdf"]);
    const approvedPdfs = new Set(publicContent.talks.filter((talk) => talk.documentMode === "pdf").map((talk) => talk.documentPdf?.slice(1)).filter(Boolean));
    const unexpectedPdfs = stagedPdfOutput.split(/\r?\n/).filter(Boolean).filter((path) => !approvedPdfs.has(path));
    if (unexpectedPdfs.length) throw new Error(`发布已停止：暂存区包含未选择公开的 PDF。\n${unexpectedPdfs.join("\n")}`);
    const { stdout: stagedPathsOutput } = await git(["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "-z"]);
    const unexpectedStagedPaths = stagedPathsOutput.split("\0").filter(Boolean).filter((path) => !isManagedPath(path, allowedPaths));
    if (unexpectedStagedPaths.length > 0) {
      const error = new Error("暂存区在发布准备期间出现不属于主页管理器的文件，已停止发布。");
      error.statusCode = 409;
      error.details = unexpectedStagedPaths;
      throw error;
    }
    await assertHeadCommit(headBeforeFetch, "本地 HEAD 在候选提交创建前发生变化，已停止发布，避免形成多提交候选。");
    const { stdout: expectedTreeOutput } = await git(["write-tree"]);
    const expectedTree = expectedTreeOutput.trim();
    try {
      await git(["diff", "--cached", "--quiet"]);
    } catch {
      const safeMessage = (commitMessage || `更新个人主页 ${shanghaiDate()}`).replace(/[\r\n]+/g, " ").slice(0, 100);
      await git(initialStatus.pendingCandidate
        ? ["commit", "--amend", "-m", safeMessage]
        : ["commit", "-m", safeMessage]);
      committed = true;
    }
    const candidateHead = await currentHeadCommit();
    const { stdout: committedTreeOutput } = await git(["rev-parse", `${candidateHead}^{tree}`]);
    if (committedTreeOutput.trim() !== expectedTree) {
      throw clientError("候选提交树与管理器准备的暂存树不一致，已停止发布。", 409);
    }
    const candidatePublishedRevision = await committedPublicContentRevision(candidateHead);
    if (candidatePublishedRevision !== expectedPublicRevision) {
      throw clientError("候选提交中的公开内容与本次发布内容不一致，已停止发布。", 409);
    }
    if (candidateHead !== remoteCommit) {
      await recordPendingCandidate(remoteCommit, initialStatus.bootstrapMode);
      await verifyCandidateForContent(remoteCommit, initialStatus.bootstrapMode, expectedPublicRevision);
    }
    preparedCandidateCommit = candidateHead;
    preparedManagedDelta = await managedTreeDelta(remoteCommit, candidateHead, allowedPaths);
  } catch (error) {
    if (!committed) {
      const headAfterError = await currentHeadCommit().catch(() => undefined);
      if (headAfterError === headBeforeFetch) {
        try {
          await restorePublishState(snapshot);
        } catch (rollbackError) {
          error.message = `${error.message}\n自动恢复发布前文件失败：${rollbackError.message}`;
        }
      } else {
        error.message = `${error.message}\n检测到本地 HEAD 已变化，管理器未自动覆盖当前文件和暂存区；请保留现场人工核对。`;
      }
    }
    throw error;
  } finally {
    await rm(snapshot.root, { recursive: true, force: true }).catch(() => undefined);
  }

  await git(["fetch", "origin", "master"]);
  const afterFetch = await gitStatus({ requireDivergence: true });
  const { stdout: latestRemoteOutput } = await git(["rev-parse", "origin/master"]);
  const latestRemoteCommit = latestRemoteOutput.trim();
  await assertHeadCommit(preparedCandidateCommit, "本地候选在远端状态刷新期间发生变化，已停止发布。");
  if (initialStatus.bootstrapMode && latestRemoteCommit !== bootstrapBaseCommit) {
    const error = new Error("首次迁移所依赖的远端基线已变化；本地提交和旧草稿基准均已保留。请先备份草稿并人工三方核对。");
    error.statusCode = 409;
    throw error;
  }
  let validationBaseCommit;
  if (afterFetch.behind > 0) {
    const { stdout: remoteChangesOutput } = await git([
      "-c",
      "core.quotepath=false",
      "diff",
      "--name-only",
      "-z",
      `${remoteCommit}..${latestRemoteCommit}`
    ]);
    const managedRemoteChanges = remoteChangesOutput.split("\0")
      .filter(Boolean)
      .filter((path) => isManagedPath(path, allowedPaths));
    if (managedRemoteChanges.length > 0) {
      const error = new Error("云端受管内容在发布过程中发生变化，已停止自动合并；本地提交和旧草稿基准均已保留，请先备份草稿并人工三方核对。");
      error.statusCode = 409;
      error.details = managedRemoteChanges;
      throw error;
    }
    try {
      await git(["rebase", "origin/master"]);
    } catch (rebaseError) {
      await git(["rebase", "--abort"]).catch(() => undefined);
      const error = new Error(`云端内容刚刚发生变化，自动合并失败；本地提交和旧草稿基准均已保留，请先备份草稿并人工三方核对。${rebaseError.stderr || rebaseError.message}`);
      error.statusCode = 409;
      throw error;
    }
    validationBaseCommit = latestRemoteCommit;
  } else {
    validationBaseCommit = latestRemoteCommit;
  }

  const candidateAfterRebase = await currentHeadCommit();
  await ensureManagedCommitRange(validationBaseCommit, candidateAfterRebase, allowedPaths);
  if (afterFetch.behind === 0 && candidateAfterRebase !== preparedCandidateCommit) {
    throw clientError("远端基准未变化，但本地候选 SHA 已变化，已停止发布。", 409);
  }
  const rebasedManagedDelta = await managedTreeDelta(validationBaseCommit, candidateAfterRebase, allowedPaths);
  if (rebasedManagedDelta !== preparedManagedDelta) {
    throw clientError("远端更新处理后，候选提交的受管差异与原候选不一致，已停止发布。", 409);
  }
  const rebasedPublishedRevision = await committedPublicContentRevision(candidateAfterRebase);
  if (rebasedPublishedRevision !== expectedPublicRevision) {
    throw clientError("远端更新处理后，候选提交中的公开内容与本次发布内容不一致，已停止发布。", 409);
  }
  if (candidateAfterRebase !== validationBaseCommit) {
    await recordPendingCandidate(validationBaseCommit, initialStatus.bootstrapMode);
    await verifyCandidateForContent(validationBaseCommit, initialStatus.bootstrapMode, expectedPublicRevision);
  }
  await git(["cat-file", "-e", `${candidateAfterRebase}:${validationWorkflowPath}`]);
  const fullCommit = await currentHeadCommit();
  if (fullCommit !== candidateAfterRebase) {
    throw clientError("本地 HEAD 在候选验证分支推送前发生变化，已停止发布。", 409);
  }
  if (fullCommit !== validationBaseCommit) {
    await verifyCandidateForContent(validationBaseCommit, initialStatus.bootstrapMode, expectedPublicRevision);
  }
  await updateDraftBaseCommit(validationBaseCommit, content);
  const validationBranch = `${validationBranchPrefix}/${Date.now().toString(36)}-${fullCommit.slice(0, 12)}-${randomBytes(5).toString("hex")}`;
  let validationPushAttempted = false;
  let validationResult;
  let publishError;
  let validationCleanupWarning;
  try {
    validationPushAttempted = true;
    await git(["push", "origin", `${fullCommit}:refs/heads/${validationBranch}`], { timeout: 180000 });
    validationResult = await waitForValidationRun(initialStatus.remote, validationBranch, fullCommit);

    await git(["fetch", "origin", "master"]);
    const [{ stdout: latestMasterOutput }, headAfterValidation] = await Promise.all([
      git(["rev-parse", "origin/master"]),
      currentHeadCommit()
    ]);
    const latestMasterCommit = latestMasterOutput.trim();
    if (headAfterValidation !== fullCommit) {
      const error = new Error("云端校验期间本地 HEAD 已变化；已停止发布，避免推送未经校验的提交。");
      error.statusCode = 409;
      throw error;
    }
    if (latestMasterCommit !== validationBaseCommit) {
      const error = new Error("云端 master 在校验期间发生变化；候选提交和旧草稿基准均已保留，未正式发布。请先备份草稿并人工三方核对。");
      error.statusCode = 409;
      throw error;
    }
    try {
      await git(["merge-base", "--is-ancestor", validationBaseCommit, fullCommit]);
    } catch {
      const error = new Error("候选提交不再基于当前云端 master；已停止发布。");
      error.statusCode = 409;
      throw error;
    }
    await git(["push", "origin", `${fullCommit}:refs/heads/master`], { timeout: 180000 });
    await git(["fetch", "origin", "master"]);
    const { stdout: pushedMasterOutput } = await git(["rev-parse", "origin/master"]);
    if (pushedMasterOutput.trim() !== fullCommit) {
      const error = new Error("正式推送后远端 master 已出现其他变化，无法确认当前线上基准；请保留现场人工核对。");
      error.statusCode = 409;
      error.details = [`已验证候选：${fullCommit}`, `当前 origin/master：${pushedMasterOutput.trim()}`];
      throw error;
    }
  } catch (error) {
    publishError = error;
    throw error;
  } finally {
    if (validationPushAttempted) {
      try {
        await removeRemoteValidationBranch(validationBranch);
      } catch (cleanupError) {
        const cleanupMessage = `无法自动删除远端临时分支 ${validationBranch}：${String(cleanupError.stderr || cleanupError.message).trim()}`;
        const manualCommand = `请联网后手工执行：git push origin --delete ${validationBranch}`;
        if (publishError) {
          publishError.details = [...(publishError.details || []), cleanupMessage, manualCommand];
        } else {
          validationCleanupWarning = `${cleanupMessage}。${manualCommand}`;
        }
      }
    }
  }

  const { stdout: commitOutput } = await git(["rev-parse", "--short", fullCommit]);
  const postPublishWarnings = [...linkWarnings];
  if (validationCleanupWarning) postPublishWarnings.push(validationCleanupWarning);
  const localHeadAfterPublish = await currentHeadCommit().catch(() => fullCommit);
  if (localHeadAfterPublish !== fullCommit) {
    postPublishWarnings.push(`远端已发布候选 ${fullCommit.slice(0, 12)}，但本地 HEAD 随后变为 ${localHeadAfterPublish.slice(0, 12)}；继续操作前请人工核对本地提交。`);
  }
  try {
    await rm(pendingPublishPath, { force: true });
  } catch (error) {
    postPublishWarnings.push(`云端已发布，但本地候选收据未能清理：${error.message}`);
  }
  try {
    const pdfPaths = initialStatus.bootstrapMode ? await historicalPdfPaths(fullCommit) : [];
    if (pdfPaths.length > 0) {
      postPublishWarnings.push(
        `Git 历史包含 ${pdfPaths.length} 个 PDF 路径；切换当前展示方式不会移除历史版本。`
      );
    }
  } catch (error) {
    postPublishWarnings.push(`已发布，但无法检查 Git 历史中的 PDF：${error.message}`);
  }
  try {
    await updateDraftBaseCommit(fullCommit, content);
    await pruneDraftTalkDocuments(content);
  } catch (error) {
    postPublishWarnings.push(`云端已发布，但本地草稿状态清理失败：${error.message}`);
  }
  return {
    committed,
    commit: commitOutput.trim(),
    headCommit: fullCommit,
    content: publicContent,
    warnings: postPublishWarnings,
    validation: validationResult
  };
}

async function syncFromCloud() {
  const status = await ensurePublishState();
  if (status.changes.length > 0 || status.ahead > 0) {
    throw new Error("本地有尚未发布的修改或提交，不能直接同步云端。请先发布或手工处理。 ");
  }
  await git(["fetch", "origin", "master"]);
  const [{ stdout: localOutput }, { stdout: remoteOutput }] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "origin/master"])
  ]);
  if (localOutput.trim() !== remoteOutput.trim() && await exists(draftPath)) {
    const error = new Error("云端已有新版本，但本机仍有草稿。管理器不会自动覆盖任一版本，请先发布草稿或手工处理差异。");
    error.statusCode = 409;
    throw error;
  }
  await git(["merge", "--ff-only", "origin/master"]);
  return gitStatus();
}

function authorized(request) {
  const header = request.headers.authorization || "";
  return header === `Bearer ${token}`;
}

function validMutationOrigin(request) {
  return request.headers.origin === `http://${host}:${port}`;
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = normalize(resolve(publicDirectory, `.${decoded}`));
  if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${sep}`)) {
    errorResponse(response, 404, "文件不存在。");
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not file");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://lytcnaorevision2018.github.io; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": body.length,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    errorResponse(response, 404, "文件不存在。");
  }
}

async function serveTalkDocumentPreview(request, response, url) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD");
    errorResponse(response, 405, "讲义预览仅支持 GET 或 HEAD 请求。");
    return;
  }
  if (url.searchParams.get("token") !== token) {
    errorResponse(response, 401, "预览会话已失效。");
    return;
  }
  const match = url.pathname.match(/^\/preview\/talk-documents\/([a-z0-9][a-z0-9-]{0,63})\/(doc-[a-f0-9]{20})\/(page-\d{3}\.jpg|document\.pdf)$/);
  if (!match) {
    errorResponse(response, 404, "预览页面不存在。");
    return;
  }
  const [, itemId, documentId, fileName] = match;
  const draftFile = resolve(draftTalkDocumentDirectory, itemId, documentId, fileName);
  const publicFile = resolve(publicTalkDocumentDirectory, itemId, documentId, fileName);
  const filePath = await exists(draftFile) ? draftFile : publicFile;
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": fileName === "document.pdf" ? "application/pdf" : "image/jpeg",
      "Content-Length": body.length,
      "Content-Disposition": "inline",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    errorResponse(response, 404, "预览页面不存在。");
  }
}

async function handleApi(request, response, pathname) {
  if (!authorized(request)) {
    errorResponse(response, 401, "管理器会话已失效，请关闭窗口后重新启动。");
    return;
  }
  if (!["GET", "HEAD"].includes(request.method) && !validMutationOrigin(request)) {
    errorResponse(response, 403, "请求来源不受信任。");
    return;
  }

  if (request.method === "GET" && pathname === "/api/content") {
    const working = await readWorkingContent();
    jsonResponse(response, 200, {
      ok: true,
      ...working,
      sections: sectionDefinitions,
      websiteProfileFields,
      websiteTextDefaults,
      homeDefaults: await readJson(resolve(repositoryRoot, "_data", "home_sections.json")),
      git: await gitStatus(),
      pdfTools: await getPdfToolStatus(),
      repositoryRoot,
      siteUrl: working.content.meta?.siteUrl || "https://lytcnaorevision2018.github.io/"
    });
    return;
  }

  if (request.method === "PUT" && pathname === "/api/content") {
    const body = await readBody(request);
    const result = await enqueue(() => saveDraft(body.content, body.baseRevision, body.baseCommit, { pruneTalkDocuments: true }));
    jsonResponse(response, 200, { ok: true, ...result, message: "草稿已安全保存到本机。" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/avatar") {
    const body = await readBody(request);
    const result = await enqueue(async () => {
      const current = await readWorkingContent();
      if (body.baseRevision && current.revision !== body.baseRevision) {
        const error = new Error("内容已变化，请重新载入后再上传头像。");
        error.statusCode = 409;
        throw error;
      }
      const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
      const extension = extensions[body.mimeType];
      if (!extension || typeof body.data !== "string") throw clientError("仅支持 JPG、PNG 或 WebP 图片。");
      const bytes = Buffer.from(body.data, "base64");
      if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw clientError("头像文件必须小于 5 MB。");
      const isPng = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
      const isJpeg = bytes.subarray(0, 3).toString("hex") === "ffd8ff";
      const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
      if ((extension === "png" && !isPng) || (extension === "jpg" && !isJpeg) || (extension === "webp" && !isWebp)) {
        throw clientError("图片内容与文件类型不一致。");
      }
      const target = avatarTarget(current.content, body.scope);
      const avatarName = `${target.prefix}.${extension}`;
      const avatarPath = resolve(repositoryRoot, "images", avatarName);
      const rollbackSnapshot = await snapshotOptionalFiles([draftPath, ...target.paths]);
      const previousAvatar = target.profile.avatar;
      try {
        await atomicWrite(avatarPath, bytes);
        target.profile.avatar = avatarName;
        const saved = await saveDraft(current.content, current.revision, current.baseCommit);
        for (const oldAvatarPath of target.paths) {
          const usedElsewhere = body.scope === "website"
            ? current.content.profile.avatar === basename(oldAvatarPath)
            : current.content.website?.profile?.avatar === basename(oldAvatarPath);
          if (oldAvatarPath !== avatarPath && !usedElsewhere) await rm(oldAvatarPath, { force: true });
        }
        return { ...saved, avatar: avatarName };
      } catch (error) {
        target.profile.avatar = previousAvatar;
        try {
          await restoreOptionalFiles(rollbackSnapshot);
        } catch (rollbackError) {
          error.message = `${error.message}\n自动恢复头像和草稿失败：${rollbackError.message}`;
        }
        throw error;
      }
    });
    jsonResponse(response, 200, { ok: true, ...result, message: "头像已加入本地草稿。" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/avatar/remove") {
    const body = await readBody(request);
    const result = await enqueue(async () => {
      const current = await readWorkingContent();
      if (body.baseRevision && current.revision !== body.baseRevision) {
        const error = new Error("内容已变化，请重新载入后再移除头像。");
        error.statusCode = 409;
        throw error;
      }
      const target = avatarTarget(current.content, body.scope);
      const rollbackSnapshot = await snapshotOptionalFiles([draftPath, ...target.paths]);
      const previousAvatar = target.profile.avatar;
      try {
        target.profile.avatar = "";
        const saved = await saveDraft(current.content, current.revision, current.baseCommit);
        for (const avatarPath of target.paths) {
          const usedElsewhere = body.scope === "website"
            ? current.content.profile.avatar === basename(avatarPath)
            : current.content.website?.profile?.avatar === basename(avatarPath);
          if (!usedElsewhere) await rm(avatarPath, { force: true });
        }
        return { ...saved, avatar: "" };
      } catch (error) {
        target.profile.avatar = previousAvatar;
        try {
          await restoreOptionalFiles(rollbackSnapshot);
        } catch (rollbackError) {
          error.message = `${error.message}\n自动恢复头像和草稿失败：${rollbackError.message}`;
        }
        throw error;
      }
    });
    jsonResponse(response, 200, { ok: true, ...result, message: "头像已从本地草稿中移除。" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/talk-document") {
    const body = await readBody(request);
    const result = await enqueue(async () => {
      const current = await readWorkingContent();
      if (body.baseRevision && current.revision !== body.baseRevision) {
        const error = new Error("内容已变化，请重新载入后再转换讲义。");
        error.statusCode = 409;
        throw error;
      }
      let bytes;
      if (body.documentId) {
        const reference = `/images/talk-documents/${body.itemId}/${body.documentId}/document.pdf`;
        const parsed = parseTalkDocumentPdf(reference);
        if (!parsed) throw clientError("讲义版本不正确。");
        const localFile = resolve(draftTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
        const publicFile = resolve(publicTalkDocumentDirectory, parsed.itemId, parsed.documentId, parsed.fileName);
        if (!(await exists(localFile)) && !(await exists(publicFile))) throw clientError("这份旧讲义只保留了图片，请重新选择原 PDF 后再切换。");
        bytes = await readFile(await exists(localFile) ? localFile : publicFile);
      } else {
        if (body.mimeType !== "application/pdf" || typeof body.data !== "string") throw clientError("仅支持 PDF 讲义。");
        bytes = Buffer.from(body.data, "base64");
      }
      return renderTalkPdf(body.itemId, bytes, body.mode ?? "images");
    });
    jsonResponse(response, 200, {
      ok: true,
      ...result,
      message: result.mode === "pdf" ? "原 PDF 已保存在本机；确认发布后才会上传。" : `已转换为 ${result.pages.length} 张图片；原文件只保存在本机，便于以后切换。`
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/talk-document/remove") {
    const body = await readBody(request);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.itemId || "")) throw clientError("讲座条目 ID 不合法。");
    if (!/^doc-[a-f0-9]{20}$/.test(body.documentId || "")) throw clientError("讲义版本 ID 不合法。");
    await enqueue(async () => {
      const current = await readWorkingContent();
      if (body.baseRevision && current.revision !== body.baseRevision) {
        const error = new Error("内容已变化，请重新载入后再移除讲义。");
        error.statusCode = 409;
        throw error;
      }
      const inUse = (current.content.talks || []).some((talk) => talkDocumentFiles(talk).some((file) => {
        const parsed = parseTalkDocumentFile(file);
        return parsed?.itemId === body.itemId && parsed.documentId === body.documentId;
      }));
      if (inUse) throw clientError("这份讲义仍被已保存的草稿使用；请先移除条目中的讲义并保存草稿。", 409);
      const itemDirectory = resolve(draftTalkDocumentDirectory, body.itemId);
      await rm(resolve(itemDirectory, body.documentId), { recursive: true, force: true });
      if (await exists(itemDirectory) && (await readdir(itemDirectory)).length === 0) {
        await rm(itemDirectory, { recursive: true, force: true });
      }
    });
    jsonResponse(response, 200, { ok: true, message: "本地讲义预览已移除。" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/publish") {
    const body = await readBody(request);
    const result = await enqueue(async () => {
      const current = await readWorkingContent();
      if (body.revision && current.revision !== body.revision) {
        const error = new Error("待发布草稿已变化，请重新载入后再发布。");
        error.statusCode = 409;
        throw error;
      }
      const published = await publishContent(current.content, body.commitMessage, current.baseCommit);
      return { ...published, revision: current.revision, baseCommit: published.headCommit };
    });
    jsonResponse(response, 200, {
      ok: true,
      ...result,
      message: "候选版本已通过 GitHub Actions 发布校验并推送到 master；Pages 通常会在 1 至 3 分钟内更新。"
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/sync") {
    await readBody(request);
    const gitState = await enqueue(syncFromCloud);
    jsonResponse(response, 200, { ok: true, git: gitState, message: "已同步云端最新版本。" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/shutdown") {
    await readBody(request);
    jsonResponse(response, 200, { ok: true, message: "管理器已关闭。" });
    setTimeout(() => server.close(() => process.exit(0)), 100);
    return;
  }

  errorResponse(response, 404, "接口不存在。");
}

const server = http.createServer(async (request, response) => {
  const expectedHost = `${host}:${port}`;
  if (request.headers.host !== expectedHost) {
    errorResponse(response, 400, "Host 不受信任。");
    return;
  }
  const url = new URL(request.url || "/", `http://${expectedHost}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
    } else if (/^\/preview\/avatar\/(profile|website)$/.test(url.pathname)) {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.setHeader("Allow", "GET, HEAD");
        errorResponse(response, 405, "头像预览仅支持 GET 或 HEAD 请求。");
        return;
      }
      if (url.searchParams.get("token") !== token) throw clientError("预览会话已失效。", 401);
      const current = await readWorkingContent();
      const avatar = url.pathname.endsWith("/website")
        ? (current.content.website?.profile?.avatar ?? current.content.profile.avatar)
        : current.content.profile.avatar;
      if (!avatar || !/^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(avatar)) throw clientError("没有本地头像。", 404);
      const bytes = await readFile(resolve(repositoryRoot, "images", avatar));
      response.writeHead(200, { "Content-Type": mimeTypes[extname(avatar).toLowerCase()] || "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } else if (url.pathname.startsWith("/preview/talk-documents/")) {
      await serveTalkDocumentPreview(request, response, url);
    } else if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response, url.pathname);
    } else {
      errorResponse(response, 405, "不支持该请求方法。");
    }
  } catch (error) {
    console.error(error);
    errorResponse(response, error.statusCode || 500, error.message || "管理器发生错误。", error.details || []);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。请关闭旧的主页管理器窗口后重试。`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

if (process.argv.includes("--check-pdf-tools")) {
  const status = await getPdfToolStatus();
  console.log(status.message);
  if (!status.available) process.exitCode = 1;
} else {
  server.listen(port, host, async () => {
    await rm(pdfTemporaryRoot, { recursive: true, force: true }).catch((error) => {
      console.warn(`无法清理遗留的 PDF 临时目录，请手工检查 .site-manager/pdf-temp/：${error.message}`);
    });
    await rm(publishTalkTemporaryRoot, { recursive: true, force: true }).catch(() => undefined);
    try {
      const startupContent = await readWorkingContent();
      await pruneDraftTalkDocuments(startupContent.content);
    } catch (error) {
      console.warn(`无法清理旧的本地讲义缓存：${error.message}`);
    }

    const managerUrl = `http://${host}:${port}/#${token}`;
    console.log("个人主页管理器已启动。");
    console.log(`地址：${managerUrl}`);
    console.log("关闭本窗口即可停止管理器。\n");
    if (process.platform === "win32" && !process.argv.includes("--no-open")) {
      execFile("cmd", ["/c", "start", "", managerUrl], { windowsHide: true }, () => undefined);
    }
  });
}
