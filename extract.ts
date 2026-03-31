import fs from 'fs';
const html = fs.readFileSync('/dynamicqr-dashboard.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
fs.writeFileSync('/src/dynamicqr.css', css);
