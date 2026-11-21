# 维护与贡献规则

本仓库是李雨桐个人主页的源代码和内容仓库，不再作为 Academic Pages 通用模板维护。提交前应先判断变更属于“日常内容”还是“代码与发布基础设施”，两类变更使用不同流程。

## 一、日常内容变更

个人资料、教育经历、项目、实践、奖项、分享、笔记和技能等内容应通过仓库根目录的 `主页管理器.cmd` 修改。

- 公开内容统一写入 `_data/site_content.json`。
- 本机未公开内容保存在 `.site-manager/draft.json`，不得提交。
- 尚未正式发布的管理器候选由 `.site-manager/pending-publish.json` 绑定完整 SHA 与远端父提交；不得手改、删除或用手工提交冒充候选。
- 共享头像和网站独立头像分别由管理器写入 `images/profile-user.*` 与 `images/website-profile.*`；替换或移除成功后，管理器会清理不再引用的扩展版本。
- 每份讲义可在管理器中选择原 PDF 或逐页图片。公开文件统一位于 `images/talk-documents/`；图片模式的原 PDF 仅保存在本机草稿缓存。
- 不要在首页、栏目页和简历模板中重复维护同一份个人资料。

首次站点迁移是一次性例外：只有远端仍处于程序记录的迁移基线时，管理器才允许提交经过人工核对的整套改造文件。首次迁移完成后，日常发布范围收窄为公开内容 JSON、头像和所选讲义附件。

## 二、代码与工作流变更

以下变更不得夹带在日常内容发布中：

- `tools/site-manager/` 和 `主页管理器.cmd`。
- `.github/workflows/`、`scripts/`、`package.json` 和构建配置。
- `_includes/`、`_layouts/`、`_pages/`、`_sass/`、`assets/` 等站点模板与样式。
- `_data/home_sections.json`、`_data/website_text.json` 等默认设置定义；用户对首页及说明文字的日常选择写入 `_data/site_content.json`。
- `README.md`、`维护主页说明.md`、`CONTRIBUTING.md` 等维护文档。

这类变更应在独立分支完成，查看完整 diff，并由另一位维护者或一次独立的人工审查确认后再合并。尤其不能在同一个候选提交中削弱工作流、审计脚本或内容规则，再依赖被修改后的检查为自己放行。

完成代码或工作流合并后，内容维护者应先同步最新 `master`，重新启动管理器，再继续日常发布。

## 三、验证要求

所有变更至少运行以下 Node.js 检查：

```powershell
node scripts/test-content.mjs
node scripts/test-site-manager.mjs
node scripts/validate-content.mjs
node scripts/audit-site.mjs --source
```

管理器集成测试只使用系统临时目录中的隔离工作树、本地 bare origin 和随机端口，不得改成连接真实 `origin` 的测试。

修改管理器或内容模型时还应运行语法检查：

```powershell
node --check tools/site-manager/server.mjs
node --check tools/site-manager/lib/content.mjs
node --check tools/site-manager/public/app.js
```

有 Ruby/Jekyll 环境时，继续验证实际构建产物：

```powershell
bundle install
bundle exec jekyll build
node scripts/audit-site.mjs --site _site
```

无法在本机执行 Jekyll 构建时，应在提交说明中明确记录，并等待 GitHub Actions 的构建与成品审计通过。不得把未执行的检查写成已通过。

## 四、发布限制

- 不得绕过候选验证，直接把内容或代码推送到 `master`。
- 通过主页管理器发布时，应等待 `site-manager-validation/**` 候选分支上的精确候选 SHA 通过完整检查，再由管理器更新 `master`。
- 不得把较早候选分支的成功结果用于新的提交。
- 不得为了通过发布而删除不明修改、使用破坏性重置或忽略冲突。
- 临时验证分支清理失败时，按管理器给出的完整分支名删除并复核。

以上规则是仓库维护政策。GitHub 侧还应配置分支规则和最小必要写权限，减少普通 Git 命令绕过管理器流程的可能。

## 五、PDF 规则

- 依据维护者要求，每条“分享与讲座”可以选择“原 PDF”或“逐页图片”，旧条目默认沿用图片方式。
- 只有勾选公开、且明确选择原 PDF 的讲义，其 `documentPdf` 引用的 `images/talk-documents/<条目>/<版本>/document.pdf` 才允许进入公开提交和构建产物。
- 图片方式只发布 `documentPages` 引用的页面图片，不公开本机缓存中的原件。未公开条目的两种文件都不得进入公开提交。
- 原件与图片模式都应在编辑窗口检查预览；图片转换继续使用 Poppler。
- 普通资料链接继续使用网页；讲义通过上述上传入口管理，不手工添加其他 PDF 或 `/files/` 链接。
- 切换或移除仅影响当前公开树；旧历史、缓存和外部备份中的文件不会自动消失。

如确需重写历史以清除旧 PDF，必须单独评估影响并取得明确授权。不要在普通内容或代码贡献中执行强制推送。

## 六、提交前检查

1. 使用 `git status --short` 确认变更来源。
2. 确认日常内容与代码/工作流变更没有混在一起。
3. 运行适用于本次变更的测试、源审计和构建审计。
4. 检查没有未选择公开的 PDF、模板占位内容、失效站内链接和意外公开的本机文件。
5. 在提交说明中记录已执行的检查及未能执行的检查。
6. 通过候选验证或人工审查流程合并，不直接推送 `master`。
