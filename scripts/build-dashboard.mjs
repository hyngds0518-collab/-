// index.html + assets 를 단일 HTML 파일(dist/meeting-dashboard.html)로 묶는다.
// 사용법: node scripts/build-dashboard.mjs
import fs from 'fs';
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<link rel="stylesheet" href="(assets\/[^"]+)">/g, (_, p) => '<style>\n' + fs.readFileSync(p, 'utf8') + '\n</style>');
html = html.replace(/<script src="(assets\/[^"]+)"><\/script>/g, (_, p) => '<script>\n' + fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/meeting-dashboard.html', html);
console.log('dist/meeting-dashboard.html', Math.round(html.length / 1024) + 'KB');
