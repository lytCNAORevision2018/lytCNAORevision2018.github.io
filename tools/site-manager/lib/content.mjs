import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const websiteTextDefaults = JSON.parse(readFileSync(new URL("../../../_data/website_text.json", import.meta.url), "utf8"));

export function resolvedWebsiteText(content) {
  const text = content.website?.text || {};
  return {
    home: { ...structuredClone(websiteTextDefaults.home), ...text.home },
    misc: { ...structuredClone(websiteTextDefaults.misc), ...text.misc },
    footer: structuredClone(text.footer ?? websiteTextDefaults.footer),
    pages: { ...structuredClone(websiteTextDefaults.pages), ...text.pages }
  };
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const sectionDefinitions = [
  {
    key: "education",
    label: "教育经历",
    singular: "教育经历",
    description: "学校、专业、学位和在读时间。",
    fields: [
      { name: "title", label: "学位或阶段", type: "text", required: true, placeholder: "例如：本科 / 学术学位硕士研究生" },
      { name: "institution", label: "学校", type: "text" },
      { name: "department", label: "学院", type: "text" },
      { name: "period", label: "时间", type: "text", placeholder: "例如：2022.09 - 2026.06" },
      { name: "summary", label: "专业与说明", type: "textarea" },
      { name: "highlights", label: "补充要点", type: "lines" },
      { name: "links", label: "相关链接", type: "links" }
    ]
  },
  {
    key: "projects",
    label: "项目与科研",
    singular: "项目",
    description: "科研、竞赛、课程与工程项目。",
    fields: [
      { name: "title", label: "项目名称", type: "text", required: true },
      { name: "role", label: "角色", type: "text", placeholder: "例如：项目负责人 / 核心成员" },
      { name: "organization", label: "所属组织", type: "text" },
      { name: "period", label: "时间", type: "text" },
      { name: "summary", label: "项目简介", type: "textarea" },
      { name: "highlights", label: "职责与成果", type: "lines" },
      { name: "tags", label: "关键词", type: "tags" },
      { name: "links", label: "论文、代码或展示链接", type: "links" }
    ]
  },
  {
    key: "experiences",
    label: "实习与实践",
    singular: "实践经历",
    description: "实习、社会实践与工程实践。",
    fields: [
      { name: "title", label: "经历名称", type: "text", required: true },
      { name: "role", label: "职位或角色", type: "text" },
      { name: "organization", label: "单位", type: "text" },
      { name: "location", label: "地点", type: "text" },
      { name: "period", label: "时间", type: "text" },
      { name: "summary", label: "经历简介", type: "textarea" },
      { name: "highlights", label: "职责与成果", type: "lines" },
      { name: "tags", label: "关键词", type: "tags" },
      { name: "links", label: "相关链接", type: "links" }
    ]
  },
  {
    key: "awards",
    label: "荣誉与奖项",
    singular: "荣誉或奖项",
    description: "奖学金、竞赛奖项与荣誉称号。",
    fields: [
      { name: "title", label: "奖项名称", type: "text", required: true },
      { name: "issuer", label: "颁发单位", type: "text" },
      { name: "level", label: "等级", type: "text", placeholder: "例如：国家级一等奖" },
      { name: "date", label: "获奖时间", type: "text" },
      { name: "summary", label: "说明", type: "textarea" },
      { name: "links", label: "证明或相关链接", type: "links" }
    ]
  },
  {
    key: "talks",
    label: "分享与讲座",
    singular: "分享或讲座",
    description: "公开分享、课程汇报与学术讲座。",
    fields: [
      { name: "title", label: "题目", type: "text", required: true },
      { name: "event", label: "活动或会议", type: "text" },
      { name: "location", label: "地点", type: "text" },
      { name: "date", label: "日期", type: "text" },
      { name: "summary", label: "内容摘要", type: "textarea" },
      { name: "tags", label: "关键词", type: "tags" },
      { name: "links", label: "视频或活动链接", type: "links" },
      { name: "documentPages", label: "讲义 PDF", type: "talkPdf" }
    ]
  },
  {
    key: "notes",
    label: "笔记与习题",
    singular: "笔记或习题",
    description: "课程笔记、习题整理与学习资料。",
    fields: [
      { name: "title", label: "标题", type: "text", required: true },
      { name: "date", label: "日期", type: "text" },
      { name: "summary", label: "简介", type: "textarea" },
      { name: "tags", label: "关键词", type: "tags" },
      { name: "links", label: "正文或下载链接", type: "links" }
    ]
  },
  {
    key: "outsideResearch",
    label: "科研学习以外",
    singular: "其他记录",
    description: "兴趣、活动、志愿服务与生活记录。",
    fields: [
      { name: "title", label: "标题", type: "text", required: true },
      { name: "date", label: "日期", type: "text" },
      { name: "summary", label: "简介", type: "textarea" },
      { name: "highlights", label: "补充要点", type: "lines" },
      { name: "tags", label: "关键词", type: "tags" },
      { name: "links", label: "相关链接", type: "links" }
    ]
  },
  {
    key: "skills",
    label: "技能",
    singular: "技能组",
    description: "仅在简历中展示的技能与工具。",
    fields: [
      { name: "title", label: "技能类别", type: "text", required: true, placeholder: "例如：编程与数据分析" },
      { name: "summary", label: "概述", type: "textarea" },
      { name: "highlights", label: "具体技能", type: "lines" },
      { name: "links", label: "相关链接", type: "links" }
    ]
  }
];

export const sectionKeys = sectionDefinitions.map((section) => section.key);

export const websiteProfileFields = [
  { key: "name", label: "展示名", required: true },
  { key: "nameEn", label: "英文展示名" },
  { key: "preferredName", label: "常用英文名" },
  { key: "pronouns", label: "称谓" },
  { key: "headline", label: "网站身份或副标题" },
  { key: "summary", label: "网站简介", type: "textarea" },
  { key: "motto", label: "个人寄语" },
  { key: "institution", label: "学校或单位" },
  { key: "location", label: "所在地" },
  { key: "email", label: "网站联系邮箱", type: "email" },
  { key: "researchInterests", label: "研究兴趣", type: "lines" },
  { key: "avatar", label: "网站头像", type: "avatar" }
];

export function resolvedWebsiteProfile(content) {
  return { ...content.profile, ...content.website?.profile };
}

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 12000;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TALK_DOCUMENT_PATTERN = /^\/images\/talk-documents\/([a-z0-9][a-z0-9-]{0,63})\/(doc-[a-f0-9]{20})\/page-(\d{3})\.jpg$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAllowedUrl(value, { allowRelative = true } = {}) {
  if (value === "") return true;
  if (allowRelative && /^\/(?!\/)[^\s]*$/.test(value)) {
    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return false;
    }
    const pathname = decoded.split(/[?#]/, 1)[0];
    return !decoded.includes("\\") && !pathname.split("/").includes("..");
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPdfUrl(value) {
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
  return /\.pdf(?:$|[/?#&=])/i.test(normalized)
    || /(?:^|[?&#])(?:format|type|download|file|filename)=[^&#]*\bpdf\b/i.test(normalized)
    || /application\/pdf/i.test(normalized);
}

function isForbiddenFileArea(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  try {
    return decodeURIComponent(value).split(/[?#]/, 1)[0].toLowerCase().startsWith("/files/");
  } catch {
    return true;
  }
}

export function parseTalkDocumentPage(value) {
  const match = TALK_DOCUMENT_PATTERN.exec(value || "");
  if (!match) return null;
  return {
    itemId: match[1],
    documentId: match[2],
    pageNumber: Number(match[3]),
    fileName: `page-${match[3]}.jpg`
  };
}

function inspectStrings(value, path, errors) {
  if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
    errors.push(`${path} 超过 ${MAX_TEXT_LENGTH} 个字符`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectStrings(entry, `${path}[${index}]`, errors));
  } else if (isObject(value)) {
    Object.entries(value).forEach(([key, entry]) => inspectStrings(entry, `${path}.${key}`, errors));
  }
}

export function validateContent(content) {
  const errors = [];
  let encoded;
  try {
    encoded = JSON.stringify(content);
  } catch {
    return ["内容无法转换为 JSON"];
  }

  if (Buffer.byteLength(encoded, "utf8") > MAX_CONTENT_BYTES) {
    errors.push("内容文件超过 2 MB，请精简文本或链接");
  }
  if (!isObject(content)) return ["内容根节点必须是对象"];
  if (content.version !== 1) errors.push("version 必须为 1");
  if (!isObject(content.meta)) errors.push("缺少 meta 配置");
  if (!isObject(content.profile)) errors.push("缺少 profile 配置");

  if (isObject(content.meta)) {
    if (!content.meta.siteTitle?.trim()) errors.push("站点标题不能为空");
    if (!content.meta.description?.trim()) errors.push("站点描述不能为空");
    if (content.meta.lastUpdated && !/^\d{4}-\d{2}-\d{2}$/.test(content.meta.lastUpdated)) {
      errors.push("最后更新日期必须为 YYYY-MM-DD");
    }
    if (content.meta.siteUrl && !isAllowedUrl(content.meta.siteUrl, { allowRelative: false })) {
      errors.push("站点地址必须是有效的 http(s) 地址");
    }
  }

  if (isObject(content.profile)) {
    if (!content.profile.name?.trim()) errors.push("中文姓名不能为空");
    if (content.profile.email && !EMAIL_PATTERN.test(content.profile.email)) errors.push("电子邮箱格式不正确");
    if (content.profile.avatar) {
      const avatar = content.profile.avatar;
      const isLocalAvatar = /^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(avatar);
      if (!isLocalAvatar && !isAllowedUrl(avatar, { allowRelative: false })) errors.push("头像地址格式不正确");
      if (isPdfUrl(avatar)) errors.push("头像不允许指向 PDF");
    }
    if (!isObject(content.profile.links)) errors.push("profile.links 必须是对象");
    if (isObject(content.profile.links)) {
      for (const [name, url] of Object.entries(content.profile.links)) {
        if (typeof url !== "string" || !isAllowedUrl(url)) errors.push(`个人链接 ${name} 不是有效的 http(s) 或站内地址`);
        if (isPdfUrl(url)) errors.push(`个人链接 ${name} 不允许指向 PDF`);
      }
    }
    if (!Array.isArray(content.profile.researchInterests)) errors.push("研究兴趣必须是数组");
  }

  if (content.website !== undefined) {
    const website = content.website;
    if (!isObject(website)) errors.push("网站设置必须是对象");
    else {
      if (website.text !== undefined) {
        const text = website.text;
        if (!isObject(text)) errors.push("网站说明文字设置必须是对象");
        else {
          for (const group of Object.keys(text)) if (!["home", "misc", "footer", "pages"].includes(group)) errors.push(`未知的说明文字分组：${group}`);
          for (const group of ["home", "misc", "pages"]) {
            if (text[group] === undefined) continue;
            if (!isObject(text[group])) { errors.push(`网站说明 ${group} 必须是对象`); continue; }
            for (const [key, entry] of Object.entries(text[group])) {
              if (!Object.hasOwn(websiteTextDefaults[group], key)) { errors.push(`未知的说明文字：${key}`); continue; }
              const field = group === "pages" ? "text" : "label";
              if (!isObject(entry) || typeof entry.visible !== "boolean" || typeof entry[field] !== "string") errors.push(`说明文字 ${key} 缺少有效的文字或显示开关`);
              else if (group !== "pages" && entry.visible && !entry.label.trim()) errors.push(`显示中的首页文字 ${key} 不能为空`);
            }
          }
          if (text.footer !== undefined) {
            const footer = text.footer;
            if (!isObject(footer)) errors.push("页脚设置必须是对象");
            else {
              for (const key of ["contactVisible", "copyrightVisible", "creditsVisible", "noteVisible"]) if (typeof footer[key] !== "boolean") errors.push(`页脚 ${key} 必须是显示开关`);
              if (typeof footer.note !== "string") errors.push("页脚备注必须是文字");
              const updated = footer.updated;
              if (!isObject(updated)) errors.push("更新时间设置必须是对象");
              else {
                if (typeof updated.visible !== "boolean") errors.push("更新时间必须有显示开关");
                if (!["publish", "manual"].includes(updated.mode)) errors.push("更新时间方式不正确");
                if (!["iso", "chinese"].includes(updated.format)) errors.push("更新时间格式不正确");
                if (typeof updated.label !== "string") errors.push("更新时间前缀必须是文字");
                if (typeof updated.date !== "string" || (updated.date !== "" && !isCalendarDate(updated.date)) || (updated.visible && updated.mode === "manual" && !isCalendarDate(updated.date))) errors.push("手动更新日期必须是有效的 YYYY-MM-DD 日期");
              }
            }
          }
        }
      }
      if (website.profile !== undefined && !isObject(website.profile)) errors.push("网站形象必须是对象");
      else if (website.profile) {
        for (const [key, value] of Object.entries(website.profile)) {
          const field = websiteProfileFields.find((entry) => entry.key === key);
          if (!field) { errors.push(`未知的网站形象字段：${key}`); continue; }
          if (field.type === "lines") {
            if (!Array.isArray(value) || value.some((line) => typeof line !== "string")) errors.push("网站研究兴趣必须是文字数组");
          } else if (typeof value !== "string") errors.push(`网站${field.label}必须是文字`);
          else {
            if (field.required && !value.trim()) errors.push(`网站${field.label}不能为空`);
            if (key === "email" && value && !EMAIL_PATTERN.test(value)) errors.push("网站联系邮箱格式不正确");
            if (key === "avatar" && value) {
              if (!/^[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(value) && !isAllowedUrl(value, { allowRelative: false })) errors.push("网站头像地址格式不正确");
              if (isPdfUrl(value)) errors.push("网站头像不允许指向 PDF");
            }
          }
        }
      }
      if (website.home !== undefined) {
        if (!isObject(website.home)) errors.push("首页编排必须是对象");
        else {
          if (website.home.introduction !== undefined && typeof website.home.introduction !== "string") errors.push("首页欢迎语必须是文字");
          if (website.home.sections !== undefined) {
            if (!Array.isArray(website.home.sections)) errors.push("首页模块必须是数组");
            else {
              const seen = new Set();
              for (const section of website.home.sections) {
                if (!isObject(section) || !sectionKeys.includes(section.key)) { errors.push("首页模块包含未知栏目"); continue; }
                if (seen.has(section.key)) errors.push(`首页模块重复：${section.key}`);
                seen.add(section.key);
                if (typeof section.title !== "string" || !section.title.trim()) errors.push("首页模块标题不能为空");
                if (typeof section.description !== "string") errors.push("首页模块说明必须是文字");
                if (typeof section.visible !== "boolean") errors.push("首页模块缺少显示开关");
                if (!["featured", "published"].includes(section.source)) errors.push("首页模块内容来源不正确");
                if (!Number.isInteger(section.limit) || section.limit < 1 || section.limit > 20) errors.push("首页模块显示数量必须是 1 到 20 的整数");
              }
            }
          }
        }
      }
    }
  }

  for (const section of sectionDefinitions) {
    const items = content[section.key];
    if (!Array.isArray(items)) {
      errors.push(`${section.label} 必须是数组`);
      continue;
    }
    const ids = new Set();
    items.forEach((item, index) => {
      const path = `${section.label}第 ${index + 1} 项`;
      if (!isObject(item)) {
        errors.push(`${path} 必须是对象`);
        return;
      }
      if (!ID_PATTERN.test(item.id || "")) errors.push(`${path} 的 ID 格式不正确`);
      if (ids.has(item.id)) errors.push(`${section.label}中存在重复 ID：${item.id}`);
      ids.add(item.id);
      if (!item.title?.trim()) errors.push(`${path} 的标题不能为空`);
      if (typeof item.published !== "boolean") errors.push(`${path} 缺少“公开发布”状态`);
      if (typeof item.featured !== "boolean") errors.push(`${path} 缺少“首页展示”状态`);
      if (item.featured === true && item.published !== true) errors.push(`${path} 在首页展示时必须同时公开发布`);
      if (!Array.isArray(item.highlights)) errors.push(`${path} 的要点必须是数组`);
      if (!Array.isArray(item.tags)) errors.push(`${path} 的标签必须是数组`);
      if (!Array.isArray(item.links)) {
        errors.push(`${path} 的链接必须是数组`);
      } else {
        item.links.forEach((link, linkIndex) => {
          if (!isObject(link) || !link.label?.trim() || !isAllowedUrl(link.url || "")) {
            errors.push(`${path} 的第 ${linkIndex + 1} 个链接不完整或地址不安全`);
          }
          if (isPdfUrl(link?.url)) errors.push(`${path} 的链接不允许直接指向 PDF`);
          if (isForbiddenFileArea(link?.url)) errors.push(`${path} 的链接不允许指向 /files/；请使用受控的站内页面或外部网页`);
        });
      }
      if (section.key === "talks") {
        if (item.documentPages !== undefined && !Array.isArray(item.documentPages)) {
          errors.push(`${path} 的讲义页必须是数组`);
        }
        if ((item.documentPages || []).length > 80) errors.push(`${path} 的讲义最多允许 80 页`);
        const documentIds = new Set();
        for (const [pageIndex, page] of (item.documentPages || []).entries()) {
          const parsed = parseTalkDocumentPage(page);
          if (!parsed || parsed.itemId !== item.id || parsed.pageNumber !== pageIndex + 1) {
            errors.push(`${path} 包含不安全的讲义页路径`);
            continue;
          }
          documentIds.add(parsed.documentId);
        }
        if (documentIds.size > 1) errors.push(`${path} 的讲义页面必须来自同一个转换版本`);
      } else if (item.documentPages?.length) {
        errors.push(`${path} 不允许附加讲义页；PDF 仅限“分享与讲座”栏目`);
      }
    });
  }

  inspectStrings(content, "content", errors);
  return errors;
}

export function contentRevision(content) {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function toPublishedContent(content, date) {
  const published = structuredClone(content);
  published.meta.lastUpdated = date;
  for (const key of sectionKeys) {
    published[key] = published[key].filter((item) => item.published === true);
  }
  return published;
}
