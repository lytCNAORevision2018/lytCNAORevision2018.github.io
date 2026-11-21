import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentRevision, toPublishedContent, validateContent } from "../tools/site-manager/lib/content.mjs";

const source = JSON.parse(await readFile(new URL("../_data/site_content.json", import.meta.url), "utf8"));

function copy() {
  return structuredClone(source);
}

function expectError(content, pattern) {
  const errors = validateContent(content);
  assert.ok(errors.some((error) => pattern.test(error)), `未发现预期错误 ${pattern}：\n${errors.join("\n")}`);
}

assert.deepEqual(validateContent(source), [], "当前公开内容必须通过校验");

{
  const content = copy();
  content.projects.push({
    id: "featured-private",
    title: "测试项目",
    published: false,
    featured: true,
    highlights: [],
    tags: [],
    links: []
  });
  expectError(content, /首页展示时必须同时公开发布/);
}

for (const url of [
  "https://example.org/file.pdf",
  "https://example.org/download?file=slides%252Epdf",
  "https://example.org/download?format=pdf"
]) {
  const content = copy();
  content.projects.push({
    id: "pdf-link",
    title: "测试项目",
    published: true,
    featured: false,
    highlights: [],
    tags: [],
    links: [{ label: "材料", url }]
  });
  expectError(content, /不允许直接指向 PDF/);
}

{
  const content = copy();
  content.notes.push({
    id: "legacy-files-link",
    title: "测试笔记",
    published: true,
    featured: false,
    highlights: [],
    tags: [],
    links: [{ label: "旧文件", url: "/files/notes.txt" }]
  });
  expectError(content, /不允许指向 \/files\//);
}

{
  const content = copy();
  content.talks.push({
    id: "talk-a",
    title: "测试讲座",
    published: true,
    featured: false,
    highlights: [],
    tags: [],
    links: [],
    documentPages: [
      "/images/talk-documents/talk-a/doc-0123456789abcdefabcd/page-001.jpg",
      "/images/talk-documents/talk-b/doc-0123456789abcdefabcd/page-002.jpg"
    ]
  });
  expectError(content, /不安全的讲义页路径/);
}

{
  const content = copy();
  content.projects.push({
    id: "project-with-document",
    title: "测试项目",
    published: true,
    featured: false,
    highlights: [],
    tags: [],
    links: [],
    documentPages: ["/images/talk-documents/project-with-document/doc-0123456789abcdefabcd/page-001.jpg"]
  });
  expectError(content, /PDF 仅限“分享与讲座”栏目/);
}

{
  const content = copy();
  const first = content.education[0];
  content.education.push({ ...structuredClone(first) });
  expectError(content, /重复 ID/);
}

{
  const content = copy();
  content.projects.push({
    id: "private-project",
    title: "本机草稿项目",
    published: false,
    featured: false,
    highlights: [],
    tags: [],
    links: []
  });
  content.projects.push({
    id: "public-project",
    title: "公开项目",
    published: true,
    featured: false,
    highlights: [],
    tags: [],
    links: []
  });
  const published = toPublishedContent(content, "2026-07-11");
  assert.deepEqual(published.projects.map((item) => item.id), ["public-project"]);
  assert.equal(published.meta.lastUpdated, "2026-07-11");
  assert.equal(content.projects.length, 2, "公开筛选不得修改原草稿");
}

{
  const content = copy();
  const revision = contentRevision(content);
  assert.equal(revision, contentRevision(copy()), "同一内容必须产生稳定 revision");
  content.profile.bio = `${content.profile.bio} `;
  assert.notEqual(revision, contentRevision(content), "内容变化后 revision 必须变化");
}

console.log("内容模型测试通过。");
