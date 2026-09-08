import fs from 'node:fs';
import path from 'node:path';

/**
 * Uniform helper to add new i18n keys across all 13 dictionaries.
 * - Keys are inserted in sorted (id) position, matching each dict's style.
 * - Idempotent: keys already present in a dictionary are skipped.
 * - Preserves each file's existing line-ending style (CRLF vs LF).
 * - Escapes apostrophes / backslashes inside keys and values.
 * - After writing, re-syncs client/src/i18n/keys.txt from en.ts.
 *
 * Usage:
 *   node scripts/i18n-add-keys.mjs            # apply + sync keys.txt
 *   node scripts/i18n-add-keys.mjs --dry-run  # preview without writing
 *
 * To add keys: put them in KEYS below. The Indonesian phrase is the key;
 * provide the 13 translations exactly like the entries already in the file.
 */
const dir = 'client/src/i18n';
const CODES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'ar', 'tr', 'zh', 'ja', 'ko'];

/** Add an object per Indonesian key with all 13 translations (en, es, fr, de, pt, it, nl, ru, ar, tr, zh, ja, ko). */
const KEYS = {
  'Rak Game': {
    en: 'Game Shelf',
    es: 'Estante de Juegos',
    fr: 'Étagère de Jeux',
    de: 'Spielregal',
    pt: 'Prateleira de Jogos',
    it: 'Scaffale Giochi',
    nl: 'Spellenplank',
    ru: 'Полка игр',
    ar: 'رف الألعاب',
    tr: 'Oyun Rafı',
    zh: '游戏架',
    ja: 'ゲーム棚',
    ko: '게임 선반',
  },
  'Koleksi game favoritmu dalam satu tempat.': {
    en: 'All your favorite games in one place.',
    es: 'Todos tus juegos favoritos en un solo lugar.',
    fr: 'Tous vos jeux préférés dans un seul endroit.',
    de: 'Alle deine Lieblingsspiele an einem Ort.',
    pt: 'Todos os seus jogos favoritos em um só lugar.',
    it: 'Tutti i tuoi giochi preferiti in un unico posto.',
    nl: 'Al je favoriete spellen op één plek.',
    ru: 'Все любимые игры в одном месте.',
    ar: 'كل ألعابك المفضلة في مكان واحد.',
    tr: 'Tüm favori oyunlarınız tek bir yerde.',
    zh: '你所有喜欢的游戏都在一个地方。',
    ja: 'お気に入りのゲームをひとつの場所に。',
    ko: '즐겨찾는 게임을 한 곳에 모아두세요.',
  },
  'Tambah Game': {
    en: 'Add Game',
    es: 'Añadir Juego',
    fr: 'Ajouter un Jeu',
    de: 'Spiel hinzufügen',
    pt: 'Adicionar Jogo',
    it: 'Aggiungi Gioco',
    nl: 'Spel toevoegen',
    ru: 'Добавить игру',
    ar: 'إضافة لعبة',
    tr: 'Oyun Ekle',
    zh: '添加游戏',
    ja: 'ゲームを追加',
    ko: '게임 추가',
  },
  'Tambah ke Rak Game': {
    en: 'Add to Game Shelf',
    es: 'Añadir a la Estante de Juegos',
    fr: "Ajouter à l'Étagère de Jeux",
    de: 'Zum Spielregal hinzufügen',
    pt: 'Adicionar à Prateleira de Jogos',
    it: 'Aggiungi allo Scaffale Giochi',
    nl: 'Toevoegen aan spellenplank',
    ru: 'Добавить на полку игр',
    ar: 'إضافة إلى رف الألعاب',
    tr: 'Oyun Rafına Ekle',
    zh: '添加到游戏架',
    ja: 'ゲーム棚に追加',
    ko: '게임 선반에 추가',
  },
  'Pilih item yang sudah ada di Pusat Aplikasi & Game.': {
    en: 'Pick items already in the App & Game Center.',
    es: 'Elige elementos que ya están en el Centro de Apps y Juegos.',
    fr: "Choisissez des éléments déjà présents dans le Centre d'Applications et de Jeux.",
    de: 'Wähle Elemente, die bereits im App- & Spielcenter vorhanden sind.',
    pt: 'Escolha itens que já estão no Centro de Apps e Jogos.',
    it: 'Scegli elementi già presenti nel Centro di App e Giochi.',
    nl: 'Kies items die al in het App- & Spellencentrum staan.',
    ru: 'Выберите элементы, уже добавленные в центр приложений и игр.',
    ar: 'اختر عناصر موجودة بالفعل في مركز التطبيقات والألعاب.',
    tr: 'Zaten Uygulama ve Oyun Merkezinde bulunan öğeleri seçin.',
    zh: '选择应用和游戏中心中已有的项目。',
    ja: 'アプリ＆ゲームセンターにある項目を選択してください。',
    ko: '앱 & 게임 센터에 있는 항목을 선택하세요.',
  },
  'Simpan ({n})': {
    en: 'Save ({n})',
    es: 'Guardar ({n})',
    fr: 'Enregistrer ({n})',
    de: 'Speichern ({n})',
    pt: 'Salvar ({n})',
    it: 'Salva ({n})',
    nl: 'Opslaan ({n})',
    ru: 'Сохранить ({n})',
    ar: 'حفظ ({n})',
    tr: 'Kaydet ({n})',
    zh: '保存 ({n})',
    ja: '保存 ({n})',
    ko: '저장 ({n})',
  },
  'Belum ada yang dipilih.': {
    en: 'Nothing selected yet.',
    es: 'Nada seleccionado todavía.',
    fr: "Rien n'est sélectionné.",
    de: 'Noch nichts ausgewählt.',
    pt: 'Nada selecionado ainda.',
    it: 'Non hai ancora selezionato nulla.',
    nl: 'Nog niets geselecteerd.',
    ru: 'Ничего не выбрано.',
    ar: 'لم يتم تحديد أي شيء بعد.',
    tr: 'Henüz hiçbir şey seçilmedi.',
    zh: '尚未选择任何内容。',
    ja: 'まだ何も選択されていません。',
    ko: '아직 선택된 항목이 없습니다.',
  },
  'Tidak ada item yang cocok.': {
    en: 'No matching items.',
    es: 'No hay elementos coincidentes.',
    fr: 'Aucun élément correspondant.',
    de: 'Keine passenden Elemente.',
    pt: 'Nenhum item correspondente.',
    it: 'Nessun elemento corrispondente.',
    nl: 'Geen overeenkomende items.',
    ru: 'Нет подходящих элементов.',
    ar: 'لا توجد عناصر مطابقة.',
    tr: 'Eşleşen öğe yok.',
    zh: '没有匹配的项目。',
    ja: '一致する項目がありません。',
    ko: '일치하는 항목이 없습니다.',
  },
  Katalog: {
    en: 'Catalog',
    es: 'Catálogo',
    fr: 'Catalogue',
    de: 'Katalog',
    pt: 'Catálogo',
    it: 'Catalogo',
    nl: 'Catalogus',
    ru: 'Каталог',
    ar: 'الفهرس',
    tr: 'Katalog',
    zh: '目录',
    ja: 'カタログ',
    ko: '카탈로그',
  },
  'Belum ada game di rak.': {
    en: 'No games on the shelf yet.',
    es: 'Aún no hay juegos en la estante.',
    fr: "Aucun jeu sur l'étagère pour l'instant.",
    de: 'Noch keine Spiele im Regal.',
    pt: 'Ainda não há jogos na prateleira.',
    it: 'Non ci sono ancora giochi nello scaffale.',
    nl: 'Nog geen spellen op de plank.',
    ru: 'На полке пока нет игр.',
    ar: 'لا توجد ألعاب على الرف بعد.',
    tr: 'Rafta henüz oyun yok.',
    zh: '架子上还没有游戏。',
    ja: '棚にはまだゲームがありません。',
    ko: '선반에 아직 게임이 없습니다.',
  },
  'Pilih game dari daftar untuk memulainya.': {
    en: 'Pick games from the list to get started.',
    es: 'Elige juegos de la lista para empezar.',
    fr: 'Choisissez des jeux dans la liste pour commencer.',
    de: 'Wähle Spiele aus der Liste, um zu starten.',
    pt: 'Escolha jogos da lista para começar.',
    it: "Scegli i giochi dall'elenco per iniziare.",
    nl: 'Kies spellen uit de lijst om te beginnen.',
    ru: 'Выберите игры из списка, чтобы начать.',
    ar: 'اختر ألعابًا من القائمة للبدء.',
    tr: 'Başlamak için listeden oyunlar seçin.',
    zh: '从列表中选择游戏即可开始。',
    ja: 'リストからゲームを選んで始めましょう。',
    ko: '목록에서 게임을 골라 시작하세요.',
  },
  'Aplikasi Manual': {
    en: 'Manual Apps',
    es: 'Aplicaciones Manuales',
    fr: 'Applications Manuelles',
    de: 'Manuelle Apps',
    pt: 'Apps Manuais',
    it: 'App Manuali',
    nl: 'Handmatige apps',
    ru: 'Ручные приложения',
    ar: 'تطبيقات يدوية',
    tr: 'Manuel Uygulamalar',
    zh: '手动应用',
    ja: '手動アプリ',
    ko: '수동 앱',
  },
  'Keluarkan dari rak': {
    en: 'Remove from shelf',
    es: 'Quitar de la estante',
    fr: "Retirer de l'étagère",
    de: 'Aus dem Regal entfernen',
    pt: 'Remover da prateleira',
    it: 'Rimuovi dallo scaffale',
    nl: 'Van de plank verwijderen',
    ru: 'Убрать с полки',
    ar: 'إزالة من الرف',
    tr: 'Raftan çıkar',
    zh: '从架子移除',
    ja: '棚から外す',
    ko: '선반에서 제거',
  },
  'Gagal menyimpan rak game.': {
    en: 'Failed to save the game shelf.',
    es: 'No se pudo guardar la estante de juegos.',
    fr: "Échec de l'enregistrement de l'étagère de jeux.",
    de: 'Das Spielregal konnte nicht gespeichert werden.',
    pt: 'Falha ao salvar a prateleira de jogos.',
    it: 'Impossibile salvare lo scaffale giochi.',
    nl: 'Kan de spellenplank niet opslaan.',
    ru: 'Не удалось сохранить полку игр.',
    ar: 'فشل حفظ رف الألعاب.',
    tr: 'Oyun rafı kaydedilemedi.',
    zh: '保存游戏架失败。',
    ja: 'ゲーム棚を保存できませんでした。',
    ko: '게임 선반을 저장하지 못했습니다.',
  },
  'Rak game disimpan.': {
    en: 'Game shelf saved.',
    es: 'Estante de juegos guardada.',
    fr: 'Étagère de jeux enregistrée.',
    de: 'Spielregal gespeichert.',
    pt: 'Prateleira de jogos salva.',
    it: 'Scaffale giochi salvato.',
    nl: 'Spellenplank opgeslagen.',
    ru: 'Полка игр сохранена.',
    ar: 'تم حفظ رف الألعاب.',
    tr: 'Oyun rafı kaydedildi.',
    zh: '游戏架已保存。',
    ja: 'ゲーム棚を保存しました。',
    ko: '게임 선반이 저장되었습니다.',
  },
  Overlay: {
    en: 'Overlay',
    es: 'Overlay',
    fr: 'Overlay',
    de: 'Overlay',
    pt: 'Overlay',
    it: 'Overlay',
    nl: 'Overlay',
    ru: 'Оверлей',
    ar: 'التراكب',
    tr: 'Overlay',
    zh: '浮层',
    ja: 'オーバーレイ',
    ko: '오버레이',
  },
  Suara: {
    en: 'Sound',
    es: 'Sonido',
    fr: 'Son',
    de: 'Ton',
    pt: 'Som',
    it: 'Audio',
    nl: 'Geluid',
    ru: 'Звук',
    ar: 'الصوت',
    tr: 'Ses',
    zh: '声音',
    ja: 'サウンド',
    ko: '소리',
  },
  Chat: {
    en: 'Chat',
    es: 'Chat',
    fr: 'Chat',
    de: 'Chat',
    pt: 'Chat',
    it: 'Chat',
    nl: 'Chat',
    ru: 'Чат',
    ar: 'الدردشة',
    tr: 'Sohbet',
    zh: '聊天',
    ja: 'チャット',
    ko: '채팅',
  },
  Jelajah: {
    en: 'Browse',
    es: 'Explorar',
    fr: 'Parcourir',
    de: 'Stöbern',
    pt: 'Navegar',
    it: 'Naviga',
    nl: 'Bladeren',
    ru: 'Просмотр',
    ar: 'تصفح',
    tr: 'Gözat',
    zh: '浏览',
    ja: 'ブラウズ',
    ko: '탐색',
  },
  'Volume sistem': {
    en: 'System volume',
    es: 'Volumen del sistema',
    fr: 'Volume système',
    de: 'Systemlautstärke',
    pt: 'Volume do sistema',
    it: 'Volume di sistema',
    nl: 'Systeemvolume',
    ru: 'Громкость системы',
    ar: 'صوت النظام',
    tr: 'Sistem sesi',
    zh: '系统音量',
    ja: 'システム音量',
    ko: '시스템 볼륨',
  },
  Terhubung: {
    en: 'Connected',
    es: 'Conectado',
    fr: 'Connecté',
    de: 'Verbunden',
    pt: 'Conectado',
    it: 'Connesso',
    nl: 'Verbonden',
    ru: 'Подключено',
    ar: 'متصل',
    tr: 'Bağlı',
    zh: '已连接',
    ja: '接続済み',
    ko: '연결됨',
  },
  Offline: {
    en: 'Offline',
    es: 'Sin conexión',
    fr: 'Hors ligne',
    de: 'Offline',
    pt: 'Offline',
    it: 'Offline',
    nl: 'Offline',
    ru: 'Не в сети',
    ar: 'غير متصل',
    tr: 'Çevrimdışı',
    zh: '离线',
    ja: 'オフライン',
    ko: '오프라인',
  },
  Mixer: {
    en: 'Mixer',
    es: 'Mezclador',
    fr: 'Mixeur',
    de: 'Mischpult',
    pt: 'Mixer',
    it: 'Mixer',
    nl: 'Mixer',
    ru: 'Микшер',
    ar: 'الخلاط',
    tr: 'Karıştırıcı',
    zh: '混音器',
    ja: 'ミキサー',
    ko: '믹서',
  },
  Model: {
    en: 'Model',
    es: 'Modelo',
    fr: 'Modèle',
    de: 'Modell',
    pt: 'Modelo',
    it: 'Modello',
    nl: 'Model',
    ru: 'Модель',
    ar: 'الطراز',
    tr: 'Model',
    zh: '模型',
    ja: 'モデル',
    ko: '모델',
  },
  Mundur: {
    en: 'Back',
    es: 'Atrás',
    fr: 'Retour',
    de: 'Zurück',
    pt: 'Voltar',
    it: 'Indietro',
    nl: 'Terug',
    ru: 'Назад',
    ar: 'رجوع',
    tr: 'Geri',
    zh: '后退',
    ja: '戻る',
    ko: '뒤로',
  },
  'Memuat {item}…': {
    en: 'Loading {item}…',
    es: 'Cargando {item}…',
    fr: 'Chargement de {item}…',
    de: 'Lade {item}…',
    pt: 'Carregando {item}…',
    it: 'Caricamento di {item}…',
    nl: '{item} laden…',
    ru: 'Загрузка {item}…',
    ar: 'جارٍ تحميل {item}…',
    tr: '{item} yükleniyor…',
    zh: '正在加载{item}…',
    ja: '{item}を読み込んでいます…',
    ko: '{item} 불러오는 중…',
  },
  'Memeriksa…': {
    en: 'Checking…',
    es: 'Comprobando…',
    fr: 'Vérification…',
    de: 'Prüfe…',
    pt: 'Verificando…',
    it: 'Controllo…',
    nl: 'Controleren…',
    ru: 'Проверка…',
    ar: 'جارٍ الفحص…',
    tr: 'Kontrol ediliyor…',
    zh: '检查中…',
    ja: '確認中…',
    ko: '확인 중…',
  },
  'Aktifkan suara': {
    en: 'Unmute',
    es: 'Activar sonido',
    fr: 'Activer le son',
    de: 'Ton aktivieren',
    pt: 'Ativar som',
    it: 'Riattiva audio',
    nl: 'Geluid inschakelen',
    ru: 'Включить звук',
    ar: 'تفعيل الصوت',
    tr: 'Sesi aç',
    zh: '取消静音',
    ja: 'ミュート解除',
    ko: '음소거 해제',
  },
  Bisukan: {
    en: 'Mute',
    es: 'Silenciar',
    fr: 'Couper le son',
    de: 'Stummschalten',
    pt: 'Silenciar',
    it: 'Disattiva audio',
    nl: 'Dempen',
    ru: 'Выключить звук',
    ar: 'كتم الصوت',
    tr: 'Sustur',
    zh: '静音',
    ja: 'ミュート',
    ko: '음소거',
  },
  'Tidak ada aplikasi yang memutar suara.': {
    en: 'No apps are playing sound right now.',
    es: 'Ninguna aplicación reproduce sonido ahora.',
    fr: "Aucune application ne joue de son pour l'instant.",
    de: 'Keine App spielt gerade einen Ton ab.',
    pt: 'Nenhum aplicativo está reproduzindo som no momento.',
    it: "Nessuna app sta riproducendo audio al momento.",
    nl: 'Geen apps spelen op dit moment geluid af.',
    ru: 'Сейчас ни одно приложение не воспроизводит звук.',
    ar: 'لا توجد تطبيقات تشغّل الصوت الآن.',
    tr: 'Şu anda ses çalan uygulama yok.',
    zh: '当前没有应用正在播放声音。',
    ja: '音を再生しているアプリはありません。',
    ko: '현재 소리를 재생하는 앱이 없습니다.',
  },
  'Pesan ke AI…': {
    en: 'Message the AI…',
    es: 'Mensaje a la IA…',
    fr: 'Écrire à l’IA…',
    de: 'Nachricht an die KI…',
    pt: 'Mensagem para a IA…',
    it: 'Messaggio all’IA…',
    nl: 'Bericht aan de AI…',
    ru: 'Сообщение ИИ…',
    ar: 'رسالة إلى الذكاء الاصطناعي…',
    tr: 'Yapay zekaya yaz…',
    zh: '向 AI 发送消息…',
    ja: 'AIにメッセージ…',
    ko: 'AI에게 메시지…',
  },
  'Ollama tidak terhubung.': {
    en: 'Ollama is not connected.',
    es: 'Ollama no está conectado.',
    fr: 'Ollama n’est pas connecté.',
    de: 'Ollama ist nicht verbunden.',
    pt: 'Ollama não está conectado.',
    it: 'Ollama non è connesso.',
    nl: 'Ollama is niet verbonden.',
    ru: 'Ollama не подключен.',
    ar: 'Ollama غير متصل.',
    tr: 'Ollama bağlı değil.',
    zh: 'Ollama 未连接。',
    ja: 'Ollama に接続されていません。',
    ko: 'Ollama가 연결되지 않았습니다.',
  },
  'Mulai percakapan dengan model lokalmu. Privasi dan tanpa internet.': {
    en: 'Start a conversation with your local model. Private and fully offline.',
    es: 'Inicia una conversación con tu modelo local. Privado y sin internet.',
    fr: 'Discutez avec votre modèle local. Privé et sans internet.',
    de: 'Starte ein Gespräch mit deinem lokalen Modell. Privat und ganz offline.',
    pt: 'Comece uma conversa com seu modelo local. Privado e sem internet.',
    it: 'Inizia una conversazione con il tuo modello locale. Privato e senza internet.',
    nl: 'Start een gesprek met je lokale model. Privé en helemaal offline.',
    ru: 'Начните разговор с локальной моделью. Приватно и без интернета.',
    ar: 'ابدأ محادثة مع نموذجك المحلي. خصوصية ودون إنترنت.',
    tr: 'Yerel modelinle bir sohbet başlat. Gizli ve tamamen çevrimdışı.',
    zh: '与本地模型开始对话。私密且完全离线。',
    ja: 'ローカルモデルと会話を始めましょう。プライベートで完全オフライン。',
    ko: '로컬 모델과 대화를 시작하세요. 비공개이며 완전히 오프라인입니다.',
  },
  'Alamat web': {
    en: 'Web address',
    es: 'Dirección web',
    fr: 'Adresse web',
    de: 'Webadresse',
    pt: 'Endereço web',
    it: 'Indirizzo web',
    nl: 'Webadres',
    ru: 'Веб-адрес',
    ar: 'عنوان الويب',
    tr: 'Web adresi',
    zh: '网址',
    ja: 'ウェブアドレス',
    ko: '웹 주소',
  },
};

const DRY = process.argv.includes('--dry-run');

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function extractKey(line) {
  let m = line.match(/^[ \t]*'((?:[^'\\]|\\.)*)'[ \t]*:/);
  if (m) return m[1] || null;
  m = line.match(/^[ \t]*"((?:[^"\\]|\\.)*)"[ \t]*:/);
  return m ? m[1] : null;
}

function syncKeysTxt() {
  const src = fs.readFileSync(path.join(dir, 'en.ts'), 'utf8');
  const keys = [];
  for (const line of src.split(/\r?\n/)) {
    const k = extractKey(line);
    if (k != null) keys.push(k);
  }
  fs.writeFileSync(
    path.join(dir, 'keys.txt'),
    [...new Set(keys)].sort((a, b) => a.localeCompare(b, 'id')).join('\r\n') + '\r\n',
    'utf8'
  );
  return keys.length;
}

let totalAdded = 0;
let totalSkipped = 0;
for (const code of CODES) {
  const file = path.join(dir, code + '.ts');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';

  let added = 0;
  let skipped = 0;
  for (const [key, dict] of Object.entries(KEYS)) {
    if (lines.some((l) => extractKey(l) === key)) {
      skipped++;
      continue;
    }
    const entry = `  '${key}': '${esc(dict[code])}',`;
    let insert = lines.findIndex((l) => {
      const k = extractKey(l);
      return k != null && k.localeCompare(key, 'id') > 0;
    });
    if (insert === -1) insert = lines.findIndex((l) => l.trim() === '};');
    if (insert === -1) throw new Error(file + ': closing brace not found');
    lines.splice(insert, 0, entry);
    added++;
  }

  if (DRY) {
    console.log(`${code}: ${added} to add, ${skipped} already present`);
  } else if (added > 0) {
    fs.writeFileSync(file, lines.join(eol), 'utf8');
    console.log(`${code}: +${added} (${skipped} skipped)`);
  } else {
    console.log(`${code}: up to date`);
  }
  totalAdded += added;
  totalSkipped += skipped;
}

if (DRY) {
  console.log(`[dry-run] would add ${totalAdded} keys, ${totalSkipped} already present`);
  process.exit(0);
}

const enTotal = syncKeysTxt();
console.log(`done: added ${totalAdded} keys across ${CODES.length} dictionaries; keys.txt synced (${enTotal} keys)`);