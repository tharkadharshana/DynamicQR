import fs from 'fs';
const html = fs.readFileSync('/scnr-dashboard.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
fs.writeFileSync('/src/scnr.css', css);
