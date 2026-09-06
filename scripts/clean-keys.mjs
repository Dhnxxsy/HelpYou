import fs from 'fs';

const p = 'client/src/i18n/keys.txt';
let list = fs.readFileSync(p, 'utf-8').split(/\r?\n/).filter(Boolean);

const isEmoji = (k) => {
  const s = k.replace(/[\uFE0F\u200D]/g, '');
  return s.length > 0 && /^\p{Extended_Pictographic}+$/u.test(s);
};

list = list.filter((k) => !isEmoji(k) && !k.includes('className="input flex-1"') && !k.includes('onKeyDown={(e) =>'));

list = list.map((k) =>
  k === "Masukkan folder, contoh: C:\\Data atau D:\\')}" ? 'Masukkan folder, contoh: C:\\Data atau D:\\' : k
);

const set = [...new Set(list)].sort((a, b) => a.localeCompare(b, 'id'));
fs.writeFileSync(p, set.join('\n') + '\n');
console.log('total=' + set.length);
console.log('emojiRemaining=' + set.filter(isEmoji).length);
console.log('hasPlaceholder=' + (set.find((k) => k.includes('Masukkan folder, contoh')) || 'NOT FOUND'));