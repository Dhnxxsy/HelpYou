import fs from "node:fs";
import path from "node:path";
const dir = "client/src/i18n";
const KEYS = {
  "Main": {
    en: "Play", es: "Jugar", fr: "Jouer", de: "Spielen",
    pt: "Jogar", it: "Gioca", nl: "Spelen", ru: "Играть",
    ar: "تشغيل", tr: "Oyna", zh: "游玩", ja: "プレイ", ko: "게임",
  },
};
const FILES = ["en","es","fr","de","pt","it","nl","ru","ar","tr","zh","ja","ko"];
for (const code of FILES) {
  const file = path.join(dir, code + ".ts");
  const src = fs.readFileSync(file, "utf8");
  let block = "";
  for (const [key, dict] of Object.entries(KEYS)) block += `  "${key}": "${dict[code]}",\n`;
  const idx = src.lastIndexOf("};");
  fs.writeFileSync(file, src.slice(0, idx) + block + "};" + src.slice(idx + 2), "utf8");
  console.log(code + ": +" + Object.keys(KEYS).length);
}
