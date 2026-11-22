import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderBody,
  articleFiles,
  auditArticleFiles,
  syncArticleFiles,
  hasArticle,
} from "../tools/site-manager/lib/articles.mjs";
import {
  documentOwner,
  validateContent,
  toPublishedContent,
  documentItems,
} from "../tools/site-manager/lib/content.mjs";
import {
  identifyLink,
  awardCategory,
  readingSections,
} from "../tools/site-manager/public/content-options.mjs";
const base = JSON.parse(
  await readFile(
    new URL("../_data/site_content.json", import.meta.url),
    "utf8",
  ),
);
const entry = (id, extra = {}) => ({
  id,
  title: "中文课程与实践",
  published: true,
  featured: false,
  highlights: [],
  tags: [],
  links: [],
  ...extra,
});

const markdown = await renderBody(
  "## 第一讲\n\n中文 $x^2$、\\(y+1\\)。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n| 周次 | 内容 |\n| --- | --- |\n| 1 | 基础 |\n\n```js\nconst x = '<script>';\n```\n\n[预印本](https://arxiv.org/abs/2301.12345v2)\n\n[报告](https://materials.invalid/report.pdf)\n\n<script>alert(1)</script>\n\n{{ site.secret }}",
);
assert.match(markdown.html, /katex-mathml/);
assert.match(markdown.html, /katex-display/);
assert.match(markdown.html, /<table>/);
assert.match(markdown.html, /rel="noopener noreferrer"/);
assert.ok(!markdown.html.includes("<script>"));
assert.equal(markdown.toc[0].title, "第一讲");
assert.equal(markdown.links.length, 2);
assert.match((await renderBody("\\[a+b\\]")).html, /katex-display/);
assert.ok(
  !(await renderBody("`$not math$`\n\n```tex\n$x$\n```")).html.includes(
    "katex",
  ),
);
await assert.rejects(
  renderBody("$\\notARealCommand{x}$"),
  /Undefined control sequence/,
);
await assert.rejects(renderBody("[越界](/%2e%2e/private)"), /不安全/);
await assert.rejects(renderBody("[旧路径](/files/a.pdf)"), /不安全/);
await assert.rejects(renderBody("x".repeat(200001)), /200000/);

const tex = String.raw`\documentclass{ctexart}
\usepackage{amsmath,amssymb}
\newcommand{\RR}{\mathbb{R}}
\title{中文讲义}\author{测试作者}
\begin{document}\maketitle
\section{课程介绍}令 $x\in\RR$。
\subsection{推导}
\begin{align}a&=b+c\\d&=e+f\end{align}
\begin{itemize}\item 第一项\item 第二项\end{itemize}
\begin{tabular}{cc}主题&材料\\中文&说明\end{tabular}
\href{https://arxiv.org/abs/math/0309136v1}{阅读预印本}
\end{document}`;
const latex = await renderBody(tex, "latex");
assert.match(latex.html, /课程介绍/);
assert.match(latex.html, /katex-display/);
assert.match(latex.html, /<table>/);
assert.match(latex.html, /第一项/);
assert.equal(latex.links[0], "https://arxiv.org/abs/math/0309136v1");
const theorem = await renderBody(
  String.raw`\documentclass{article}\newtheorem{theorem}{定理}\begin{document}\begin{theorem}If $a=b$, then $b=a$.\end{theorem}\begin{proof}Obvious.\end{proof}\end{document}`,
  "latex",
);
assert.match(theorem.html, /定理 1/);
assert.match(theorem.html, /Obvious/);
assert.match(
  (
    await renderBody(
      String.raw`\begin{document}$a<b$, $a\&b$\end{document}`,
      "latex",
    )
  ).html,
  /katex/,
);
const references = await renderBody(
  String.raw`\documentclass{article}\begin{document}\section{引言}\label{sec:intro}第 \ref{sec:intro} 节。\begin{equation}\label{eq:one}a=b\end{equation}见式 \eqref{eq:one}。\end{document}`,
  "latex",
);
assert.match(references.html, /href="#part-1"/);
assert.match(references.html, /id="equation-1"/);
assert.match(references.html, /href="#equation-1"/);
await assert.rejects(
  renderBody(
    String.raw`\begin{document}参见 \ref{missing}\end{document}`,
    "latex",
  ),
  /未找到交叉引用/,
);
const tagged = await renderBody(
  String.raw`\begin{document}\begin{equation}\label{eq:a}a=b\tag{A}\end{equation}见 \eqref{eq:a}\end{document}`,
  "latex",
);
assert.match(tagged.html, />\(A\)<\/a>/);
await assert.rejects(
  renderBody(
    String.raw`\begin{document}\begin{align}a&=b\label{one}\\c&=d\label{two}\end{align}\end{document}`,
    "latex",
  ),
  /多个标签/,
);
for (const source of [
  String.raw`\input{/etc/passwd}`,
  String.raw`\write18{echo test}`,
  String.raw`\begin{document}\unknownCommand{不可丢弃}\end{document}`,
  String.raw`\begin{document}\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}\end{document}`,
])
  await assert.rejects(renderBody(source, "latex"));
await assert.rejects(
  renderBody(
    String.raw`\begin{document}\includegraphics{C:/private/avatar.png}\end{document}`,
    "latex",
  ),
);
await assert.rejects(
  renderBody(
    String.raw`\begin{document}\href{javascript:alert(1)}{unsafe}\end{document}`,
    "latex",
  ),
);

for (const url of [
  "https://arxiv.org/abs/2301.12345v2",
  "https://arxiv.org/html/2301.12345v2",
  "https://arxiv.org/pdf/2301.12345.pdf",
  "https://arxiv.org/abs/math/0309136v1",
  "https://export.arxiv.org/pdf/hep-th/9901001",
])
  assert.equal(identifyLink(url).kind, "arxiv", url);
assert.equal(
  identifyLink("https://arxiv.org.evil.invalid/abs/2301.12345").kind,
  "web",
);
assert.equal(
  identifyLink("https://arxiv.org/pdf/2301.12345", "pdf").kind,
  "pdf",
);
assert.equal(identifyLink("https://github.com/person/project").kind, "code");
assert.equal(identifyLink("https://materials.invalid/report.pdf").kind, "pdf");
assert.equal(awardCategory({ title: "优秀毕业生" }), "honor");
assert.equal(awardCategory({ title: "学习优秀奖学金" }), "award");
assert.equal(
  awardCategory({ title: "优秀毕业生", category: "award" }),
  "award",
);

const content = structuredClone(base);
for (const section of readingSections) {
  const owner = documentOwner(section, "shared-id");
  content[section].push(
    entry("shared-id", {
      body:
        section === "notes"
          ? tex
          : "## 中文阅读\n\n公式 $x^2$。\n\n{% endraw %}{{ site.secret }}",
      bodyFormat: section === "notes" ? "latex" : "markdown",
      documentMode: "pdf",
      documentPdf: `/images/talk-documents/${owner}/doc-0123456789abcdefabcd/document.pdf`,
    }),
  );
}
assert.equal(
  new Set(
    documentItems(content)
      .filter((i) => i.id === "shared-id")
      .map((i) => i.documentOwner),
  ).size,
  readingSections.length,
  "不同栏目相同编号的附件不得串用",
);
assert.deepEqual(validateContent(content), []);
const forged = structuredClone(content);
forged.notes.at(-1).documentPdf = forged.experiences.at(-1).documentPdf;
assert.ok(validateContent(forged).some((e) => /不安全的原 PDF/.test(e)));
content.outsideResearch.push(
  entry("private-blog", { published: false, body: "不公开的博客草稿" }),
);
const files = await articleFiles(toPublishedContent(content, "2026-11-22"));
assert.equal(files.size, readingSections.length);
const blog = files.get("outsideresearch/shared-id/index.html");
assert.match(blog, /&#123;% endraw %}/);
assert.ok(!blog.includes("{% endraw %}"));
assert.ok(![...files.values()].some((v) => v.includes("不公开的博客草稿")));
assert.ok(hasArticle({ readingMode: "page" }));
assert.equal(hasArticle({ body: "正文", readingMode: "external" }), false);
const retained = structuredClone(content);
retained.notes.at(-1).readingMode = "external";
retained.notes.at(-1).links = [
  { label: "外部阅读", url: "https://arxiv.org/abs/2301.12345" },
];
assert.equal(
  toPublishedContent(retained, "2026-11-22").notes.at(-1).body,
  undefined,
  "外链模式保留在本机的正文不可夹带公开",
);
assert.ok(retained.notes.at(-1).body, "公开投影不能删除本机源码");
retained.notes.at(-1).links[0].kind = "web";
assert.equal(
  toPublishedContent(retained, "2026-11-22").notes.at(-1).links[0].resolvedKind,
  "web",
  "人工指定网页应覆盖 arXiv 自动识别",
);
const isolated = await mkdtemp(join(tmpdir(), "reading-audit-"));
try {
  await syncArticleFiles(isolated, content);
  assert.deepEqual(await auditArticleFiles(isolated, content), []);
  const file = join(isolated, "reading", "notes/shared-id/index.html");
  await writeFile(file, "unexpected");
  assert.ok(
    (await auditArticleFiles(isolated, content)).some((e) => /不一致/.test(e)),
  );
  content.notes.at(-1).published = false;
  await syncArticleFiles(isolated, content);
  assert.deepEqual(await auditArticleFiles(isolated, content), []);
  await assert.rejects(readFile(file), /ENOENT/);
} finally {
  await rm(isolated, { recursive: true, force: true });
}
console.log(
  "Markdown / 中文公式、单文件 LaTeX、arXiv 与手动链接类型、附件归属、独立页同步和隐私审计测试通过。",
);
