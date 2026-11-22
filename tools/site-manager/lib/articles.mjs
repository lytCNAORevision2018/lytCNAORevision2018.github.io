import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import reader from "../vendor/reader.cjs";
import { readingSections } from "../public/content-options.mjs";
const { renderHtml, escapeHtml } = reader;
export { escapeHtml };
export const sectionRoutes = {
  projects: "/projects/",
  experiences: "/experience/",
  talks: "/talks/",
  notes: "/notes/",
  outsideResearch: "/outside/",
};
export const sectionNames = {
  projects: "项目与科研",
  experiences: "实习与实践",
  talks: "分享与讲座",
  notes: "笔记与习题",
  outsideResearch: "科研学习以外",
};
export const hasArticle = (item) =>
  item.readingMode === "page" ||
  (item.readingMode !== "external" &&
    item.readingMode !== "summary" &&
    Boolean(
      item.body?.trim() || item.documentPdf || item.documentPages?.length,
    ));
export const articlePath = (key, item) =>
  readingSections.includes(key) && hasArticle(item)
    ? `/reading/${key.toLowerCase()}/${item.id}/`
    : "";
const cache = new Map();

function execute(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let out = "",
      err = "",
      done = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(
        new Error("LaTeX 转换超时，请拆分正文或使用 PDF / 外部阅读链接。"),
      );
    }, 30000);
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(out);
    }
    child.on("error", finish);
    child.stdout.on("data", (part) => {
      out += part;
      if (out.length > 8 * 1024 * 1024) {
        child.kill();
        finish(new Error("转换结果过大，请拆分正文。"));
      }
    });
    child.stderr.on("data", (part) => {
      err += part;
    });
    child.on("close", (code) =>
      finish(
        code === 0 ? null : new Error(err.trim() || "LaTeX 转换器无法启动。"),
      ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function pandoc(args, input) {
  if (process.env.SITE_MANAGER_PANDOC)
    return execute(process.env.SITE_MANAGER_PANDOC, args, input);
  try {
    return await execute("pandoc", args, input);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (process.platform !== "win32")
      throw new Error(
        "未安装 LaTeX 网页转换器 Pandoc。正文已保留，可先使用 Markdown、PDF 或外链；安装方法见本地说明。",
      );
    try {
      return await execute(
        "wsl.exe",
        ["-d", "ResearchBoost", "-u", "researchboost", "--", "pandoc", ...args],
        input,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      throw new Error(
        "未找到 Pandoc 转换器。正文已保留，可先使用 Markdown、PDF 或外链；安装方法见本地说明。",
      );
    }
  }
}

export async function renderBody(body = "", format = "markdown") {
  if (typeof body !== "string" || body.length > 200000)
    throw new Error("正文最多 200000 个字符。");
  if (!["markdown", "latex"].includes(format))
    throw new Error("正文格式不正确。");
  const key = `${format}\0${body}`;
  if (cache.has(key)) return structuredClone(cache.get(key));
  let result;
  if (format === "markdown" || !body.trim()) result = renderHtml(body);
  else {
    // A document reader, never a TeX engine: no shell, packages, file access or filters.
    if (
      /\\(?:input|include|includeonly|bibliography|addbibresource|openin|openout|read|write\d*|immediate|catcode)\b|\\usepackage\s*(?:\[[^\]]*\])?\s*\{(?:shellesc|minted)\}/i.test(
        body,
      )
    )
      throw new Error(
        "此源码依赖本地文件、文献库或可执行命令。请将正文合成单个 .tex，或使用 PDF / 外部链接。",
      );
    const ast = JSON.parse(
      await pandoc(
        [
          "--sandbox",
          "--fail-if-warnings",
          "--from=latex+raw_tex",
          "--to=json",
        ],
        body,
      ),
    );
    function titleInlines(field) {
      const value = ast.meta[field];
      return value?.t === "MetaInlines"
        ? value.c
        : value?.t === "MetaString"
          ? [{ t: "Str", c: value.c }]
          : [];
    }
    function normalize(value) {
      if (!value || typeof value !== "object") return;
      if (
        ["RawBlock", "RawInline"].includes(value.t) &&
        value.c?.[0] === "latex" &&
        value.c[1].trim() === "\\maketitle"
      ) {
        const title = titleInlines("title"),
          author = ast.meta.author;
        const names =
          author?.t === "MetaList"
            ? author.c.flatMap((name, index) => [
                ...(index ? [{ t: "Str", c: " · " }] : []),
                ...(name.c || []),
              ])
            : titleInlines("author");
        if (value.t === "RawInline") {
          value.t = "Span";
          value.c = [["", [], []], title];
        } else {
          value.t = "Div";
          value.c = [
            ["", ["tex-title"], []],
            [
              ...(title.length
                ? [{ t: "Header", c: [1, ["", ["tex-title"], []], title] }]
                : []),
              ...(names.length ? [{ t: "Para", c: names }] : []),
            ],
          ];
        }
      }
      for (const child of Object.values(value))
        if (Array.isArray(child)) child.forEach(normalize);
        else if (child && typeof child === "object") normalize(child);
    }
    normalize(ast);
    const references = new Map(),
      levels = [0, 0, 0, 0, 0, 0];
    let heading = 0,
      equation = 0;
    function visit(value, fn) {
      if (!value || typeof value !== "object") return;
      fn(value);
      for (const child of Object.values(value))
        if (Array.isArray(child)) child.forEach((v) => visit(v, fn));
        else if (child && typeof child === "object") visit(child, fn);
    }
    visit(ast.blocks, (value) => {
      if (value.t === "Header") {
        const level = value.c[0];
        if (!value.c[1][1].includes("tex-title")) {
          levels[level - 1]++;
          levels.fill(0, level);
        }
        const number = levels.slice(0, level).filter(Boolean).join(".");
        const id = `part-${++heading}`;
        if (value.c[1][0]) references.set(value.c[1][0], { id, number });
        value.c[1][0] = id;
      }
      if (
        value.t === "Math" &&
        value.c[0].t === "DisplayMath" &&
        /\\label\{([^}]+)\}/.test(value.c[1])
      ) {
        if ([...value.c[1].matchAll(/\\label\{([^}]+)\}/g)].length > 1)
          throw new Error(
            "同一个多行公式内有多个标签，请拆成单独公式，或使用 PDF 保留原来的逐行编号。",
          );
        const explicitTag = value.c[1].match(/\\tag\{([^{}]+)\}/)?.[1];
        const number = explicitTag || String(equation + 1),
          id = `equation-${++equation}`;
        const math = { t: "Math", c: structuredClone(value.c) };
        math.c[1] = math.c[1].replace(/\\label\{([^}]+)\}/g, (_, label) => {
          if (references.has(label))
            throw new Error(`重复的 LaTeX 标签：${label}`);
          references.set(label, { id, number });
          return "";
        });
        if (!/\\tag\{/.test(math.c[1])) math.c[1] += `\\tag{${number}}`;
        value.t = "Span";
        value.c = [[id, [], []], [math]];
      }
    });
    visit(ast.blocks, (value) => {
      if (value.t === "RawInline" && value.c?.[0] === "latex") {
        const ref = value.c[1].match(/^\\(eqref|ref|autoref)\{([^}]+)\}$/);
        if (ref) {
          const target = references.get(ref[2]);
          if (!target) throw new Error(`未找到交叉引用：${ref[2]}`);
          value.t = "Link";
          value.c = [
            ["", [], []],
            [
              {
                t: "Str",
                c: ref[1] === "eqref" ? `(${target.number})` : target.number,
              },
            ],
            [`#${target.id}`, ""],
          ];
        }
      }
    });
    const unsupported = new Set();
    function scan(value) {
      if (!value || typeof value !== "object") return;
      if (
        ["RawInline", "RawBlock"].includes(value.t) &&
        value.c?.[0] === "latex"
      )
        unsupported.add(value.c[1].slice(0, 100));
      for (const child of Object.values(value))
        if (Array.isArray(child)) child.forEach(scan);
        else if (child && typeof child === "object") scan(child);
    }
    scan(ast);
    if (unsupported.size)
      throw new Error(
        `网页转换不支持以下 LaTeX 内容：${[...unsupported].slice(0, 5).join("；")}。源码仍可保留，请调整正文或同时提供 PDF。`,
      );
    const html = await pandoc(
      ["--sandbox", "--from=json", "--to=html5", "--mathjax", "--wrap=none"],
      JSON.stringify(ast),
    );
    result = renderHtml(html, "html");
  }
  if (cache.size >= 30) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return structuredClone(result);
}

export async function articleFiles(content) {
  const result = new Map();
  for (const section of readingSections)
    for (const item of content[section] || []) {
      if (!item.published || !hasArticle(item)) continue;
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id || ""))
        throw new Error("独立页条目编号不安全。");
      let rendered;
      try {
        rendered = await renderBody(
          item.body || "",
          item.bodyFormat || "markdown",
        );
      } catch (error) {
        throw new Error(`“${item.title}”的正文无法生成网页：${error.message}`);
      }
      const toc =
        item.showToc !== false && rendered.toc.length
          ? `<nav class="reading-toc" aria-label="文章目录"><strong>目录</strong><ol>${rendered.toc.map((h) => `<li class="toc-level-${h.level}"><a href="#${h.id}">${h.title}</a></li>`).join("")}</ol></nav>`
          : "";
      const links = item.links?.length
        ? `<nav class="reading-resources" aria-label="相关资料">${item.links.map((link) => `<a href="${escapeHtml(link.url)}"${/^https?:/.test(link.url) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(link.label)}</a>`).join("")}</nav>`
        : "";
      const html = `<div class="reading-page ${section === "outsideResearch" ? "reading-page--blog" : "reading-page--course"}"><a class="reading-back" href="${sectionRoutes[section]}">← ${sectionNames[section]}</a><p class="reading-meta">${escapeHtml([item.course, item.period || item.date].filter(Boolean).join(" · "))}</p>${item.summary ? `<p class="reading-lead">${escapeHtml(item.summary)}</p>` : ""}${toc}<div class="reading-body">${rendered.html}${!item.body && item.highlights?.length ? `<ul>${item.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""}</div>${links}</div>`;
      const front = `---\nlayout: single\nauthor_profile: true\nreading: true\ntitle: ${JSON.stringify(escapeHtml(item.title))}\ndescription: ${JSON.stringify(item.summary || item.title)}\npermalink: ${articlePath(section, item)}\n---\n`;
      const attachment = `{% assign reading_item = site.data.site_content.${section} | where: "id", ${JSON.stringify(item.id)} | first %}\n{% include content/document.html item=reading_item %}\n`;
      result.set(
        `${section.toLowerCase()}/${item.id}/index.html`,
        front + html.replaceAll("{", "&#123;") + "\n" + attachment,
      );
    }
  return result;
}

export async function syncArticleFiles(root, content) {
  const files = await articleFiles(content);
  const directory = join(root, "reading");
  await mkdir(directory, { recursive: true });
  // The publisher snapshots this entire managed directory before mutation.
  for (const name of await readdir(directory))
    await rm(join(directory, name), { recursive: true, force: true });
  for (const [path, html] of files) {
    const target = join(directory, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, html, "utf8");
  }
}

export async function auditArticleFiles(root, content) {
  const expected = await articleFiles(content);
  const errors = [];
  async function walk(directory, prefix = "") {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = prefix + entry.name;
      if (entry.isDirectory())
        await walk(join(directory, entry.name), `${path}/`);
      else if (!expected.has(path))
        errors.push(`存在未选择公开的独立内容页：reading/${path}`);
    }
  }
  await walk(join(root, "reading"));
  for (const [path, html] of expected) {
    try {
      if ((await readFile(join(root, "reading", path), "utf8")).replaceAll("\r\n","\n") !== html.replaceAll("\r\n","\n"))
        errors.push(`独立内容页与正文源不一致：reading/${path}`);
    } catch {
      errors.push(`缺少独立内容页：reading/${path}`);
    }
  }
  return errors;
}
