import fs from "node:fs";
import path from "node:path";
const dir = "client/src/i18n";
const KEYS = {
  "Tampilkan tersembunyi": {
    en: "Show hidden", es: "Mostrar ocultos", fr: "Afficher les éléments masqués", de: "Verborgene anzeigen",
    pt: "Mostrar ocultos", it: "Mostra nascosti", nl: "Verborgen tonen", ru: "Показать скрытые",
    ar: "إظهار المخفي", tr: "Gizlileri göster", zh: "显示已隐藏", ja: "非表示を表示", ko: "숨김 표시",
  },
  "Tampilkan kembali": {
    en: "Show again", es: "Mostrar de nuevo", fr: "Réafficher", de: "Wieder anzeigen",
    pt: "Mostrar novamente", it: "Mostra di nuovo", nl: "Opnieuw tonen", ru: "Показать снова",
    ar: "إظهار مرة أخرى", tr: "Tekrar göster", zh: "重新显示", ja: "再表示", ko: "다시 표시",
  },
  "Disembunyikan.": {
    en: "Hidden.", es: "Ocultado.", fr: "Masqué.", de: "Verborgen.",
    pt: "Ocultado.", it: "Nascosto.", nl: "Verborgen.", ru: "Скрыто.",
    ar: "تم الإخفاء.", tr: "Gizlendi.", zh: "已隐藏。", ja: "非表示にしました。", ko: "숨김 처리했습니다.",
  },
  "Ditampilkan kembali.": {
    en: "Shown again.", es: "Mostrado de nuevo.", fr: "Réaffiché.", de: "Wieder angezeigt.",
    pt: "Mostrado novamente.", it: "Mostrato di nuovo.", nl: "Opnieuw getoond.", ru: "Снова показано.",
    ar: "تمت إعادته للظهور.", tr: "Tekrar gösterildi.", zh: "已重新显示。", ja: "再表示しました。", ko: "다시 표시했습니다.",
  },
  "Tersembunyi": {
    en: "Hidden", es: "Oculto", fr: "Masqué", de: "Verborgen",
    pt: "Oculto", it: "Nascosto", nl: "Verborgen", ru: "Скрыто",
    ar: "مخفي", tr: "Gizli", zh: "已隐藏", ja: "非表示", ko: "숨김",
  },
};
const FILES = ["en", "es", "fr", "de", "pt", "it", "nl", "ru", "ar", "tr", "zh", "ja", "ko"];

function extractKey(line) {
  const m = line.match(/^\s*['"]([^'"]+)['"]\s*:/);
  return m ? m[1] : null;
}

for (const code of FILES) {
  const file = path.join(dir, code + ".ts");
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  let added = 0;
  for (const [key, dict] of Object.entries(KEYS)) {
    const entry = `  '${key}': '${dict[code]}',`;
    const need = key.localeCompare;
    let insert = -1;
    for (let i = 0; i < lines.length; i++) {
      const k = extractKey(lines[i]);
      if (k == null) continue;
      if (k.localeCompare(key) > 0) { insert = i; break; }
    }
    if (insert === -1) insert = lines.findIndex((l) => l.trim() === "};");
    if (insert === -1) throw new Error(file + ": closing brace not found");
    // binary insert in sorted place
    lines.splice(insert, 0, entry);
    added++;
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  console.log(code + ": +" + added);
}