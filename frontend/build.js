// 简单的构建脚本：复制 HTML 到 dist 目录并注入 Wails runtime
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 复制 wailsjs 目录到 dist
const wailsjsSource = path.join(__dirname, 'wailsjs');
const wailsjsDest = path.join(distDir, 'wailsjs');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(wailsjsSource, wailsjsDest);
console.log('✓ 已复制 wailsjs 目录');

// 复制 index.html
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
fs.writeFileSync(path.join(distDir, 'index.html'), html);
console.log('✓ 已复制 index.html');

// 复制 css 目录到 dist/css
const cssSource = path.join(__dirname, 'css');
const cssDest = path.join(distDir, 'css');
copyDir(cssSource, cssDest);
console.log('✓ 已复制 css 目录');

// 复制图标资源到 dist/assets/
const assetsDir = path.join(__dirname, 'assets');
const distAssetsDir = path.join(distDir, 'assets');
if (!fs.existsSync(distAssetsDir)) {
  fs.mkdirSync(distAssetsDir, { recursive: true });
}
const assetFiles = ['kiro.svg', 'logo.svg', 'openai.svg', 'claude-color.svg', 'deepseek-color.svg',
  'grok.svg', 'qwen-color.svg', 'chatglm-color.svg', 'minimax-color.svg', 'outlook.png', 'appicon.png',
  'wx.jpg', 'zfb.jpg'];
for (const file of assetFiles) {
  const src = path.join(assetsDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distAssetsDir, file));
  }
}
console.log('✓ 已复制 assets/ 图标资源 (' + assetFiles.length + ' 个)');

// removed redundant css lines

// 复制 fonts 目录到 dist/fonts/
const fontsSource = path.join(__dirname, 'fonts');
const fontsDest = path.join(distDir, 'fonts');
copyDir(fontsSource, fontsDest);
console.log('✓ 已复制 fonts 目录');

// 复制 JS 到 dist/js/
const jsDir = path.join(__dirname, 'js');
const distJsDir = path.join(distDir, 'js');
if (!fs.existsSync(distJsDir)) {
  fs.mkdirSync(distJsDir, { recursive: true });
}
const jsFiles = ['i18n.js', 'accounts.js', 'task.js', 'overview.js', 'app.js', 'moemail.js', 'cloudmail.js', 'mailnest.js', 'remail.js', 'email_providers.js', 'ui.js', 'subscription.js', 'proxy_pool.js', 'waf_config.js'];
for (const file of jsFiles) {
  fs.copyFileSync(path.join(jsDir, file), path.join(distJsDir, file));
}
console.log('✓ 已复制 js/ 脚本 (' + jsFiles.length + ' 个)');

console.log('✓ Build completed: frontend/dist/');
