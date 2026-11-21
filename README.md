# 李雨桐的个人主页

线上地址：<https://lytcnaorevision2018.github.io/>

这是一个由 Jekyll 构建的个人主页仓库。公开的个人资料、首页内容、栏目页、个人简历、导航可见性和 SEO 元信息统一读取 `_data/site_content.json`，日常维护通过仓库根目录的 `主页管理器.cmd` 完成。

## 内容与草稿

- `_data/site_content.json` 是网站的单一公开内容源；不应再分别维护首页、栏目页和简历中的同一条资料。
- `.site-manager/draft.json` 是本机草稿，可同时保留公开和未公开条目，已被 Git 忽略。
- `.site-manager/pending-publish.json` 只记录管理器创建且尚未正式发布的候选提交；它用于阻止手工或中间提交被误带入公开历史。
- `公开发布`决定条目是否进入公开内容源；`在首页展示`决定公开条目是否同时出现在首页。
- 发布时，管理器只把标记为公开的条目写入 `_data/site_content.json`。未公开条目继续保留在本机草稿中。

## 日常维护

环境要求：Windows、Node.js 22 或更高版本、Git for Windows，以及已配置的 Git 提交姓名和邮箱。只有转换“分享与讲座”中的 PDF 时才需要 Poppler。

1. 双击 `主页管理器.cmd`。
2. 在浏览器中编辑资料和条目。
3. 点击 `保存草稿`，先把当前内容写入本机草稿。
4. 需要获取远端更新时点击 `同步云端`；存在未保存内容、本地提交或版本冲突时，管理器会停止同步。
5. 点击 `发布到云端`并确认提交说明。管理器会先把候选提交推送到一次性验证分支，等待 GitHub Actions 完整构建和审计。
6. 只有候选提交验证成功，且等待期间本地 `HEAD` 与远端 `master` 均未变化，管理器才会更新 `master`。失败时 `master` 不变；远端基准未变化时，修复后可由管理器覆盖原候选并重新验证，不把失败版本追加进正式历史。若远端已经变化，应保留现场并按维护说明进行人工核对。
7. 管理器提示正式推送成功后，再确认 GitHub Pages 部署并检查线上页面。

完整的首次发布、冲突处理、失败恢复和故障排查见 [维护主页说明.md](维护主页说明.md)。

网站形象独立设置、首页模块编排、更新时间与说明文字开关的使用方法见 [首页与栏目调整指南.md](首页与栏目调整指南.md)。网站身份可逐字段选择跟随正式资料或独立设置；简历继续使用正式资料。

首次迁移允许管理器提交经过人工审查的站点改造文件；迁移完成后，日常发布范围收窄为公开内容 JSON、头像和所选讲义附件。管理器代码、校验脚本和工作流的后续修改应单独人工审查，不能夹带在日常内容发布中。候选验证约束的是管理器流程；仓库还应使用分支规则限制绕过管理器的直接 `master` 推送。

## PDF 与字体边界

“分享与讲座”每份讲义都可选择 **原 PDF** 或 **逐页图片**。原 PDF 模式提供原文件预览、打开和下载，不需要 Poppler；图片模式使用 Poppler 转为逐页 JPEG，公开时只上传图片。原件保存在本机缓存中，方便日后切换。旧版只有图片的讲义，首次切回原 PDF 需要重新上传原件。切换展示方式不会清除旧提交或外部缓存。

网站正文与管理器使用以下字体回退顺序：`Noto Sans SC`、`Source Han Sans SC`、`PingFang SC`、`Microsoft YaHei`、系统无衬线字体。仓库不加载第三方中文 Web 字体，因此不同设备的实际字形可能不同。

## 本地检查

在仓库根目录运行：

```powershell
node scripts/test-content.mjs
node scripts/test-site-manager.mjs
node scripts/validate-content.mjs
node scripts/audit-site.mjs --source
bundle exec jekyll build
node scripts/audit-site.mjs --site _site
```

前四项只需要 Node.js 和 Git；管理器集成测试会在系统临时目录创建隔离工作树、本地 bare origin 和随机端口，不连接真实仓库。Jekyll 本地构建还需要 Ruby、Bundler 和 `bundle install` 安装的依赖；未配置 Ruby 环境时，应至少完成前四项，并以 GitHub Actions 的构建审计结果为准。
