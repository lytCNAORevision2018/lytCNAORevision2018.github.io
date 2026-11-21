import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contentRevision, resolvedWebsiteProfile, resolvedWebsiteText, websiteTextDefaults, toPublishedContent, validateContent } from "../tools/site-manager/lib/content.mjs";

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

{
  const content = copy();
  const formal = structuredClone(content.profile);
  content.website = { profile: { name: "网站展示名", summary: "", researchInterests: [] } };
  assert.deepEqual(validateContent(content), []);
  assert.equal(resolvedWebsiteProfile(content).name, "网站展示名");
  assert.equal(resolvedWebsiteProfile(content).summary, "", "空的独立简介应隐藏原简介，不能意外回退");
  assert.equal(resolvedWebsiteProfile(content).email, formal.email, "未独立设置的字段继续同步");
  assert.deepEqual(content.profile, formal, "独立网站形象不得改动简历资料");
  const published = toPublishedContent(content, "2026-11-21");
  assert.equal(published.website.profile.name, "网站展示名", "网站设置必须随内容发布");
  delete content.website.profile.name;
  assert.equal(resolvedWebsiteProfile(content).name, formal.name, "移除独立设置应恢复同步");
  content.website.profile.avatar = "javascript:alert(1)";
  expectError(content, /网站头像地址格式/);
  content.website.profile.avatar = "https://assets.invalid/slides.pdf";
  expectError(content, /网站头像不允许指向 PDF/);
}

{
  const content = copy();
  const section = { key: "awards", title: "部分荣誉", description: "", visible: true, source: "published", limit: 2 };
  content.website = { home: { introduction: "首页的独立介绍", sections: [section] } };
  assert.deepEqual(validateContent(content), []);
  content.website.home.sections.push({ ...section });
  expectError(content, /首页模块重复/);
  content.website.home.sections.pop();
  section.limit = 0;
  expectError(content, /显示数量/);
  section.limit = 2;
  section.source = "private";
  expectError(content, /内容来源/);
  section.source = "published";
  section.key = "unknown";
  expectError(content, /未知栏目/);
}

{
  const content = copy();
  assert.equal(resolvedWebsiteText(content).footer.updated.mode, "publish");
  content.website = { text: structuredClone(websiteTextDefaults) };
  const text = content.website.text;
  text.footer.updated = { visible: true, mode: "manual", date: "2026-10-15", label: "资料更新", format: "chinese" };
  text.footer.creditsVisible = false;
  text.home.more = { visible: false, label: "更多记录" };
  text.pages.awards = { visible: false, text: "保留但不显示的说明" };
  assert.deepEqual(validateContent(content), []);
  const published = toPublishedContent(content, "2026-11-21");
  assert.equal(published.meta.lastUpdated, "2026-11-21", "真实发布日期继续独立记录");
  assert.equal(published.website.text.footer.updated.date, "2026-10-15", "手动展示日期不能被发布日期覆盖");
  assert.equal(published.website.text.footer.creditsVisible, false);
  text.footer.updated.date = "2026-02-30";
  expectError(content, /有效的 YYYY-MM-DD/);
  text.footer.updated.date = "";
  expectError(content, /有效的 YYYY-MM-DD/);
  text.footer.updated.visible = false;
  assert.deepEqual(validateContent(content), [], "隐藏时间时可以暂不填写手动日期");
  text.footer.updated.visible = true;
  text.footer.updated.mode = "publish";
  assert.deepEqual(validateContent(content), []);
  text.home.cv.label = "";
  expectError(content, /首页文字 cv 不能为空/);
  text.home.cv.visible = false;
  assert.deepEqual(validateContent(content), []);
}

{
  const content = copy();
  const prefix = "/images/talk-documents/pdf-choice/doc-0123456789abcdefabcd/";
  const talk = {id:"pdf-choice",title:"可选择的讲义",published:true,featured:false,highlights:[],tags:[],links:[],documentMode:"images",documentPages:[`${prefix}page-001.jpg`],documentPdf:`${prefix}document.pdf`};
  content.talks.push(talk);
  assert.deepEqual(validateContent(content),[]);
  const images = toPublishedContent(content,"2026-11-21");
  assert.equal(images.talks.at(-1).documentPdf,undefined,"图片模式不得泄露原 PDF 地址");
  assert.equal(images.talks.at(-1).documentPages.length,1);
  talk.documentMode="pdf";
  assert.deepEqual(validateContent(content),[]);
  const pdf = toPublishedContent(content,"2026-11-21");
  assert.equal(pdf.talks.at(-1).documentPdf,`${prefix}document.pdf`);
  assert.deepEqual(pdf.talks.at(-1).documentPages,[],"PDF 模式只发布原文件");
  assert.equal(talk.documentPages.length,1,"投影不得破坏本机切换资料");
  talk.published=false;
  assert.equal(toPublishedContent(content,"2026-11-21").talks.some(item=>item.id===talk.id),false);
  talk.documentPdf="/images/talk-documents/other/doc-0123456789abcdefabcd/document.pdf";
  expectError(content,/不安全的原 PDF 路径/);
  talk.documentPdf=`${prefix}../document.pdf`;
  expectError(content,/不安全的原 PDF 路径/);
  talk.documentPdf=`${prefix}document.pdf`;
  talk.documentMode="other";
  expectError(content,/展示方式不正确/);
  talk.documentMode="images";
  talk.documentPages=[];
  expectError(content,/先生成页面图片/);
  talk.documentMode="pdf";
  assert.deepEqual(validateContent(content),[]);
}

console.log("内容模型、独立设置与 PDF / 图片展示选择测试通过。");
