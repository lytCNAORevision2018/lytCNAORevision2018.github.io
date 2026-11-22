import MarkdownIt from "markdown-it";
import katex from "katex";
import sanitize from "sanitize-html";
import { decodeHTML } from "entities";

export const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const marker = (tex, display) =>
  `<span data-math="${display ? "block" : "inline"}" data-tex="${encodeURIComponent(tex)}"></span>`;
const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
md.inline.ruler.before("escape", "tex", (state, silent) => {
  const start = state.pos;
  const pair = state.src.startsWith("\\(", start)
    ? ["\\(", "\\)"]
    : state.src.startsWith("\\[", start)
      ? ["\\[", "\\]"]
      : state.src.startsWith("$$", start)
        ? ["$$", "$$"]
        : state.src[start] === "$"
          ? ["$", "$"]
          : null;
  if (!pair) return false;
  let end = start + pair[0].length;
  do {
    end = state.src.indexOf(pair[1], end);
    if (end < 0) return false;
    if (state.src[end - 1] !== "\\") break;
    end += pair[1].length;
  } while (true);
  const tex = state.src.slice(start + pair[0].length, end);
  if (!tex.trim() || (pair[0] === "$" && /\n/.test(tex))) return false;
  if (!silent) {
    const token = state.push("html_inline", "", 0);
    token.content = marker(tex, ["$$", "\\["].includes(pair[0]));
  }
  state.pos = end + pair[1].length;
  return true;
});
md.block.ruler.before("fence", "texblock", (state, start, end, silent) => {
  const line = state.getLines(start, start + 1, 0, false).trim();
  const open = line.startsWith("$$")
    ? "$$"
    : line.startsWith("\\[")
      ? "\\["
      : null;
  if (!open) return false;
  const close = open === "$$" ? "$$" : "\\]";
  let last = start;
  let text = line.slice(open.length);
  let at = text.indexOf(close);
  while (at < 0 && last + 1 < end) {
    last++;
    text += "\n" + state.getLines(last, last + 1, 0, false);
    at = text.indexOf(close);
  }
  if (at < 0) return false;
  if (!silent) {
    const token = state.push("html_block", "", 0);
    token.content = marker(text.slice(0, at), true);
    token.map = [start, last + 1];
  }
  state.line = last + 1;
  return true;
});

function safeUrl(value) {
  if (/^#[^\s]*$/.test(value)) return true;
  if (/^\/(?!\/)[^\s\\]*$/.test(value)) {
    try {
      const decoded = decodeURIComponent(decodeURIComponent(value));
      return (
        !decoded.includes("\\") &&
        !decoded.split(/[?#]/)[0].split("/").includes("..") &&
        !/^\/files\//i.test(decoded)
      );
    } catch {
      return false;
    }
  }
  try {
    const u = new URL(value);
    return (
      ["https:", "http:", "mailto:"].includes(u.protocol) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}

export function renderHtml(input, format = "markdown") {
  let raw = format === "markdown" ? md.render(input) : input;
  if (format !== "markdown")
    raw = raw.replace(
      /<span class="math (inline|display)">([\s\S]*?)<\/span>/g,
      (_, mode, tex) =>
        marker(
          decodeHTML(tex).replace(/^\\[([]|\\[)\]]$/g, ""),
          mode === "display",
        ),
    );
  const links = [];
  const toc = [];
  let html = sanitize(raw, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      "img",
      "span",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "id"],
      img: ["src", "alt", "title", "loading"],
      span: ["data-math", "data-tex", "class"],
      code: ["class"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      ol: ["start"],
      "*": ["id"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attrs) => {
        if (attrs.href && !safeUrl(attrs.href))
          throw new Error(`正文链接不安全：${attrs.href}`);
        if (attrs.href) links.push(attrs.href);
        return {
          tagName: tag,
          attribs: {
            ...attrs,
            ...(/^https?:/.test(attrs.href || "")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {}),
          },
        };
      },
      img: (tag, attrs) => {
        if (
          !attrs.src ||
          !safeUrl(attrs.src) ||
          attrs.src.startsWith("mailto:")
        )
          throw new Error("正文图片地址不安全");
        links.push(attrs.src);
        return { tagName: tag, attribs: { ...attrs, loading: "lazy" } };
      },
    },
  });
  html = html.replace(
    /<h([1-6])(?: [^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_, level, title) => {
      const id = `part-${toc.length + 1}`;
      toc.push({
        id,
        level: Number(level),
        title: sanitize(title, { allowedTags: [], allowedAttributes: {} }),
      });
      return `<h${level} id="${id}">${title}</h${level}>`;
    },
  );
  html = html.replace(
    /<span data-math="(block|inline)" data-tex="([^"]*)"><\/span>/g,
    (_, mode, tex) =>
      katex.renderToString(decodeURIComponent(tex), {
        displayMode: mode === "block",
        throwOnError: true,
        trust: false,
        strict: "error",
        maxExpand: 1000,
        maxSize: 20,
        output: "htmlAndMathml",
      }),
  );
  return { html, toc, links: [...new Set(links)] };
}
