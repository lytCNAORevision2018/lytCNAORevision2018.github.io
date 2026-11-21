@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)

node -e "const major=Number(process.versions.node.split('.')[0]);process.exit(major>=22?0:1)"
if errorlevel 1 (
  echo [错误] Node.js 版本过低，需要 22 或更高版本。
  node --version
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Git，请先安装 Git for Windows。
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [错误] 当前目录不是 Git 仓库。
  pause
  exit /b 1
)

git config --get user.name >nul 2>nul
if errorlevel 1 (
  echo [错误] Git 尚未配置 user.name，请先配置提交姓名。
  pause
  exit /b 1
)

git config --get user.email >nul 2>nul
if errorlevel 1 (
  echo [错误] Git 尚未配置 user.email，请先配置提交邮箱。
  pause
  exit /b 1
)

node "%~dp0tools\site-manager\server.mjs" --check-pdf-tools >nul 2>nul
if errorlevel 1 (
  echo [提示] 未检测到 Poppler。普通内容仍可维护，但暂时不能上传“分享与讲座”PDF。
  echo        可在 PowerShell 运行：winget install --id oschwartz10612.Poppler -e
  echo.
)

echo 正在启动个人主页管理器...
node "%~dp0tools\site-manager\server.mjs"

echo.
echo 管理器已停止。如上方有错误，请保留本窗口中的提示。
pause
