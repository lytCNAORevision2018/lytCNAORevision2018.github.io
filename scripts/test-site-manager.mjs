import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRepository = resolve(scriptDirectory, "..");
const excludedCopyDirectories = new Set([".git", ".site-manager", "_site", "node_modules"]);
const baselineTalkId = "baseline-talk";
const baselineDocumentId = "doc-0123456789abcdefabcd";
const baselinePage = `/images/talk-documents/${baselineTalkId}/${baselineDocumentId}/page-001.jpg`;
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    timeout: options.timeout || 120000,
    maxBuffer: 16 * 1024 * 1024
  });
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function git(repository, args, options = {}) {
  return run("git", args, { ...options, cwd: repository });
}

function minimalPdf() {
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  const addObject = (number, body) => {
    offsets[number] = Buffer.byteLength(parts.join(""), "ascii");
    parts.push(`${number} 0 obj\n${body}\nendobj\n`);
  };
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>");
  addObject(4, "<< /Length 0 >>\nstream\nendstream");
  const xrefOffset = Buffer.byteLength(parts.join(""), "ascii");
  parts.push("xref\n0 5\n");
  parts.push("0000000000 65535 f \n");
  for (let number = 1; number <= 4; number += 1) {
    parts.push(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(parts.join(""), "ascii");
}

async function freePort() {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, rejectClose) => probe.close((error) => error ? rejectClose(error) : resolveClose()));
  assert.ok(port >= 1024, "未能分配测试端口");
  return port;
}

async function createFakePdfTools(root) {
  const directory = join(root, "fake-pdf-tools");
  await mkdir(directory, { recursive: true });
  const pdfinfoSource = `#!/usr/bin/env node\nif (!process.argv.includes("-v")) process.stdout.write("Pages:          1\\n");\n`;
  const pdftoppmSource = `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nif (!process.argv.includes("-v")) writeFileSync(\`${"${process.argv.at(-1)}"}-1.jpg\`, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));\n`;
  for (const [name, source] of [["pdfinfo", pdfinfoSource], ["pdftoppm", pdftoppmSource]]) {
    const executablePath = join(directory, name);
    await writeFile(executablePath, source, "utf8");
    await chmod(executablePath, 0o755);
    if (process.platform === "win32") {
      await writeFile(
        `${executablePath}.cmd`,
        `@echo off\r\n"${process.execPath}" "%~dp0${name}" %*\r\n`,
        "utf8"
      );
    }
  }
  return directory;
}

async function copyWorkingTree(target) {
  await cp(sourceRepository, target, {
    recursive: true,
    filter(source) {
      const path = relative(sourceRepository, source);
      if (!path) return true;
      return !path.split(sep).some((part) => excludedCopyDirectories.has(part));
    }
  });
}

function baselineTalk() {
  return {
    id: baselineTalkId,
    title: "已发布讲义基线",
    event: "隔离集成测试",
    location: "本机",
    date: "2026-07-12",
    summary: "用于验证讲义从公开改为不公开时的本地缓存事务。",
    highlights: [],
    tags: [],
    links: [],
    documentPages: [baselinePage],
    featured: false,
    published: true
  };
}

async function createScenario(root, { withBaselineTalk = false } = {}) {
  const repository = join(root, "repository");
  const origin = join(root, "origin.git");
  await copyWorkingTree(repository);

  const contentPath = join(repository, "_data", "site_content.json");
  const content = JSON.parse(await readFile(contentPath, "utf8"));
  content.meta.siteUrl = "https://127.0.0.1:1/";
  content.profile.avatar = "";
  for (const name of Object.keys(content.profile.links || {})) content.profile.links[name] = "";
  if (withBaselineTalk) {
    content.talks = (content.talks || []).filter((talk) => talk.id !== baselineTalkId);
    content.talks.push(baselineTalk());
    const pagePath = join(repository, ...baselinePage.slice(1).split("/"));
    await mkdir(dirname(pagePath), { recursive: true });
    await writeFile(pagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }
  await writeFile(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");

  await run("git", ["init", "--bare", "--initial-branch=master", origin], { cwd: root });
  await run("git", ["init", "--initial-branch=master"], { cwd: repository });
  await git(repository, ["config", "user.name", "Site Manager Integration Test"]);
  await git(repository, ["config", "user.email", "site-manager-test@example.invalid"]);
  await git(repository, ["config", "commit.gpgsign", "false"]);
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "test baseline"]);
  await git(repository, ["remote", "add", "origin", origin]);
  await git(repository, ["push", "-u", "origin", "master"]);
  const { stdout: baseCommit } = await git(repository, ["rev-parse", "HEAD"]);
  return { repository, origin, baseCommit };
}

async function startManager(scenario, root) {
  const port = await freePort();
  const fakePdfTools = await createFakePdfTools(root);
  const localAppData = join(root, "local-app-data");
  await mkdir(localAppData, { recursive: true });
  const child = spawn(process.execPath, ["tools/site-manager/server.mjs", "--no-open"], {
    cwd: scenario.repository,
    env: {
      ...process.env,
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
      LOCALAPPDATA: localAppData,
      PATH: `${fakePdfTools}${delimiter}${process.env.PATH || ""}`,
      SITE_MANAGER_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let output = "";
  let settled = false;
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      rejectReady(new Error(`管理器启动超时。\n${output}`));
    }, 30000);
    const inspect = (chunk) => {
      output += chunk;
      const match = output.match(new RegExp(`http://127\\.0\\.0\\.1:${port}/#([A-Za-z0-9_-]+)`));
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      resolveReady(match[1]);
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectReady(new Error(`管理器提前退出（${code}）。\n${output}`));
    });
  });
  let token;
  try {
    token = await ready;
  } catch (error) {
    if (child.exitCode === null) child.kill();
    throw error;
  }
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(path, { method = "GET", body, timeout = 120000 } = {}) {
    const headers = { Authorization: `Bearer ${token}` };
    if (!["GET", "HEAD"].includes(method)) {
      headers.Origin = baseUrl;
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`接口 ${method} ${path} 返回非 JSON 内容：${text}`);
    }
    return { status: response.status, payload };
  }

  async function stop() {
    if (child.exitCode !== null) return;
    try {
      await request("/api/shutdown", { method: "POST", body: {}, timeout: 5000 });
      await Promise.race([once(child, "exit"), delay(5000)]);
    } catch {
      // The process is force-stopped below if graceful shutdown is unavailable.
    }
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, "exit"), delay(5000)]);
    }
  }

  return { child, token, port, baseUrl, request, stop, output: () => output };
}

function draftPagePath(repository, page) {
  const relativePage = page.replace(/^\/images\/talk-documents\//, "");
  return join(repository, ".site-manager", "talk-documents", ...relativePage.split("/"));
}

function publicPagePath(repository, page) {
  return join(repository, ...page.replace(/^\//, "").split("/"));
}

async function remoteMaster(scenario) {
  const { stdout } = await run("git", ["--git-dir", scenario.origin, "rev-parse", "refs/heads/master"]);
  return stdout;
}

async function validationBranches(scenario) {
  const { stdout } = await run("git", [
    "--git-dir",
    scenario.origin,
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads/site-manager-validation"
  ]);
  return stdout ? stdout.split(/\r?\n/).filter(Boolean) : [];
}

async function assertCandidateState(scenario) {
  const { stdout: head } = await git(scenario.repository, ["rev-parse", "HEAD"]);
  const { stdout: aheadText } = await git(scenario.repository, ["rev-list", "--count", `${scenario.baseCommit}..HEAD`]);
  assert.equal(Number(aheadText), 1, "候选历史必须始终只有一个提交");
  const { stdout: parentLine } = await git(scenario.repository, ["rev-list", "--parents", "-n", "1", head]);
  assert.deepEqual(parentLine.split(/\s+/).slice(1), [scenario.baseCommit], "候选提交必须直接基于 origin/master");

  const receipt = JSON.parse(await readFile(join(scenario.repository, ".site-manager", "pending-publish.json"), "utf8"));
  assert.equal(receipt.managerPendingPublishVersion, 1);
  assert.equal(receipt.commit, head);
  assert.equal(receipt.baseCommit, scenario.baseCommit);
  assert.equal(receipt.bootstrapMode, false);
  const { stdout: committedContentText } = await git(scenario.repository, ["show", `${head}:_data/site_content.json`]);
  const publishedRevision = createHash("sha256")
    .update(JSON.stringify(JSON.parse(committedContentText)))
    .digest("hex");
  assert.equal(receipt.publishedRevision, publishedRevision, "候选收据必须绑定公开内容 revision");
  assert.equal(await remoteMaster(scenario), scenario.baseCommit, "候选失败不得推进远端 master");
  assert.deepEqual(await validationBranches(scenario), [], "失败后必须清理远端候选分支");
  return { head, receipt };
}

async function testMediaAndCandidateTransactions(root) {
  const scenarioRoot = join(root, "media-candidate");
  await mkdir(scenarioRoot, { recursive: true });
  const scenario = await createScenario(scenarioRoot, { withBaselineTalk: true });
  const manager = await startManager(scenario, scenarioRoot);
  try {
    const initial = await manager.request("/api/content");
    assert.equal(initial.status, 200, JSON.stringify(initial.payload));

    const converted = await manager.request("/api/talk-document", {
      method: "POST",
      body: {
        itemId: "unsaved-talk",
        mimeType: "application/pdf",
        data: minimalPdf().toString("base64"),
        baseRevision: initial.payload.revision
      }
    });
    assert.equal(converted.status, 200, JSON.stringify(converted.payload));
    assert.equal(converted.payload.pages.length, 1);
    const unsavedPage = converted.payload.pages[0];
    const unsavedDraftPage = draftPagePath(scenario.repository, unsavedPage);
    assert.ok(await exists(unsavedDraftPage), "PDF 转换页面应先写入本机缓存");

    const avatar = await manager.request("/api/avatar", {
      method: "POST",
      body: {
        mimeType: "image/png",
        data: onePixelPng.toString("base64"),
        baseRevision: initial.payload.revision
      }
    });
    assert.equal(avatar.status, 200, JSON.stringify(avatar.payload));
    assert.ok(await exists(unsavedDraftPage), "上传头像不得清理尚未写入完整草稿的 PDF 页面");
    const preview = await fetch(`${manager.baseUrl}/preview${unsavedPage.replace(/^\/images/, "")}?token=${encodeURIComponent(manager.token)}`);
    assert.equal(preview.status, 200, "头像上传后 PDF 页面仍应可预览");

    const beforeWebsiteAvatar = await manager.request("/api/content");
    assert.ok(beforeWebsiteAvatar.payload.websiteProfileFields.some((field) => field.key === "name"));
    assert.ok(beforeWebsiteAvatar.payload.homeDefaults.some((section) => section.key === "awards"));
    assert.equal(beforeWebsiteAvatar.payload.websiteTextDefaults.footer.updated.mode, "publish");
    assert.equal(beforeWebsiteAvatar.payload.websiteTextDefaults.misc.sitemap.label, "站点地图");
    const websiteAvatar = await manager.request("/api/avatar", {
      method: "POST",
      body: { scope: "website", mimeType: "image/png", data: onePixelPng.toString("base64"), baseRevision: beforeWebsiteAvatar.payload.revision }
    });
    assert.equal(websiteAvatar.status, 200, JSON.stringify(websiteAvatar.payload));
    assert.equal(websiteAvatar.payload.avatar, "website-profile.png");
    assert.ok(await exists(join(scenario.repository, "images", "profile-user.png")), "网站头像不得删除简历头像");
    const websitePreview = await fetch(`${manager.baseUrl}/preview/avatar/website?token=${encodeURIComponent(manager.token)}`);
    assert.equal(websitePreview.status, 200, "独立头像在发布前即可预览");
    assert.equal((await fetch(`${manager.baseUrl}/preview/avatar/website`)).status, 401, "头像预览需要有效会话");
    const websiteHead = await fetch(`${manager.baseUrl}/preview/avatar/website?token=${encodeURIComponent(manager.token)}`, { method: "HEAD" });
    assert.equal(websiteHead.status, 200);
    assert.equal((await websiteHead.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(`${manager.baseUrl}/preview/avatar/website?token=${encodeURIComponent(manager.token)}`, { method: "POST" })).status, 405);
    const afterWebsiteAvatar = await manager.request("/api/content");
    assert.equal(afterWebsiteAvatar.payload.content.profile.avatar, "profile-user.png");
    assert.equal(afterWebsiteAvatar.payload.content.website.profile.avatar, "website-profile.png");
    const removedWebsiteAvatar = await manager.request("/api/avatar/remove", {
      method: "POST", body: { scope: "website", baseRevision: afterWebsiteAvatar.payload.revision }
    });
    assert.equal(removedWebsiteAvatar.status, 200, JSON.stringify(removedWebsiteAvatar.payload));
    assert.equal(await exists(join(scenario.repository, "images", "website-profile.png")), false);
    assert.ok(await exists(join(scenario.repository, "images", "profile-user.png")), "移除独立头像后，简历头像仍应保留");

    const working = await manager.request("/api/content");
    assert.equal(working.status, 200, JSON.stringify(working.payload));
    const unpublished = structuredClone(working.payload.content);
    const talk = unpublished.talks.find((item) => item.id === baselineTalkId);
    assert.ok(talk, "隔离仓库应包含已发布讲义基线");
    talk.published = false;
    talk.featured = false;
    const saved = await manager.request("/api/content", {
      method: "PUT",
      body: {
        content: unpublished,
        baseRevision: working.payload.revision,
        baseCommit: working.payload.baseCommit
      }
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.payload));
    const baselineDraftPage = draftPagePath(scenario.repository, baselinePage);
    assert.equal(await exists(baselineDraftPage), false, "发布前基线讲义不应预先存在于 draft cache");
    assert.ok(await exists(publicPagePath(scenario.repository, baselinePage)), "发布前公开讲义页面必须存在");

    const firstPublish = await manager.request("/api/publish", {
      method: "POST",
      body: { revision: saved.payload.revision, commitMessage: "candidate one" }
    });
    assert.equal(firstPublish.status, 503, JSON.stringify(firstPublish.payload));
    assert.match(firstPublish.payload.message, /origin|GitHub/i);
    assert.ok(await exists(baselineDraftPage), "讲义改为不公开时，候选阶段必须先把公开页面物化到 draft cache");
    const firstCandidate = await assertCandidateState(scenario);

    const retryWorking = await manager.request("/api/content");
    assert.equal(retryWorking.status, 200, JSON.stringify(retryWorking.payload));
    const retryContent = structuredClone(retryWorking.payload.content);
    retryContent.profile.motto = `${retryContent.profile.motto || ""} retry`.trim();
    const retrySaved = await manager.request("/api/content", {
      method: "PUT",
      body: {
        content: retryContent,
        baseRevision: retryWorking.payload.revision,
        baseCommit: retryWorking.payload.baseCommit
      }
    });
    assert.equal(retrySaved.status, 200, JSON.stringify(retrySaved.payload));
    const secondPublish = await manager.request("/api/publish", {
      method: "POST",
      body: { revision: retrySaved.payload.revision, commitMessage: "candidate amended" }
    });
    assert.equal(secondPublish.status, 503, JSON.stringify(secondPublish.payload));
    const secondCandidate = await assertCandidateState(scenario);
    assert.notEqual(secondCandidate.head, firstCandidate.head, "重试内容变化后应 amend 原候选，而非复用旧提交");

    const receiptPath = join(scenario.repository, ".site-manager", "pending-publish.json");
    const tamperedReceipt = { ...secondCandidate.receipt, commit: scenario.baseCommit };
    await writeFile(receiptPath, `${JSON.stringify(tamperedReceipt, null, 2)}\n`, "utf8");
    const beforeRejectedHead = (await git(scenario.repository, ["rev-parse", "HEAD"])).stdout;
    const latest = await manager.request("/api/content");
    const rejected = await manager.request("/api/publish", {
      method: "POST",
      body: { revision: latest.payload.revision, commitMessage: "must reject bad receipt" }
    });
    assert.equal(rejected.status, 409, JSON.stringify(rejected.payload));
    assert.match(rejected.payload.message, /收据/);
    assert.equal((await git(scenario.repository, ["rev-parse", "HEAD"])).stdout, beforeRejectedHead);
    assert.equal(await remoteMaster(scenario), scenario.baseCommit);
    assert.deepEqual(await validationBranches(scenario), []);
  } finally {
    await manager.stop();
  }
}

async function startConcurrentHeadTrigger(repository) {
  let triggered = false;
  let triggerError;
  const server = http.createServer((request, response) => {
    void (async () => {
      if (!triggered) {
        triggered = true;
        try {
          await git(repository, ["commit", "--allow-empty", "-m", "external concurrent HEAD change"]);
        } catch (error) {
          triggerError = error;
        }
      }
      response.writeHead(triggerError ? 500 : 200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": request.method === "HEAD" ? 0 : 2
      });
      response.end(request.method === "HEAD" ? undefined : "ok");
    })().catch((error) => {
      triggerError = error;
      response.writeHead(500);
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    wasTriggered: () => triggered,
    error: () => triggerError,
    close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
  };
}

async function testConcurrentHeadStopsPublish(root) {
  const scenarioRoot = join(root, "concurrent-head");
  await mkdir(scenarioRoot, { recursive: true });
  const scenario = await createScenario(scenarioRoot);
  const manager = await startManager(scenario, scenarioRoot);
  const trigger = await startConcurrentHeadTrigger(scenario.repository);
  try {
    const working = await manager.request("/api/content");
    assert.equal(working.status, 200, JSON.stringify(working.payload));
    const content = structuredClone(working.payload.content);
    content.meta.siteUrl = trigger.url;
    const saved = await manager.request("/api/content", {
      method: "PUT",
      body: {
        content,
        baseRevision: working.payload.revision,
        baseCommit: working.payload.baseCommit
      }
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.payload));

    const publish = await manager.request("/api/publish", {
      method: "POST",
      body: { revision: saved.payload.revision, commitMessage: "must stop on concurrent HEAD" }
    });
    assert.equal(publish.status, 409, JSON.stringify(publish.payload));
    assert.ok(trigger.wasTriggered(), "外部 HEAD 变化触发器必须在发布准备期执行");
    assert.equal(trigger.error(), undefined);
    assert.match(publish.payload.message, /HEAD|发布准备/);
    const { stdout: localHead } = await git(scenario.repository, ["rev-parse", "HEAD"]);
    assert.notEqual(localHead, scenario.baseCommit, "外部工具应已改变本地 HEAD");
    assert.equal(await remoteMaster(scenario), scenario.baseCommit, "并发 HEAD 变化不得推送 master");
    assert.deepEqual(await validationBranches(scenario), [], "并发 HEAD 变化不得遗留或推送候选分支");
    assert.equal(await exists(join(scenario.repository, ".site-manager", "pending-publish.json")), false);
  } finally {
    await trigger.close();
    await manager.stop();
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "site-manager-integration-"));
try {
  await testMediaAndCandidateTransactions(temporaryRoot);
  console.log("媒体事务与候选收据测试通过。");
  await testConcurrentHeadStopsPublish(temporaryRoot);
  console.log("并发 HEAD 发布阻断测试通过。");
  console.log("主页管理器隔离集成测试通过。");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
