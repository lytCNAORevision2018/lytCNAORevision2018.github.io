export const readingSections = [
  "projects",
  "experiences",
  "talks",
  "notes",
  "outsideResearch",
];
export const linkKinds = {
  auto: "自动识别",
  web: "网页",
  arxiv: "arXiv",
  pdf: "PDF",
  code: "代码",
  video: "视频",
};

export function identifyLink(value, override = "auto") {
  let url;
  try {
    url = new URL(value);
  } catch {
    const kind = override === "auto" ? "web" : override;
    return { kind, label: linkKinds[kind] || "网页" };
  }
  let resourcePath = url.pathname + url.search;
  for (let pass = 0; pass < 2; pass++) {
    try { resourcePath = decodeURIComponent(resourcePath); } catch { break; }
  }
  const host = url.hostname.toLowerCase();
  const arxiv =
    /^(?:export\.)?arxiv\.org$/.test(host) &&
    /^\/(?:abs|pdf|html)\/(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?\/?$/i.test(
      url.pathname,
    );
  const kind =
    override !== "auto"
      ? override
      : arxiv
        ? "arxiv"
        : /\.pdf(?:$|\/)|(?:[?&](?:format|type|file|download)=[^&#]*pdf)/i.test(
              resourcePath,
            )
          ? "pdf"
          : /^(?:www\.)?(?:github\.com|gitlab\.com|codeberg\.org)$/.test(host)
            ? "code"
            : /(?:youtube\.com|youtu\.be|bilibili\.com)$/.test(host)
              ? "video"
              : "web";
  return { kind, label: linkKinds[kind] || "网页" };
}

export const awardCategories = {
  honor: "荣誉称号",
  competition: "竞赛奖项",
  scholarship: "奖学金",
};

export function awardCategory(item) {
  if (Object.hasOwn(awardCategories, item.category)) return item.category;
  const title = item.title || "";
  if (/奖学金|scholarship/i.test(title)) return "scholarship";
  // Legacy "award" meant a non-honor award; split it without overriding that choice.
  if (item.category !== "award" &&
      /优秀毕业生|荣誉|称号|三好学生|优秀学生干部/.test(title) &&
      !/奖项|等奖/.test(title)) return "honor";
  return "competition";
}
