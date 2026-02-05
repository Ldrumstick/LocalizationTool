# 设置 Electron 镜像 (解决下载 electron-v28.3.3-win32-x64.zip 失败)
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

# 设置 Electron Builder 工具链镜像 (解决下载 winCodeSign/nsis 失败)
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

# 清理可能损坏的缓存 (可选，为了保险起见)
# Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache" -ErrorAction SilentlyContinue

# 运行构建
npm run build:win
