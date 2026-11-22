import { createItemId, normalizeLegacyItemIds } from "./item-ids.mjs";
import { identifyLink, linkKinds, awardCategory, awardCategories } from "./content-options.mjs";

(() => {
  "use strict";

  const token = window.location.hash.slice(1);
  const app = document.querySelector("#app");
  const sessionError = document.querySelector("#session-error");
  const workspace = document.querySelector(".workspace");
  const editor = document.querySelector("#editor");
  const sectionNav = document.querySelector("#section-nav");
  const draftStatus = document.querySelector("#draft-status");
  const gitStatus = document.querySelector("#git-status");
  const toast = document.querySelector("#toast");
  const itemDialog = document.querySelector("#item-dialog");
  const itemForm = document.querySelector("#item-form");
  const itemFormFields = document.querySelector("#item-form-fields");
  const publishDialog = document.querySelector("#publish-dialog");
  const publishForm = document.querySelector("#publish-form");
  const topButtons = [
    document.querySelector("#sync-button"),
    document.querySelector("#save-button"),
    document.querySelector("#publish-button"),
    document.querySelector("#shutdown-button")
  ];

  const state = {
    content: null,
    revision: "",
    baseCommit: "",
    headCommit: "",
    source: "published",
    sections: [],
    activeSection: "website",
    websiteProfileFields: [],
    homeDefaults: [],
    textDefaults: {},
    dirty: false,
    busy: false,
    git: null,
    pdfTools: { available: true, message: "" },
    siteUrl: "https://lytcnaorevision2018.github.io/",
    editing: null,
    toastTimer: null
  };

  if (!token) {
    sessionError.hidden = false;
    return;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message, tone = "normal") {
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, tone === "error" ? 7000 : 4200);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({ message: "管理器返回了无法识别的响应。" }));
    if (!response.ok) {
      const details = Array.isArray(payload.details) && payload.details.length ? `\n${payload.details.join("\n")}` : "";
      const error = new Error(`${payload.message || "操作失败。"}${details}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setBusy(busy) {
    state.busy = busy;
    topButtons.forEach((button) => {
      button.disabled = busy || (Boolean(state.git && state.git.branch !== "master") && ["sync-button", "publish-button"].includes(button.id));
    });
    workspace.inert = busy;
    workspace.setAttribute("aria-busy", busy ? "true" : "false");
    document.body.dataset.busy = busy ? "true" : "false";
  }

  function markDirty() {
    state.dirty = true;
    updateStatus();
  }

  function updateStatus() {
    if (state.dirty) {
      draftStatus.textContent = "有未保存修改";
      draftStatus.dataset.state = "dirty";
    } else if (state.source === "draft") {
      draftStatus.textContent = "本地草稿已保存";
      draftStatus.dataset.state = "saved";
    } else {
      draftStatus.textContent = "已发布版本";
      draftStatus.dataset.state = "saved";
    }
    const changeCount = state.git?.changes?.length || 0;
    const syncParts = [];
    const preview = Boolean(state.git && state.git.branch !== "master");
    if (preview) syncParts.push("本地功能预览，可保存草稿");
    if (changeCount) syncParts.push(`${changeCount} 个仓库修改`);
    if (state.git?.ahead) syncParts.push(`领先云端 ${state.git.ahead}`);
    if (state.git?.behind) syncParts.push(`落后云端 ${state.git.behind}`);
    gitStatus.textContent = syncParts.join(" · ") || "仓库已同步";
    document.getElementById("publish-notice").hidden = !preview;
    for (const id of ["sync-button", "publish-button"]) {
      const button = document.getElementById(id);
      button.disabled = state.busy || Boolean(preview);
      button.title = preview ? "当前为本地功能预览，代码合入正式版后可同步和发布。" : "";
      if (preview) button.setAttribute("aria-describedby", "publish-notice");
      else button.removeAttribute("aria-describedby");
    }
  }

  function getPath(path) {
    return path.split(".").reduce((value, key) => value?.[key], state.content);
  }

  function setPath(path, value) {
    const keys = path.split(".");
    let target = state.content;
    keys.slice(0, -1).forEach((key) => {
      target = target[key];
    });
    target[keys.at(-1)] = value;
  }

  function renderNav() {
    const buttons = [
      { key: "website", label: "网站形象", count: "" },
      { key: "home", label: "首页编排", count: "" },
      { key: "text", label: "文字与页脚", count: "" },
      { key: "profile", label: "简历与共享资料", count: "" },
      ...state.sections.map((section) => ({
        key: section.key,
        label: section.label,
        count: state.content[section.key].length
      }))
    ];
    sectionNav.innerHTML = buttons.map((item) => `
      <button class="nav-button" type="button" data-section="${escapeHtml(item.key)}"${state.activeSection === item.key ? ' aria-current="page"' : ""}>
        <span>${escapeHtml(item.label)}</span>
        ${item.count === "" ? "" : `<span class="nav-count">${item.count}</span>`}
      </button>
    `).join("");
  }

  function inputField({ path, label, type = "text", wide = false, help = "", readonly = false }) {
    const value = getPath(path) ?? "";
    const className = wide ? "field field--wide" : "field";
    if (type === "textarea") {
      return `<label class="${className}"><span>${escapeHtml(label)}</span><textarea data-profile-path="${escapeHtml(path)}"${readonly ? " readonly" : ""}>${escapeHtml(value)}</textarea>${help ? `<p class="field-help">${escapeHtml(help)}</p>` : ""}</label>`;
    }
    return `<label class="${className}"><span>${escapeHtml(label)}</span><input type="${escapeHtml(type)}" value="${escapeHtml(value)}" data-profile-path="${escapeHtml(path)}"${readonly ? " readonly" : ""}>${help ? `<p class="field-help">${escapeHtml(help)}</p>` : ""}</label>`;
  }

  function renderProfile() {
    const interests = state.content.profile.researchInterests.join("\n");
    const avatar = state.content.profile.avatar || "";
    editor.innerHTML = `
      <div class="section-heading">
        <div>
          <h1>简历与共享资料</h1>
          <p>简历使用这里的正式资料。网站形象中设为“跟随共享资料”的字段，也会随这里更新。</p>
        </div>
      </div>
      <div class="form-grid" id="profile-form">
        ${inputField({ path: "profile.name", label: "中文姓名" })}
        ${inputField({ path: "profile.nameEn", label: "英文姓名" })}
        ${inputField({ path: "profile.preferredName", label: "常用英文名" })}
        ${inputField({ path: "profile.pronouns", label: "称谓" })}
        ${inputField({ path: "profile.headline", label: "当前身份", wide: true })}
        ${inputField({ path: "profile.summary", label: "个人简介", type: "textarea", wide: true })}
        ${inputField({ path: "profile.motto", label: "个人寄语", wide: true })}
        ${inputField({ path: "profile.institution", label: "学校或单位" })}
        ${inputField({ path: "profile.location", label: "所在地" })}
        ${inputField({ path: "profile.email", label: "公开邮箱", type: "email" })}
        <label class="field field--wide">
          <span>研究兴趣</span>
          <textarea id="research-interests">${escapeHtml(interests)}</textarea>
          <p class="field-help">每行一个方向。</p>
        </label>
        <div class="field-group">
          <span class="field-group__label">头像</span>
          <div class="avatar-control">
            <div id="avatar-fallback" class="avatar-control__fallback"${avatar ? " hidden" : ""}>${escapeHtml((state.content.profile.name || "李").slice(0, 1))}</div>
            <img id="avatar-preview"${avatar ? ` src="${escapeHtml(avatarPreviewUrl("profile", avatar))}"` : ""} alt="当前头像"${avatar ? "" : " hidden"}>
            <label class="button button--secondary">
              选择图片
              <input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/webp" hidden>
            </label>
            ${avatar ? '<button class="button button--quiet" type="button" data-remove-avatar>移除头像</button>' : ""}
          </div>
        </div>
        <div class="field-group">
          <span class="field-group__label">公开链接</span>
          <div class="form-grid">
            ${inputField({ path: "profile.links.github", label: "GitHub" })}
            ${inputField({ path: "profile.links.kaggle", label: "Kaggle" })}
            ${inputField({ path: "profile.links.googleScholar", label: "Google Scholar" })}
            ${inputField({ path: "profile.links.orcid", label: "ORCID" })}
            ${inputField({ path: "profile.links.linkedin", label: "LinkedIn" })}
            ${inputField({ path: "profile.links.bluesky", label: "Bluesky" })}
          </div>
        </div>
      </div>
    `;
  }

  function websiteSettings() {
    state.content.website ||= {};
    state.content.website.profile ||= {};
    state.content.website.home ||= {};
    return state.content.website;
  }

  function avatarPreviewUrl(scope, avatar) {
    if (/^https?:\/\//i.test(avatar)) return avatar;
    return `/preview/avatar/${scope}?token=${encodeURIComponent(token)}&revision=${encodeURIComponent(state.revision)}`;
  }

  function renderWebsite() {
    const overrides = state.content.website?.profile || {};
    const effective = { ...state.content.profile, ...overrides };
    editor.innerHTML = `
      <div class="section-heading"><div><h1>网站形象</h1><p>首页和各栏目侧栏可以使用自己的名字、简介与头像。个人简历继续使用正式资料。</p></div></div>
      <div class="settings-note">每个字段都能单独选择同步。取消“跟随共享资料”后即可独立编辑；重新勾选会恢复同步。</div>
      <div class="form-grid website-meta">
        ${inputField({ path: "meta.siteTitle", label: "站点标题", help: "用于网站导航和浏览器标题，可独立于姓名设置。" })}
        ${inputField({ path: "meta.description", label: "搜索与分享描述" })}
      </div>
      <div class="website-identity-preview"><span class="settings-eyebrow">网站展示</span><strong>${escapeHtml(effective.name)}</strong><span>${escapeHtml(effective.headline)}</span></div>
      <div class="form-grid website-fields">
      ${state.websiteProfileFields.map((field) => {
        const synced = !Object.hasOwn(overrides, field.key);
        const value = effective[field.key] ?? "";
        let control;
        if (field.type === "avatar") {
          control = `<div class="avatar-control">${value ? `<img src="${escapeHtml(avatarPreviewUrl("website", value))}" alt="网站头像预览">` : `<span class="avatar-control__fallback">${escapeHtml((effective.name || "李").slice(0, 1))}</span>`}<label class="button button--secondary${synced ? " button--disabled" : ""}">选择网站头像<input id="website-avatar-upload" type="file" accept="image/png,image/jpeg,image/webp"${synced ? " disabled" : ""} hidden></label>${!synced && value ? '<button class="button button--quiet" type="button" data-remove-website-avatar>移除网站头像</button>' : ""}</div><p class="field-help">取消同步后请单独选择网站图片；未选择时显示姓名首字。选择图片会同时保存当前草稿，不会替换简历头像。</p>`;
        } else {
          const text = field.type === "lines" ? value.join("\n") : value;
          const attributes = `data-website-field="${field.key}"${synced ? " disabled" : ""}`;
          control = ["textarea", "lines"].includes(field.type)
            ? `<textarea ${attributes} aria-label="${escapeHtml(field.label)}">${escapeHtml(text)}</textarea>`
            : `<input type="${field.type === "email" ? "email" : "text"}" ${attributes} aria-label="${escapeHtml(field.label)}" value="${escapeHtml(text)}">`;
        }
        return `<div class="field ${["textarea", "lines", "avatar"].includes(field.type) ? "field--wide" : ""}"><div class="field-sync-heading"><span>${escapeHtml(field.label)}</span><label class="toggle"><input type="checkbox" data-sync-field="${field.key}"${synced ? " checked" : ""}>跟随共享资料</label></div>${control}</div>`;
      }).join("")}
      </div>`;
  }

  function homeSections() {
    return state.content.website?.home?.sections ?? state.homeDefaults;
  }

  function editableHomeSections() {
    const settings = websiteSettings();
    settings.home.sections ||= structuredClone(state.homeDefaults);
    return settings.home.sections;
  }

  function homeModuleStatus(section) {
    const published = state.content[section.key].filter((item) => item.published);
    const eligible = section.source === "featured" ? published.filter((item) => item.featured) : published;
    if (!section.visible) return "已关闭";
    if (!published.length) return "暂无公开内容 · 自动隐藏";
    if (!eligible.length) return "尚未选中首页条目 · 自动隐藏";
    return `首页显示 ${Math.min(eligible.length, section.limit)} 条 · 共 ${published.length} 条公开内容`;
  }

  function renderHome() {
    const settings = state.content.website?.home || {};
    editor.innerHTML = `
      <div class="section-heading"><div><h1>首页编排</h1><p>首页单独安排展示方式，条目内容仍从原栏目同步。调整首页不会改动简历和栏目页。</p></div></div>
      <div class="settings-note">有内容才展示。没有公开条目的模块自动收起，对应栏目导航也会隐藏；日后添加公开内容会自动出现。</div>
      <label class="field home-introduction"><span>首页欢迎语（可留空）</span><textarea data-home-introduction>${escapeHtml(settings.introduction || "")}</textarea><p class="field-help">只出现在首页，不写入个人简历。支持分段换行。</p></label>
      <div class="home-module-list">
      ${homeSections().map((section, index) => {
        const definition = sectionDefinition(section.key);
        return `<article class="home-module" data-module-index="${index}">
          <div class="home-module__heading"><div><h2>${escapeHtml(definition.label)}</h2><p class="field-help" data-home-status>${homeModuleStatus(section)}</p></div><div class="entry-actions"><button class="button button--quiet" type="button" data-home-move="up" data-index="${index}" aria-label="上移${escapeHtml(definition.label)}"${index === 0 ? " disabled" : ""}>↑</button><button class="button button--quiet" type="button" data-home-move="down" data-index="${index}" aria-label="下移${escapeHtml(definition.label)}"${index === homeSections().length - 1 ? " disabled" : ""}>↓</button></div></div>
          <div class="form-grid">
            <label class="field"><span>首页标题</span><input data-home-setting="title" value="${escapeHtml(section.title)}"></label>
            <label class="field"><span>显示数量</span><input type="number" min="1" max="20" data-home-setting="limit" value="${section.limit}"></label>
            <label class="field"><span>内容来源</span><select data-home-setting="source"><option value="featured"${section.source === "featured" ? " selected" : ""}>仅选中“在首页展示”的公开条目</option><option value="published"${section.source === "published" ? " selected" : ""}>全部公开条目，按栏目顺序</option></select></label>
            <label class="toggle"><input type="checkbox" data-home-setting="visible"${section.visible ? " checked" : ""}>在首页启用此模块</label>
            <label class="field field--wide"><span>首页模块说明（可留空）</span><input data-home-setting="description" value="${escapeHtml(section.description)}"></label>
          </div></article>`;
      }).join("")}</div>`;
  }

  function sectionDefinition(key) {
    return state.sections.find((section) => section.key === key);
  }

  function effectiveText() {
    const text = state.content.website?.text || {};
    return {
      home: { ...structuredClone(state.textDefaults.home), ...text.home },
      misc: { ...structuredClone(state.textDefaults.misc), ...text.misc },
      footer: structuredClone(text.footer ?? state.textDefaults.footer),
      pages: { ...structuredClone(state.textDefaults.pages), ...text.pages }
    };
  }

  function editableText() {
    const settings = websiteSettings();
    settings.text = effectiveText();
    return settings.text;
  }

  function renderText() {
    const text = effectiveText();
    const updated = text.footer.updated;
    const homeLabels = { preferredName: "常用英文名提示", interests: "研究兴趣标题", contact: "首页联系按钮", cv: "首页简历按钮", github: "首页 GitHub 按钮", more: "首页查看全部链接" };
    const field = (path, label, value, type = "text") => `<label class="field"><span>${label}</span><input type="${type}" data-text-path="${path}" value="${escapeHtml(value)}"></label>`;
    const toggle = (path, label, value) => `<label class="toggle"><input type="checkbox" data-text-path="${path}"${value ? " checked" : ""}>${label}</label>`;
    editor.innerHTML = `
      <div class="section-heading"><div><h1>文字与页脚</h1><p>选择哪些说明对访客可见，并按自己的表达修改。关闭显示会保留已填写的文字。</p></div></div>
      <section class="settings-card"><h2>最后更新时间</h2>
        ${toggle("footer.updated.visible", "显示内容更新时间", updated.visible)}
        <div class="form-grid">
          <label class="field"><span>日期来源</span><select data-text-path="footer.updated.mode"><option value="publish"${updated.mode === "publish" ? " selected" : ""}>随成功发布自动更新（北京时间）</option><option value="manual"${updated.mode === "manual" ? " selected" : ""}>手动选择日期</option></select></label>
          <label class="field"><span>手动日期</span><input type="date" data-text-path="footer.updated.date" value="${escapeHtml(updated.date)}"${updated.mode === "manual" ? "" : " disabled"}></label>
          ${field("footer.updated.label", "日期前面的文字（可留空）", updated.label)}
          <label class="field"><span>显示格式</span><select data-text-path="footer.updated.format"><option value="iso"${updated.format === "iso" ? " selected" : ""}>2026-11-21</option><option value="chinese"${updated.format === "chinese" ? " selected" : ""}>2026年11月21日</option></select></label>
        </div><p class="field-help">草稿保留的历史记录日期：${escapeHtml(state.content.meta.lastUpdated || "尚无记录")}。自动模式在成功发布时写入当日日期；手动模式显示所选日期。保存草稿不会改变线上日期。</p>
      </section>
      <section class="settings-card"><h2>页脚说明</h2><div class="settings-toggles">
        ${toggle("footer.contactVisible", "显示页脚联系方式", text.footer.contactVisible)}
        ${toggle("footer.copyrightVisible", "显示年份与署名", text.footer.copyrightVisible)}
        ${toggle("footer.creditsVisible", "显示 Jekyll / Academic Pages 生成说明", text.footer.creditsVisible)}
        ${toggle("footer.noteVisible", "显示额外备注", text.footer.noteVisible)}
      </div><label class="field"><span>额外备注（可留空）</span><textarea data-text-path="footer.note">${escapeHtml(text.footer.note)}</textarea></label></section>
      <section class="settings-card"><h2>首页提示与按钮</h2><div class="form-grid">${Object.entries(text.home).map(([key, entry]) => `<div class="field"><div class="field-sync-heading"><span>${homeLabels[key]}</span>${toggle(`home.${key}.visible`, "显示", entry.visible)}</div><input aria-label="${homeLabels[key]}" data-text-path="home.${key}.label" value="${escapeHtml(entry.label)}"></div>`).join("")}</div></section>
      <section class="settings-card"><h2>栏目开场说明</h2><p class="field-help">只修改栏目页标题下的说明，不改动条目内容、简历资料或首页模块说明。</p><div class="form-grid">${Object.entries(text.pages).map(([key, entry]) => `<div class="field"><div class="field-sync-heading"><span>${key === "cv" ? "个人简历" : sectionDefinition(key).label}</span>${toggle(`pages.${key}.visible`, "显示说明", entry.visible)}</div><textarea aria-label="${key === "cv" ? "个人简历" : sectionDefinition(key).label}开场说明" data-text-path="pages.${key}.text">${escapeHtml(entry.text)}</textarea></div>`).join("")}</div></section>
      <section class="settings-card"><h2>其它提示</h2><div class="form-grid">${Object.entries(text.misc).map(([key, entry]) => { const label = {sidebarContact:"手机侧栏联系方式按钮",sitemap:"页脚站点地图链接",talkNotice:"讲义图片说明"}[key]; return `<div class="field"><div class="field-sync-heading"><span>${label}</span>${toggle(`misc.${key}.visible`, "显示", entry.visible)}</div><input aria-label="${label}" data-text-path="misc.${key}.label" value="${escapeHtml(entry.label)}"></div>`; }).join("")}</div></section>`;
  }

  function renderSection(key) {
    const definition = sectionDefinition(key);
    const items = state.content[key];
    const emptyAwardCategory = key === "awards" && Object.hasOwn(awardCategories, state.awardFilter) && !items.some(item => awardCategory(item) === state.awardFilter);
    editor.innerHTML = `
      <div class="section-heading">
        <div>
          <h1>${escapeHtml(definition.label)}</h1>
          <p>${escapeHtml(definition.description)}</p>
        </div>
        <div class="section-heading__actions">
          <button class="button button--primary" type="button" data-add-item>新增${escapeHtml(definition.singular)}</button>
        </div>
      </div>
      ${key === "awards" ? `<div class="award-filters" aria-label="荣誉与奖项分类"><button type="button" class="button button--secondary" data-award-filter="all" aria-pressed="${!state.awardFilter || state.awardFilter === "all"}">全部</button>${Object.entries(awardCategories).map(([category,label]) => `<button type="button" class="button button--secondary" data-award-filter="${category}" aria-pressed="${state.awardFilter === category}">${label}</button>`).join("")}</div>` : ""}
      ${emptyAwardCategory ? `<div class="empty-state">当前没有${awardCategories[state.awardFilter]}，可点击上方按钮新增。</div>` : ""}
      ${items.length === 0 ? `<div class="empty-state">当前没有${escapeHtml(definition.label)}条目。</div>` : `
        <div class="entry-list">
          ${items.map((item, index) => `
            <article class="entry-row"${key === "awards" && state.awardFilter && state.awardFilter !== "all" && awardCategory(item) !== state.awardFilter ? " hidden" : ""}>
              <div>
                <h2>${escapeHtml(item.title)}</h2>
                ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
                <div class="entry-flags">
                  <span class="entry-flag ${item.published ? "entry-flag--published" : ""}">${item.published ? "公开" : "本地草稿"}</span>
                  ${item.featured ? '<span class="entry-flag">首页展示</span>' : ""}
                  ${key === "awards" ? `<span class="entry-flag">${awardCategories[awardCategory(item)]}</span>` : ""}
                  ${item.course ? `<span class="entry-flag">${escapeHtml(item.course)}</span>` : ""}
                  ${item.period || item.date ? `<span class="entry-flag">${escapeHtml(item.period || item.date)}</span>` : ""}
                </div>
              </div>
              <div class="entry-actions">
                <button class="button button--quiet" type="button" data-move-item="up" data-index="${index}" aria-label="上移">↑</button>
                <button class="button button--quiet" type="button" data-move-item="down" data-index="${index}" aria-label="下移">↓</button>
                <button class="button button--secondary" type="button" data-edit-item data-index="${index}">编辑</button>
                <button class="button button--quiet button--danger" type="button" data-delete-item data-index="${index}">删除</button>
              </div>
            </article>
          `).join("")}
        </div>
      `}
    `;
  }

  function render() {
    renderNav();
    if (state.activeSection === "profile") renderProfile();
    else if (state.activeSection === "website") renderWebsite();
    else if (state.activeSection === "home") renderHome();
    else if (state.activeSection === "text") renderText();
    else renderSection(state.activeSection);
    editor.focus({ preventScroll: true });
    updateStatus();
  }

  function newItem(sectionKey) {
    return {
      id: createItemId(sectionKey),
      ...(sectionKey === "awards" && Object.hasOwn(awardCategories, state.awardFilter) ? { category: state.awardFilter } : {}),
      title: "",
      summary: "",
      highlights: [],
      tags: [],
      links: [],
      documentPages: [],
      featured: false,
      published: false
    };
  }

  function renderLinks(links) {
    const safeLinks = links.length ? links : [{ label: "", url: "" }];
    return safeLinks.map((link, index) => `
      <div class="link-row" data-link-index="${index}">
        <label class="field"><span>名称</span><input name="link-label" type="text" value="${escapeHtml(link.label)}" placeholder="例如：项目主页"></label>
        <label class="field"><span>地址</span><input name="link-url" type="text" inputmode="url" value="${escapeHtml(link.url)}" placeholder="https://... 或 /站内页面/"></label>
        <label class="field link-type"><span>类型 <small data-link-detected>${escapeHtml(identifyLink(link.url,link.kind || "auto").label)}</small></span><select name="link-kind">${Object.entries(linkKinds).map(([kind,label])=>`<option value="${kind}"${(link.kind || "auto") === kind ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <button class="icon-button" type="button" data-remove-link aria-label="删除链接">×</button>
      </div>
    `).join("");
  }

  function itemField(field, item) {
    const value = item[field.name] ?? "";
    if (field.type === "select") {
      const selected = field.name === "category" ? awardCategory(item) : (item[field.name] ?? Object.keys(field.options)[0]);
      return `<label class="field"><span>${escapeHtml(field.label)}</span><select name="${field.name}">${Object.entries(field.options).map(([key,label])=>`<option value="${key}"${selected === key ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>`;
    }
    if (field.type === "boolean") return `<label class="toggle field--wide"><input name="${field.name}" type="checkbox"${value !== false ? " checked" : ""}>${escapeHtml(field.label)}</label>`;
    if (field.type === "body") return `<section class="body-editor field--wide"><label class="field"><span>${escapeHtml(field.label)}</span><textarea name="body" id="body-source" maxlength="200000" rows="16" placeholder="## 第一讲&#10;正文可插入 $x^2$、独立公式、表格和资料链接。">${escapeHtml(value)}</textarea></label><div class="body-actions"><label class="button button--secondary">导入 .tex / .md<input id="body-import" type="file" accept=".tex,.md,.markdown,.txt" hidden></label><button class="button button--secondary" type="button" data-preview-body>检查阅读效果</button><button class="button button--quiet" type="button" data-body-template>插入课程 / 博客模板</button></div><p class="field-help">Markdown 支持标题、表格、代码与 LaTeX 公式。LaTeX 可导入单个 .tex；依赖外部文件、特殊宏包、TikZ 图形的工程请同时提供 PDF 或原网页链接。保存草稿会保留源码；发布独立页前会验证转换。</p><p id="body-preview-status" role="status" class="field-help"></p><div id="body-preview" class="reading-body" hidden></div></section>`;
    if (field.type === "textarea") {
      return `<label class="field field--wide"><span>${escapeHtml(field.label)}</span><textarea name="${escapeHtml(field.name)}"${field.required ? " required" : ""} placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea></label>`;
    }
    if (field.type === "lines") {
      return `<label class="field field--wide"><span>${escapeHtml(field.label)}</span><textarea name="${escapeHtml(field.name)}" placeholder="每行一个要点">${escapeHtml((value || []).join("\n"))}</textarea></label>`;
    }
    if (field.type === "tags") {
      return `<label class="field field--wide"><span>${escapeHtml(field.label)}</span><input name="${escapeHtml(field.name)}" type="text" value="${escapeHtml((value || []).join("，"))}" placeholder="使用逗号分隔"></label>`;
    }
    if (field.type === "links") {
      return `<div class="field field--wide"><span>${escapeHtml(field.label)}</span><div id="link-editor" class="link-editor">${renderLinks(value || [])}</div><div><button class="button button--quiet" type="button" data-add-link>添加链接</button></div></div>`;
    }
    if (field.type === "talkPdf") {
      const pages = Array.isArray(value) ? value : [];
      return `<div class="field field--wide talk-pdf-field">
        <span>${escapeHtml(field.label)}</span>
        <label class="field"><span>公开展示方式</span><select id="talk-document-mode"><option value="images">逐页图片</option><option value="pdf">原 PDF（可打开、下载）</option></select></label>
        <div class="talk-pdf-actions">
          <label id="talk-pdf-upload-label" class="button button--secondary"><span id="talk-pdf-upload-text">选择 PDF</span><input id="talk-pdf-upload" type="file" accept="application/pdf,.pdf" hidden></label>
          <button class="button button--quiet button--danger" type="button" data-remove-talk-pdf${pages.length ? "" : " hidden"}>移除附件</button>
        </div>
        <p id="talk-pdf-status" class="field-help"></p>
        <label id="talk-pdf-confirm-row" class="talk-pdf-confirm" hidden><input id="talk-pdf-confirm" type="checkbox"><span id="talk-pdf-confirm-text">我已检查附件内容和版式</span></label>
        <div id="talk-pdf-preview" class="talk-pdf-preview"></div>
      </div>`;
    }
    return `<label class="field${field.name === "summary" ? " field--wide" : ""}"><span>${escapeHtml(field.label)}</span><input name="${escapeHtml(field.name)}" type="text" value="${escapeHtml(value)}"${field.required ? " required" : ""} placeholder="${escapeHtml(field.placeholder || "")}"></label>`;
  }

  function openItemDialog(index = null) {
    const definition = sectionDefinition(state.activeSection);
    const item = index === null ? newItem(state.activeSection) : structuredClone(state.content[state.activeSection][index]);
    state.editing = {
      sectionKey: state.activeSection,
      index,
      item,
      sessionId: crypto.randomUUID(),
      pendingDocument: null,
      uploading: false
    };
    document.querySelector("#item-dialog-eyebrow").textContent = definition.label;
    document.querySelector("#item-dialog-title").textContent = index === null ? `新增${definition.singular}` : `编辑${definition.singular}`;
    itemFormFields.innerHTML = `
      <div class="toggle-row">
        <label class="toggle"><input name="published" type="checkbox"${item.published ? " checked" : ""}>公开发布</label>
        <label class="toggle"><input name="featured" type="checkbox"${item.featured ? " checked" : ""}>在首页展示</label>
      </div>
      <div class="form-grid">
        ${definition.fields.map((field) => itemField(field, item)).join("")}
      </div>
    `;
    itemDialog.showModal();
    updateTalkPdfControls();
    const firstInput = itemFormFields.querySelector("input:not([type=checkbox]), textarea");
    firstInput?.focus();
  }

  function collectItem() {
    const definition = sectionDefinition(state.editing.sectionKey);
    const item = structuredClone(state.editing.item);
    const formData = new FormData(itemForm);
    item.published = formData.get("published") === "on";
    item.featured = formData.get("featured") === "on";
    if (item.featured) item.published = true;
    for (const field of definition.fields) {
      if (field.type === "links" || field.type === "talkPdf") continue;
      if (field.type === "boolean") { item[field.name] = formData.get(field.name) === "on"; continue; }
      const raw = field.type === "body" ? String(formData.get(field.name) || "") : String(formData.get(field.name) || "").trim();
      if (field.type === "lines") item[field.name] = raw ? raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) : [];
      else if (field.type === "tags") item[field.name] = raw ? [...new Set(raw.split(/[，,]/).map((value) => value.trim()).filter(Boolean))] : [];
      else item[field.name] = raw;
    }
    item.links = [...itemFormFields.querySelectorAll(".link-row")].map((row) => ({
      label: row.querySelector('[name="link-label"]').value.trim(),
      url: row.querySelector('[name="link-url"]').value.trim(),
      kind: row.querySelector('[name="link-kind"]').value
    })).filter((link) => link.label || link.url);
    item.highlights ||= [];
    item.tags ||= [];
    item.links ||= [];
    item.documentPages ||= [];
    return item;
  }

  function renderTalkPdfPreview() {
    const container = document.querySelector("#talk-pdf-preview");
    if (!container || !state.editing) return;
    const item = state.editing.item;
    if (item.documentMode === "pdf") {
      const url = item.documentPdf ? talkDocumentPreviewUrl(item.documentPdf) : "";
      container.innerHTML = url ? `<div class="talk-pdf-original"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">打开原 PDF 预览</a><object data="${escapeHtml(url)}" type="application/pdf" aria-label="原 PDF 预览"><p>如未显示预览，请点击上方链接。</p></object></div>` : "";
      return;
    }
    const pages = item.documentPages || [];
    container.innerHTML = pages.map((page, index) => {
      const parts = page.replace(/^\/images\/talk-documents\//, "").split("/");
      if (parts.length !== 3) return "";
      const previewUrl = `/preview/talk-documents/${parts.map(encodeURIComponent).join("/")}?token=${encodeURIComponent(token)}`;
      return `<figure><img src="${previewUrl}" alt="附件第 ${index + 1} 页预览" loading="lazy" draggable="false"><figcaption>第 ${index + 1} 页</figcaption></figure>`;
    }).join("");
  }

  function talkDocumentPreviewUrl(file) {
    const parts = file.replace(/^\/images\/talk-documents\//, "").split("/");
    return parts.length === 3 ? `/preview/talk-documents/${parts.map(encodeURIComponent).join("/")}?token=${encodeURIComponent(token)}` : "";
  }

  function updateTalkPdfControls() {
    if (!state.editing) return;
    const item = state.editing.item;
    const pages = item.documentPages || [];
    const mode = item.documentMode || "images";
    const selector = document.querySelector("#talk-document-mode");
    if (!selector) return;
    selector.value = mode;
    const unavailable = mode === "images" && state.pdfTools?.available === false;
    const disabled = state.editing.uploading || unavailable;
    const uploadLabel = document.querySelector("#talk-pdf-upload-label");
    uploadLabel.classList.toggle("button--disabled", disabled);
    uploadLabel.setAttribute("aria-disabled", String(disabled));
    document.querySelector("#talk-pdf-upload").disabled = disabled;
    document.querySelector("#talk-pdf-upload-text").textContent = mode === "pdf" ? "选择原 PDF" : "选择 PDF 并生成图片";
    const status = document.querySelector("#talk-pdf-status");
    if (!state.editing.uploading) status.textContent = mode === "pdf"
      ? (item.documentPdf ? "已保留原 PDF。确认发布后，原文件会公开，访客可打开或下载。" : "选择原文件后再发布。此方式不需要图片转换组件。")
      : (unavailable ? `${state.pdfTools.message} 仍可选择“原 PDF”方式。` : pages.length ? `共 ${pages.length} 页；发布时只上传图片，原 PDF 保留在本机供以后切换。` : "转换后逐页检查；发布时只上传页面图片。");
    const removeButton = document.querySelector("[data-remove-talk-pdf]");
    if (removeButton) removeButton.hidden = pages.length === 0 && !item.documentPdf;
    const confirmRow = document.querySelector("#talk-pdf-confirm-row");
    if (confirmRow) confirmRow.hidden = !state.editing.pendingDocument;
    document.querySelector("#talk-pdf-confirm-text").textContent = mode === "pdf" ? "我已打开原 PDF，核对内容和版式" : "我已逐页检查字体、缺字、裁切和版式";
    renderTalkPdfPreview();
  }

  function setItemDialogBusy(busy) {
    if (!state.editing) return;
    state.editing.uploading = busy;
    itemForm.setAttribute("aria-busy", busy ? "true" : "false");
    const uploadLabel = document.querySelector("#talk-pdf-upload-label");
    if (uploadLabel) {
      const uploadDisabled = busy || (state.editing.item.documentMode !== "pdf" && state.pdfTools?.available === false);
      uploadLabel.classList.toggle("button--disabled", uploadDisabled);
      uploadLabel.setAttribute("aria-disabled", uploadDisabled ? "true" : "false");
    }
    for (const control of itemForm.querySelectorAll("button, input, textarea, select")) {
      if (busy) {
        control.dataset.managerWasDisabled = control.disabled ? "true" : "false";
        control.disabled = true;
      } else {
        control.disabled = control.dataset.managerWasDisabled === "true";
        delete control.dataset.managerWasDisabled;
      }
    }
  }

  async function discardPendingTalkDocument(pending, baseRevision = state.revision) {
    if (!pending) return;
    await api("/api/talk-document/remove", {
      method: "POST",
      body: JSON.stringify({
        itemId: pending.itemId,
        sectionKey: pending.sectionKey,
        documentId: pending.documentId,
        baseRevision
      })
    });
  }

  async function uploadTalkPdf(file) {
    if (!file || !state.editing) return;
    const input = document.querySelector("#talk-pdf-upload");
    if (file.size > 20 * 1024 * 1024) {
      showToast("PDF 文件必须小于 20 MB。", "error");
      if (input) input.value = "";
      return;
    }
    await processTalkDocument(async () => {
      const dataUrl = await new Promise((resolveReader, rejectReader) => {
        const reader = new FileReader();
        reader.onload = () => resolveReader(reader.result);
        reader.onerror = () => rejectReader(reader.error);
        reader.readAsDataURL(file);
      });
      return { mimeType: "application/pdf", data: String(dataUrl).split(",")[1] };
    });
    if (input) input.value = "";
  }

  async function processTalkDocument(source) {
    if (!state.editing || state.editing.uploading) return false;
    const editing = state.editing;
    const sessionId = editing.sessionId;
    const itemId = editing.item.id;
    const baseRevision = state.revision;
    const status = document.querySelector("#talk-pdf-status");
    const mode = editing.item.documentMode || "images";
    if (status) status.textContent = mode === "pdf" ? "正在本机保存原 PDF……" : "正在本机转换 PDF，请稍候……";
    setItemDialogBusy(true);
    try {
      const payloadSource = typeof source === "function" ? await source() : source;
      const payload = await api("/api/talk-document", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          sectionKey: editing.sectionKey,
          mode,
          ...payloadSource,
          baseRevision
        })
      });
      const pending = { itemId, sectionKey: editing.sectionKey, documentId: payload.documentId };
      if (!state.editing || state.editing.sessionId !== sessionId) {
        await discardPendingTalkDocument(pending, baseRevision).catch(() => undefined);
        return;
      }
      if (editing.pendingDocument) {
        await discardPendingTalkDocument(editing.pendingDocument, baseRevision).catch(() => undefined);
      }
      editing.pendingDocument = pending;
      editing.item.documentPages = payload.pages;
      editing.item.documentPdf = payload.pdf;
      editing.item.documentMode = payload.mode;
      const confirmation = document.querySelector("#talk-pdf-confirm");
      if (confirmation) confirmation.checked = false;
      updateTalkPdfControls();
      showToast(payload.message);
      return true;
    } catch (error) {
      if (status) status.textContent = error.message;
      showToast(error.message, "error");
      return false;
    } finally {
      if (state.editing?.sessionId === sessionId) { setItemDialogBusy(false); updateTalkPdfControls(); }
    }
  }

  async function previewBody() {
    if (!state.editing || state.editing.uploading) return;
    const session = state.editing.sessionId;
    const item = collectItem();
    const status = document.querySelector("#body-preview-status");
    const target = document.querySelector("#body-preview");
    status.textContent = "正在检查正文、公式和链接……";
    target.hidden = true;
    setItemDialogBusy(true);
    try {
      const result = await api("/api/render-body",{method:"POST",body:JSON.stringify({body:item.body || "",bodyFormat:item.bodyFormat || "markdown"})});
      if (state.editing?.sessionId !== session) return;
      target.innerHTML = result.html;
      target.hidden = false;
      status.textContent = `阅读预览已生成，${result.toc.length} 个标题。请检查正文和公式是否完整。`;
    } catch(error) { status.textContent = error.message; showToast(error.message,"error"); }
    finally { if(state.editing?.sessionId === session)setItemDialogBusy(false); }
  }

  async function importBody(file) {
    if(!file || !state.editing || state.editing.uploading)return;
    if(file.size > 800000){showToast("源码文件最多 800 KB。","error");return;}
    const session = state.editing.sessionId;
    const source = document.querySelector("#body-source");
    if(source.value.trim() && !window.confirm("导入将替换当前正文。需要继续吗？"))return;
    setItemDialogBusy(true);
    try {
      const body = await file.text();
      if(state.editing?.sessionId !== session)return;
      if(body.includes("\u0000") || body.includes("\ufffd") || body.length > 200000)throw new Error("请使用 UTF-8 编码的文本文件，正文最多 200000 个字符。");
      source.value = body;
      itemForm.elements.bodyFormat.value = /\.tex$/i.test(file.name) ? "latex" : "markdown";
      document.querySelector("#body-preview").hidden = true;
      document.querySelector("#body-preview-status").textContent = "源码已导入，请点击“检查阅读效果”。";
    } catch(error){showToast(error.message,"error");}
    finally{if(state.editing?.sessionId === session)setItemDialogBusy(false);}
  }

  async function changeTalkDocumentMode(mode) {
    if (!state.editing) return;
    const item = state.editing.item;
    const previousMode = item.documentMode || "images";
    item.documentMode = mode;
    const confirmation = document.querySelector("#talk-pdf-confirm");
    if (confirmation) confirmation.checked = false;
    const hasDocument = item.documentPdf || item.documentPages?.length;
    if (hasDocument && ((mode === "pdf" && !item.documentPdf) || (mode === "images" && !item.documentPages?.length))) {
      const path = item.documentPdf || item.documentPages[0];
      const documentId = path.split("/")[4];
      if (!await processTalkDocument({ documentId }) && mode === "images") item.documentMode = previousMode;
    }
    updateTalkPdfControls();
  }

  async function removeTalkPdf() {
    if (!state.editing) return;
    const editing = state.editing;
    const sessionId = editing.sessionId;
    setItemDialogBusy(true);
    try {
      if (editing.pendingDocument) await discardPendingTalkDocument(editing.pendingDocument);
      if (!state.editing || state.editing.sessionId !== sessionId) return;
      editing.pendingDocument = null;
      editing.item.documentPages = [];
      delete editing.item.documentPdf;
    } finally {
      if (state.editing?.sessionId === sessionId) setItemDialogBusy(false);
    }
    const status = document.querySelector("#talk-pdf-status");
    if (status) status.textContent = "附件已移除；保存条目并发布后，云端文件才会删除。";
    updateTalkPdfControls();
    showToast("附件已从当前条目移除。");
  }

  async function closeItemDialog() {
    const editing = state.editing;
    if (!editing) return;
    if (editing.uploading) {
      showToast("附件仍在处理，请等待完成后再关闭。", "error");
      return;
    }
    if (editing.pendingDocument) {
      await discardPendingTalkDocument(editing.pendingDocument).catch(() => undefined);
    }
    if (state.editing?.sessionId === editing.sessionId) {
      state.editing = null;
      itemDialog.close();
    }
  }

  async function saveDraft() {
    if (!state.dirty && state.source === "draft") {
      showToast("本地草稿已经是最新版本。");
      return;
    }
    setBusy(true);
    try {
      state.content = normalizeLegacyItemIds(state.content);
      const payload = await api("/api/content", {
        method: "PUT",
        body: JSON.stringify({
          content: state.content,
          baseRevision: state.revision,
          baseCommit: state.baseCommit
        })
      });
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.source = "draft";
      state.dirty = false;
      updateStatus();
      showToast(payload.message);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function publishedCount() {
    return state.sections.reduce((count, section) => count + state.content[section.key].filter((item) => item.published).length, 0);
  }

  function openPublishDialog() {
    document.querySelector("#publish-summary").textContent = `将公开 ${publishedCount()} 条内容，并把所有未发布条目继续保留在本机草稿中。验证失败时不会更新 master。`;
    document.querySelector("#commit-message").value = `更新个人主页 ${new Date().toLocaleDateString("zh-CN")}`;
    publishDialog.showModal();
  }

  async function publish() {
    publishDialog.close();
    setBusy(true);
    draftStatus.textContent = "正在准备发布";
    draftStatus.dataset.state = "dirty";
    let draftSavedForPublish = false;
    try {
      if (state.dirty) {
        state.content = normalizeLegacyItemIds(state.content);
        const saved = await api("/api/content", {
          method: "PUT",
          body: JSON.stringify({
            content: state.content,
            baseRevision: state.revision,
            baseCommit: state.baseCommit
          })
        });
        state.revision = saved.revision;
        state.baseCommit = saved.baseCommit;
        state.source = "draft";
        state.dirty = false;
        draftSavedForPublish = true;
      }
      draftStatus.textContent = "正在云端验证";
      const payload = await api("/api/publish", {
        method: "POST",
        body: JSON.stringify({
          revision: state.revision,
          baseCommit: state.baseCommit,
          commitMessage: document.querySelector("#commit-message").value.trim()
        })
      });
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.headCommit = payload.headCommit;
      state.source = "draft";
      state.dirty = false;
      const warningText = payload.warnings?.length ? `\n链接检查提示：\n${payload.warnings.join("\n")}` : "";
      showToast(`${payload.message} 提交：${payload.commit}${warningText}`);
      await loadContent(false);
    } catch (error) {
      const prefix = draftSavedForPublish ? "草稿已保存在本机；" : "";
      showToast(`${prefix}${error.message}`, "error");
      updateStatus();
    } finally {
      setBusy(false);
    }
  }

  async function syncCloud() {
    if (state.dirty) {
      showToast("请先保存当前修改，再同步云端；管理器不会丢弃未保存内容。", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = await api("/api/sync", { method: "POST", body: "{}" });
      showToast(payload.message);
      await loadContent(false);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function shutdownManager() {
    if (state.dirty && !window.confirm("当前有未保存修改，关闭后这些修改会丢失。确定关闭吗？")) return;
    try {
      await api("/api/shutdown", { method: "POST", body: "{}" });
      document.body.innerHTML = '<div class="session-error"><h1>管理器已关闭</h1><p>可以安全关闭此浏览器标签。</p></div>';
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function uploadAvatar(file, scope = "profile") {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("头像文件必须小于 5 MB。", "error");
      return;
    }
    const dataUrl = await new Promise((resolveReader, rejectReader) => {
      const reader = new FileReader();
      reader.onload = () => resolveReader(reader.result);
      reader.onerror = () => rejectReader(reader.error);
      reader.readAsDataURL(file);
    });
    const base64 = String(dataUrl).split(",")[1];
    if (state.dirty) {
      await saveDraft();
      if (state.dirty) return;
    }
    setBusy(true);
    try {
      const payload = await api("/api/avatar", {
        method: "POST",
        body: JSON.stringify({
          scope,
          mimeType: file.type,
          data: base64,
          baseRevision: state.revision,
          baseCommit: state.baseCommit
        })
      });
      if (scope === "website") websiteSettings().profile.avatar = payload.avatar;
      else state.content.profile.avatar = payload.avatar;
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.source = "draft";
      state.dirty = false;
      render();
      showToast(payload.message);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar(scope = "profile") {
    const profile = scope === "website" ? state.content.website?.profile : state.content.profile;
    if (!profile?.avatar) return;
    if (!window.confirm("确定移除当前头像吗？下次发布后，相应位置会改用姓名首字头像。")) return;
    if (state.dirty) {
      await saveDraft();
      if (state.dirty) return;
    }
    setBusy(true);
    try {
      const payload = await api("/api/avatar/remove", {
        method: "POST",
        body: JSON.stringify({
          scope,
          baseRevision: state.revision,
          baseCommit: state.baseCommit
        })
      });
      profile.avatar = "";
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.source = "draft";
      state.dirty = false;
      render();
      showToast(payload.message);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadContent(initial = true) {
    try {
      const payload = await api("/api/content");
      state.content = payload.content;
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.headCommit = payload.headCommit;
      state.source = payload.source;
      state.sections = payload.sections;
      state.websiteProfileFields = payload.websiteProfileFields || [];
      state.homeDefaults = payload.homeDefaults || [];
      state.textDefaults = payload.websiteTextDefaults || {};
      state.git = payload.git;
      state.pdfTools = payload.pdfTools;
      state.siteUrl = payload.siteUrl;
      state.dirty = false;
      document.querySelector("#open-site").href = state.siteUrl;
      app.hidden = false;
      sessionError.hidden = true;
      render();
    } catch (error) {
      if (initial && error.status === 401) {
        sessionError.hidden = false;
        app.hidden = true;
      } else {
        showToast(error.message, "error");
      }
    }
  }

  sectionNav.addEventListener("click", (event) => {
    if (state.busy) return;
    const button = event.target.closest("[data-section]");
    if (!button) return;
    state.activeSection = button.dataset.section;
    render();
  });

  editor.addEventListener("input", (event) => {
    if (state.busy) return;
    if (event.target.dataset.textPath) {
      const keys = event.target.dataset.textPath.split(".");
      let target = editableText();
      for (const key of keys.slice(0, -1)) target = target[key];
      target[keys.at(-1)] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      if (event.target.dataset.textPath === "footer.updated.mode") editor.querySelector('[data-text-path="footer.updated.date"]').disabled = event.target.value !== "manual";
      markDirty();
    }
    if (event.target.dataset.websiteField) {
      const key = event.target.dataset.websiteField;
      websiteSettings().profile[key] = key === "researchInterests"
        ? event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
        : event.target.value;
      if (key === "name") editor.querySelector(".website-identity-preview strong").textContent = event.target.value;
      if (key === "headline") editor.querySelector(".website-identity-preview > span:last-child").textContent = event.target.value;
      markDirty();
    }
    if (event.target.hasAttribute("data-home-introduction")) {
      websiteSettings().home.introduction = event.target.value;
      markDirty();
    }
    if (event.target.dataset.homeSetting) {
      const key = event.target.dataset.homeSetting;
      const index = Number(event.target.closest("[data-module-index]").dataset.moduleIndex);
      editableHomeSections()[index][key] = key === "limit" ? Number(event.target.value) : key === "visible" ? event.target.checked : event.target.value;
      event.target.closest("[data-module-index]").querySelector("[data-home-status]").textContent = homeModuleStatus(homeSections()[index]);
      markDirty();
    }
    const path = event.target.dataset.profilePath;
    if (path) {
      setPath(path, event.target.value);
      markDirty();
    }
    if (event.target.id === "research-interests") {
      state.content.profile.researchInterests = event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      markDirty();
    }
  });

  editor.addEventListener("change", (event) => {
    if (state.busy) return;
    if (event.target.dataset.syncField) {
      const key = event.target.dataset.syncField;
      const overrides = websiteSettings().profile;
      if (event.target.checked) delete overrides[key];
      else overrides[key] = key === "avatar" ? "" : structuredClone(state.content.profile[key] ?? "");
      markDirty();
      render();
    }
    if (event.target.id === "avatar-upload") uploadAvatar(event.target.files[0]);
    if (event.target.id === "website-avatar-upload") uploadAvatar(event.target.files[0], "website");
  });

  editor.addEventListener("click", (event) => {
    if (state.busy) return;
    const awardFilter = event.target.closest("[data-award-filter]");
    if(awardFilter) { state.awardFilter = awardFilter.dataset.awardFilter; renderSection("awards"); return; }
    if (event.target.closest("[data-remove-website-avatar]")) {
      removeAvatar("website");
      return;
    }
    const homeMove = event.target.closest("[data-home-move]");
    if (homeMove) {
      const index = Number(homeMove.dataset.index);
      const destination = index + (homeMove.dataset.homeMove === "up" ? -1 : 1);
      const sections = editableHomeSections();
      if (destination >= 0 && destination < sections.length) {
        [sections[index], sections[destination]] = [sections[destination], sections[index]];
        markDirty();
        render();
      }
      return;
    }
    if (event.target.closest("[data-remove-avatar]")) {
      removeAvatar();
      return;
    }
    if (event.target.closest("[data-add-item]")) openItemDialog();
    const editButton = event.target.closest("[data-edit-item]");
    if (editButton) openItemDialog(Number(editButton.dataset.index));
    const deleteButton = event.target.closest("[data-delete-item]");
    if (deleteButton) {
      const index = Number(deleteButton.dataset.index);
      const item = state.content[state.activeSection][index];
      if (window.confirm(`确定删除“${item.title}”吗？删除会在下次发布时同步到云端。`)) {
        state.content[state.activeSection].splice(index, 1);
        markDirty();
        render();
      }
    }
    const moveButton = event.target.closest("[data-move-item]");
    if (moveButton) {
      const index = Number(moveButton.dataset.index);
      const direction = moveButton.dataset.moveItem;
      const destination = direction === "up" ? index - 1 : index + 1;
      const items = state.content[state.activeSection];
      if (destination >= 0 && destination < items.length) {
        [items[index], items[destination]] = [items[destination], items[index]];
        markDirty();
        render();
      }
    }
  });

  itemForm.addEventListener("click", (event) => {
    if (state.editing?.uploading) { event.preventDefault(); return; }
    if(event.target.closest("[data-preview-body]")) previewBody();
    if(event.target.closest("[data-body-template]")) {
      const source = document.querySelector("#body-source");
      if(source.value.trim() && !window.confirm("模板将替换当前正文。需要继续吗？"))return;
      itemForm.elements.bodyFormat.value = "markdown";
      source.value = state.editing.sectionKey === "outsideResearch" ? "## 从这里开始\n\n记录今天的想法。\n\n## 片段\n\n继续写下你的故事。" : "## 概览\n\n课程目标、实践背景或专题说明。\n\n## 内容安排\n\n| 讲次 | 主题 | 资料 |\n| --- | --- | --- |\n| 01 | 基础概念 | 在此填写资料链接 |\n\n## 笔记与推导\n\n行内公式 $E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n## 参考资料\n\n在下方相关链接中填写 arXiv、课程主页、代码或 PDF。";
      document.querySelector("#body-preview").hidden = true;
    }
    if (event.target.closest("[data-close-dialog]")) {
      event.preventDefault();
      closeItemDialog().catch((error) => showToast(error.message, "error"));
      return;
    }
    if (event.target.closest("[data-add-link]")) {
      const linkEditor = document.querySelector("#link-editor");
      const wrapper = document.createElement("div");
      wrapper.innerHTML = renderLinks([{ label: "", url: "" }]);
      linkEditor.append(wrapper.firstElementChild);
      linkEditor.querySelector(".link-row:last-child input")?.focus();
    }
    const removeButton = event.target.closest("[data-remove-link]");
    if (removeButton) removeButton.closest(".link-row").remove();
    if (event.target.closest("[data-remove-talk-pdf]")) {
      removeTalkPdf().catch((error) => showToast(error.message, "error"));
    }
  });

  itemForm.addEventListener("input", (event) => {
    const row = event.target.closest(".link-row");
    if(row) row.querySelector("[data-link-detected]").textContent = identifyLink(row.querySelector('[name="link-url"]').value,row.querySelector('[name="link-kind"]').value).label;
    if(event.target.name === "body" || event.target.name === "bodyFormat") { const preview=document.querySelector("#body-preview");if(preview)preview.hidden=true; }
  });

  itemForm.addEventListener("change", (event) => {
    if(event.target.id === "body-import") importBody(event.target.files[0]);
    if (event.target.name === "featured" && event.target.checked) {
      itemForm.elements.published.checked = true;
    }
    if (event.target.name === "published" && !event.target.checked) {
      itemForm.elements.featured.checked = false;
    }
    if (event.target.id === "talk-pdf-upload") {
      uploadTalkPdf(event.target.files[0]).catch((error) => showToast(error.message, "error"));
    }
    if (event.target.id === "talk-document-mode") changeTalkDocumentMode(event.target.value).catch((error) => showToast(error.message, "error"));
  });

  itemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const editing = state.editing;
    if (!editing || editing.uploading) return;
    if (editing.pendingDocument && !document.querySelector("#talk-pdf-confirm")?.checked) {
      showToast("请检查附件内容和版式，并勾选确认。", "error");
      return;
    }
    const item = collectItem();
    if ((item.documentMode === "pdf" && item.documentPages?.length && !item.documentPdf) || (item.documentMode === "images" && item.documentPdf && !item.documentPages?.length)) {
      showToast("当前没有所选展示方式需要的文件，请重新选择原 PDF。", "error");
      return;
    }
    if (!item.title) {
      showToast("条目标题不能为空。", "error");
      return;
    }
    if (item.readingMode === "external" && !item.links[0]?.url) { showToast("跳转阅读需要先填写第一个资料链接。","error"); return; }
    if (item.links.some((link) => !link.label || !link.url)) {
      showToast("每个链接都需要名称和地址。", "error");
      return;
    }
    if (item.links.some((link) => /^\/files\//i.test(link.url))) {
      showToast("不允许使用 /files/ 链接；请使用受控的站内页面或外部网页。", "error");
      return;
    }
    const items = state.content[editing.sectionKey];
    if (editing.index === null) items.push(item);
    else items[editing.index] = item;
    editing.pendingDocument = null;
    state.editing = null;
    itemDialog.close();
    markDirty();
    render();
  });

  itemDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeItemDialog().catch((error) => showToast(error.message, "error"));
  });

  publishForm.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-publish]")) publishDialog.close();
  });

  publishForm.addEventListener("submit", (event) => {
    event.preventDefault();
    publish();
  });

  document.querySelector("#save-button").addEventListener("click", saveDraft);
  document.querySelector("#publish-button").addEventListener("click", openPublishDialog);
  document.querySelector("#sync-button").addEventListener("click", syncCloud);
  document.querySelector("#shutdown-button").addEventListener("click", shutdownManager);

  window.addEventListener("beforeunload", (event) => {
    const hasPendingTalkDocument = Boolean(state.editing?.uploading || state.editing?.pendingDocument);
    if (!state.dirty && !hasPendingTalkDocument) return;
    event.preventDefault();
    event.returnValue = "";
  });

  loadContent();
})();
