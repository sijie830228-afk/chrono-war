// 把「人類使用處」資料夾中的所有圖片內嵌成 js/art-images.js（base64 data URL）
// 原因：直接雙擊 index.html（file://）開啟時，瀏覽器禁止讀取本機圖片的像素，
//       內嵌後才能做去背、裁切臉部等處理。
// 檔名即對應名稱：凱恩.jpg、龍爪.jpg、阿蘭.jpg、莫卡兄弟-兄.png、莫卡兄弟-弟.png、
//                  戈登.jpg、亞歷山卓.jpg、寒夜.png、虛影.jpg（抽卡演出用）、敵人素材1～3.jpg（敵人剪影，類型對應見 js/art.js 的 ENEMY_LOOK）
// 大於 400 KB 的圖片會先縮到高度 1024（macOS：長邊 1024） 並轉成 JPEG（Windows 用系統內建的 System.Drawing，macOS 用 sips），
// 原始檔案不會被修改。
// 用法：新增或更換圖片後，在專案資料夾執行  node tools/embed-art.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, '人類使用處');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const BIG = 400 * 1024, MAX_H = 1024;

/** 縮小並轉成 JPEG；失敗（不是 Windows／macOS）就回傳 null，改用原檔 */
function shrink(file) {
  const out = path.join(os.tmpdir(), `embed-art-${process.pid}-${Date.now()}.jpg`);
  if (process.platform === 'darwin') {   // macOS：用系統內建的 sips；有透明背景的 PNG 縮小後維持 PNG（不必再去背）
    try {
      const alpha = /\.png$/i.test(file) && /hasAlpha: yes/.test(execFileSync('sips', ['-g', 'hasAlpha', file], { encoding: 'utf8' }));
      const dst = alpha ? out.replace(/\.jpg$/, '.png') : out;
      execFileSync('sips', ['-Z', String(MAX_H)].concat(alpha ? [] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90'], [file, '--out', dst]), { stdio: 'pipe' });
      return fs.existsSync(dst) ? dst : null;
    } catch (e) {
      return null;
    }
  }
  if (process.platform !== 'win32') return null;
  const q = s => s.replace(/'/g, "''");
  const ps = [
    'Add-Type -AssemblyName System.Drawing',
    `$i = [System.Drawing.Image]::FromFile('${q(file)}')`,
    `$s = [Math]::Min(1.0, ${MAX_H} / $i.Height)`,
    '$w = [int]($i.Width * $s); $h = [int]($i.Height * $s)',
    '$b = New-Object System.Drawing.Bitmap $w, $h',
    '$g = [System.Drawing.Graphics]::FromImage($b)',
    '$g.Clear([System.Drawing.Color]::White)',   // 透明的地方填白，之後的去背會處理
    "$g.InterpolationMode = 'HighQualityBicubic'",
    '$g.DrawImage($i, 0, 0, $w, $h)',
    "$c = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
    '$p = New-Object System.Drawing.Imaging.EncoderParameters 1',
    '$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]90)',
    `$b.Save('${q(out)}', $c, $p)`,
    '$g.Dispose(); $b.Dispose(); $i.Dispose()',
  ].join('; ');
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'pipe' });
    return fs.existsSync(out) ? out : null;
  } catch (e) {
    return null;
  }
}

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => MIME[path.extname(f).toLowerCase()]) : [];
if (!files.length) {
  console.error('找不到圖片：請把 .jpg / .png / .webp 放進「人類使用處」資料夾');
  process.exit(1);
}
let body = '';
let total = 0;
for (const f of files) {
  const src = path.join(dir, f);
  let buf = fs.readFileSync(src), mime = MIME[path.extname(f).toLowerCase()], note = '';
  if (buf.length > BIG) {
    const small = shrink(src);
    if (small) {
      const b2 = fs.readFileSync(small);
      fs.unlinkSync(small);
      note = `（原檔 ${(buf.length / 1024).toFixed(0)} KB，已縮小）`;
      buf = b2; mime = /\.png$/.test(small) ? 'image/png' : 'image/jpeg';
    }
  }
  total += buf.length;
  const name = path.basename(f, path.extname(f));
  body += `  ${JSON.stringify(name)}: 'data:${mime};base64,${buf.toString('base64')}',\n`;
  console.log(`  ${f}（${(buf.length / 1024).toFixed(1)} KB）${note}`);
}
fs.writeFileSync(path.join(root, 'js', 'art-images.js'),
  `// 由 tools/embed-art.js 自動產生（來源：人類使用處/），請勿手動編輯\n'use strict';\n` +
  `const ART_IMAGES = {\n${body}};\n` +
  `const GHOST_IMAGE = ART_IMAGES['虛影'];\n`);
console.log(`已內嵌 ${files.length} 張圖片（共 ${(total / 1024).toFixed(0)} KB）→ js/art-images.js`);
