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
    activeSection: "profile",
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
      button.disabled = busy;
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
    if (changeCount) syncParts.push(`${changeCount} 个仓库修改`);
    if (state.git?.ahead) syncParts.push(`领先云端 ${state.git.ahead}`);
    if (state.git?.behind) syncParts.push(`落后云端 ${state.git.behind}`);
    gitStatus.textContent = syncParts.join(" · ") || "仓库已同步";
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
      { key: "profile", label: "基本资料", count: "" },
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
          <h1>基本资料</h1>
          <p>站点标题、个人介绍、联系方式与全站侧栏资料。</p>
        </div>
      </div>
      <div class="form-grid" id="profile-form">
        ${inputField({ path: "meta.siteTitle", label: "站点标题" })}
        ${inputField({ path: "meta.description", label: "搜索与分享描述" })}
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
            <img id="avatar-preview"${avatar ? ` src="${escapeHtml(state.siteUrl.replace(/\/$/, ""))}/images/${escapeHtml(avatar)}"` : ""} alt="当前头像"${avatar ? "" : " hidden"}>
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

  function sectionDefinition(key) {
    return state.sections.find((section) => section.key === key);
  }

  function renderSection(key) {
    const definition = sectionDefinition(key);
    const items = state.content[key];
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
      ${items.length === 0 ? `<div class="empty-state">当前没有${escapeHtml(definition.label)}条目。</div>` : `
        <div class="entry-list">
          ${items.map((item, index) => `
            <article class="entry-row">
              <div>
                <h2>${escapeHtml(item.title)}</h2>
                ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
                <div class="entry-flags">
                  <span class="entry-flag ${item.published ? "entry-flag--published" : ""}">${item.published ? "公开" : "本地草稿"}</span>
                  ${item.featured ? '<span class="entry-flag">首页展示</span>' : ""}
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
    else renderSection(state.activeSection);
    editor.focus({ preventScroll: true });
    updateStatus();
  }

  function newItem(sectionKey) {
    return {
      id: `${sectionKey}-${Date.now().toString(36)}`,
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
        <button class="icon-button" type="button" data-remove-link aria-label="删除链接">×</button>
      </div>
    `).join("");
  }

  function itemField(field, item) {
    const value = item[field.name] ?? "";
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
      const pdfAvailable = state.pdfTools?.available !== false;
      return `<div class="field field--wide talk-pdf-field">
        <span>${escapeHtml(field.label)}</span>
        <div class="talk-pdf-actions">
          <label id="talk-pdf-upload-label" class="button button--secondary${pdfAvailable ? "" : " button--disabled"}" aria-disabled="${pdfAvailable ? "false" : "true"}">选择 PDF 并转为页面图片<input id="talk-pdf-upload" type="file" accept="application/pdf,.pdf"${pdfAvailable ? "" : " disabled"} hidden></label>
          <button class="button button--quiet button--danger" type="button" data-remove-talk-pdf${pages.length ? "" : " hidden"}>移除讲义</button>
        </div>
        <p id="talk-pdf-status" class="field-help">${pdfAvailable
          ? (pages.length ? `已转换 ${pages.length} 页。发布时只上传页面图片，不上传原 PDF。` : "原 PDF 会在本机临时处理，转换结束后删除，不会上传到 GitHub。")
          : escapeHtml(state.pdfTools.message)}</p>
        <label id="talk-pdf-confirm-row" class="talk-pdf-confirm" hidden><input id="talk-pdf-confirm" type="checkbox">我已逐页检查字体、缺字、裁切和版式</label>
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
      const raw = String(formData.get(field.name) || "").trim();
      if (field.type === "lines") item[field.name] = raw ? raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) : [];
      else if (field.type === "tags") item[field.name] = raw ? [...new Set(raw.split(/[，,]/).map((value) => value.trim()).filter(Boolean))] : [];
      else item[field.name] = raw;
    }
    item.links = [...itemFormFields.querySelectorAll(".link-row")].map((row) => ({
      label: row.querySelector('[name="link-label"]').value.trim(),
      url: row.querySelector('[name="link-url"]').value.trim()
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
    const pages = state.editing.item.documentPages || [];
    container.innerHTML = pages.map((page, index) => {
      const parts = page.replace(/^\/images\/talk-documents\//, "").split("/");
      if (parts.length !== 3) return "";
      const previewUrl = `/preview/talk-documents/${parts.map(encodeURIComponent).join("/")}?token=${encodeURIComponent(token)}`;
      return `<figure><img src="${previewUrl}" alt="讲义第 ${index + 1} 页预览" loading="lazy" draggable="false"><figcaption>第 ${index + 1} 页</figcaption></figure>`;
    }).join("");
  }

  function updateTalkPdfControls() {
    if (!state.editing) return;
    const pages = state.editing.item.documentPages || [];
    const removeButton = document.querySelector("[data-remove-talk-pdf]");
    if (removeButton) removeButton.hidden = pages.length === 0;
    const confirmRow = document.querySelector("#talk-pdf-confirm-row");
    if (confirmRow) confirmRow.hidden = !state.editing.pendingDocument;
    renderTalkPdfPreview();
  }

  function setItemDialogBusy(busy) {
    if (!state.editing) return;
    state.editing.uploading = busy;
    itemForm.setAttribute("aria-busy", busy ? "true" : "false");
    const uploadLabel = document.querySelector("#talk-pdf-upload-label");
    if (uploadLabel) {
      const uploadDisabled = busy || state.pdfTools?.available === false;
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
    const editing = state.editing;
    const sessionId = editing.sessionId;
    const itemId = editing.item.id;
    const baseRevision = state.revision;
    const status = document.querySelector("#talk-pdf-status");
    if (status) status.textContent = "正在本机转换 PDF，请稍候……";
    setItemDialogBusy(true);
    try {
      const dataUrl = await new Promise((resolveReader, rejectReader) => {
        const reader = new FileReader();
        reader.onload = () => resolveReader(reader.result);
        reader.onerror = () => rejectReader(reader.error);
        reader.readAsDataURL(file);
      });
      const payload = await api("/api/talk-document", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          mimeType: "application/pdf",
          data: String(dataUrl).split(",")[1],
          baseRevision
        })
      });
      const pending = { itemId, documentId: payload.documentId };
      if (!state.editing || state.editing.sessionId !== sessionId) {
        await discardPendingTalkDocument(pending, baseRevision).catch(() => undefined);
        return;
      }
      if (editing.pendingDocument) {
        await discardPendingTalkDocument(editing.pendingDocument, baseRevision).catch(() => undefined);
      }
      editing.pendingDocument = pending;
      editing.item.documentPages = payload.pages;
      if (status) status.textContent = `已转换 ${payload.pages.length} 页。请逐页检查字体和版式；临时原 PDF 已删除。`;
      const confirmation = document.querySelector("#talk-pdf-confirm");
      if (confirmation) confirmation.checked = false;
      updateTalkPdfControls();
      showToast(payload.message);
    } catch (error) {
      if (status) status.textContent = "转换失败，请检查 PDF 是否损坏、加密、页数或生成图片大小是否超限。";
      showToast(error.message, "error");
    } finally {
      if (state.editing?.sessionId === sessionId) setItemDialogBusy(false);
      if (input) input.value = "";
    }
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
    } finally {
      if (state.editing?.sessionId === sessionId) setItemDialogBusy(false);
    }
    const status = document.querySelector("#talk-pdf-status");
    if (status) status.textContent = "讲义已移除；保存条目并发布后，云端页面图片才会删除。";
    updateTalkPdfControls();
    showToast("讲义已从当前条目移除。");
  }

  async function closeItemDialog() {
    const editing = state.editing;
    if (!editing) return;
    if (editing.uploading) {
      showToast("PDF 仍在转换，请等待完成后再关闭。", "error");
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

  async function uploadAvatar(file) {
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
    setBusy(true);
    try {
      const payload = await api("/api/avatar", {
        method: "POST",
        body: JSON.stringify({
          mimeType: file.type,
          data: base64,
          baseRevision: state.revision,
          baseCommit: state.baseCommit
        })
      });
      state.content.profile.avatar = payload.avatar;
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.source = "draft";
      const preview = document.querySelector("#avatar-preview");
      preview.src = dataUrl;
      preview.hidden = false;
      document.querySelector("#avatar-fallback").hidden = true;
      updateStatus();
      showToast(payload.message);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!state.content.profile.avatar) return;
    if (!window.confirm("确定移除当前头像吗？下次发布后，网站会改用姓名首字回退头像。")) return;
    setBusy(true);
    try {
      const payload = await api("/api/avatar/remove", {
        method: "POST",
        body: JSON.stringify({
          baseRevision: state.revision,
          baseCommit: state.baseCommit
        })
      });
      state.content.profile.avatar = "";
      state.revision = payload.revision;
      state.baseCommit = payload.baseCommit;
      state.source = "draft";
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
    if (event.target.id === "avatar-upload") uploadAvatar(event.target.files[0]);
  });

  editor.addEventListener("click", (event) => {
    if (state.busy) return;
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

  itemForm.addEventListener("change", (event) => {
    if (event.target.name === "featured" && event.target.checked) {
      itemForm.elements.published.checked = true;
    }
    if (event.target.name === "published" && !event.target.checked) {
      itemForm.elements.featured.checked = false;
    }
    if (event.target.id === "talk-pdf-upload") {
      uploadTalkPdf(event.target.files[0]).catch((error) => showToast(error.message, "error"));
    }
  });

  itemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const editing = state.editing;
    if (!editing || editing.uploading) return;
    if (editing.pendingDocument && !document.querySelector("#talk-pdf-confirm")?.checked) {
      showToast("请逐页检查讲义字体和版式，并勾选确认。", "error");
      return;
    }
    const item = collectItem();
    if (!item.title) {
      showToast("条目标题不能为空。", "error");
      return;
    }
    if (item.links.some((link) => !link.label || !link.url)) {
      showToast("每个链接都需要名称和地址。", "error");
      return;
    }
    if (item.links.some((link) => /\.pdf(?:$|[/?#&=])|(?:[?&#](?:format|type|download|file|filename)=[^&#]*\bpdf\b)/i.test(link.url))) {
      showToast("不允许直接链接 PDF。请在“分享与讲座”中上传，由管理器转换为页面图片。", "error");
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
