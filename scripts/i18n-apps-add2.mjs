import fs from 'node:fs';
import path from 'node:path';

const dir = 'client/src/i18n';

const KEYS = {
  'Tambah Manual': {
    en: 'Add Manually', es: 'Añadir Manual', fr: 'Ajouter Manuellement', de: 'Manuell Hinzufügen',
    pt: 'Adicionar Manual', it: 'Aggiungi Manuale', nl: 'Handmatig Toevoegen', ru: 'Добавить Вручную',
    ar: 'إضافة يدويًا', tr: 'Manuel Ekle', zh: '手动添加', ja: '手動で追加', ko: '수동으로 추가',
  },
  'Tambah Aplikasi Manual': {
    en: 'Add App Manually', es: 'Añadir App Manualmente', fr: 'Ajouter une App Manuellement', de: 'App Manuell Hinzufügen',
    pt: 'Adicionar App Manualmente', it: 'Aggiungi App Manualmente', nl: 'App Handmatig Toevoegen', ru: 'Добавить Приложение Вручную',
    ar: 'إضافة تطبيق يدويًا', tr: 'Uygulamayı Manuel Ekle', zh: '手动添加应用', ja: 'アプリを手動で追加', ko: '앱 수동 추가',
  },
  'Nama (opsional)': {
    en: 'Name (optional)', es: 'Nombre (opcional)', fr: 'Nom (facultatif)', de: 'Name (optional)',
    pt: 'Nome (opcional)', it: 'Nome (facoltativo)', nl: 'Naam (optioneel)', ru: 'Имя (необязательно)',
    ar: 'الاسم (اختياري)', tr: 'Ad (isteğe bağlı)', zh: '名称（可选）', ja: '名前（任意）', ko: '이름 (선택)',
  },
  'Isi otomatis dari nama berkas': {
    en: 'Auto-filled from the file name', es: 'Se rellena desde el nombre del archivo', fr: 'Rempli automatiquement depuis le nom du fichier', de: 'Wird automatisch aus dem Dateinamen übernommen',
    pt: 'Preenchido automaticamente a partir do nome do arquivo', it: 'Compilato automaticamente dal nome del file', nl: 'Automatisch ingevuld vanuit de bestandsnaam', ru: 'Заполняется автоматически из имени файла',
    ar: 'يُملأ تلقائيًا من اسم الملف', tr: 'Dosya adından otomatik doldurulur', zh: '根据文件名自动填写', ja: 'ファイル名から自動入力されます', ko: '파일 이름에서 자동으로 채워집니다',
  },
  'Lokasi berkas (.exe)': {
    en: 'File location (.exe)', es: 'Ubicación del archivo (.exe)', fr: 'Emplacement du fichier (.exe)', de: 'Dateispeicherort (.exe)',
    pt: 'Local do arquivo (.exe)', it: 'Posizione del file (.exe)', nl: 'Bestandslocatie (.exe)', ru: 'Расположение файла (.exe)',
    ar: 'موقع الملف (.exe)', tr: 'Dosya konumu (.exe)', zh: '文件位置（.exe）', ja: 'ファイルの場所 (.exe)', ko: '파일 위치 (.exe)',
  },
  'Pilih Berkas': {
    en: 'Choose File', es: 'Elegir Archivo', fr: 'Choisir un Fichier', de: 'Datei Auswählen',
    pt: 'Escolher Arquivo', it: 'Scegli File', nl: 'Bestand Kiezen', ru: 'Выбрать Файл',
    ar: 'اختر ملفًا', tr: 'Dosya Seç', zh: '选择文件', ja: 'ファイルを選択', ko: '파일 선택',
  },
  'Menambah…': {
    en: 'Adding…', es: 'Añadiendo…', fr: 'Ajout…', de: 'Wird hinzugefügt…',
    pt: 'Adicionando…', it: 'Aggiunta…', nl: 'Toevoegen…', ru: 'Добавление…',
    ar: 'جارٍ الإضافة…', tr: 'Ekleniyor…', zh: '正在添加…', ja: '追加中…', ko: '추가 중…',
  },
  'Aplikasi ditambahkan.': {
    en: 'App added.', es: 'App añadida.', fr: 'App ajoutée.', de: 'App hinzugefügt.',
    pt: 'App adicionada.', it: 'App aggiunta.', nl: 'App toegevoegd.', ru: 'Приложение добавлено.',
    ar: 'تمت إضافة التطبيق.', tr: 'Uygulama eklendi.', zh: '应用已添加。', ja: 'アプリを追加しました。', ko: '앱이 추가되었습니다.',
  },
  'Aplikasi dihapus.': {
    en: 'App removed.', es: 'App eliminada.', fr: 'App supprimée.', de: 'App entfernt.',
    pt: 'App removida.', it: 'App rimossa.', nl: 'App verwijderd.', ru: 'Приложение удалено.',
    ar: 'تمت إزالة التطبيق.', tr: 'Uygulama kaldırıldı.', zh: '应用已移除。', ja: 'アプリを削除しました。', ko: '앱이 제거되었습니다.',
  },
  'Gagal menambahkan aplikasi.': {
    en: 'Failed to add the app.', es: 'No se pudo añadir la app.', fr: 'Échec de l\'ajout de l\'app.', de: 'Hinzufügen der App fehlgeschlagen.',
    pt: 'Falha ao adicionar o app.', it: 'Impossibile aggiungere l\'app.', nl: 'Kan de app niet toevoegen.', ru: 'Не удалось добавить приложение.',
    ar: 'فشل إضافة التطبيق.', tr: 'Uygulama eklenemedi.', zh: '无法添加应用。', ja: 'アプリを追加できませんでした。', ko: '앱을 추가하지 못했습니다.',
  },
  'Gagal menghapus aplikasi.': {
    en: 'Failed to remove the app.', es: 'No se pudo eliminar la app.', fr: 'Échec de la suppression de l\'app.', de: 'Entfernen der App fehlgeschlagen.',
    pt: 'Falha ao remover o app.', it: 'Impossibile rimuovere l\'app.', nl: 'Kan de app niet verwijderen.', ru: 'Не удалось удалить приложение.',
    ar: 'فشل إزالة التطبيق.', tr: 'Uygulama kaldırılamadı.', zh: '无法移除应用。', ja: 'アプリを削除できませんでした。', ko: '앱을 제거하지 못했습니다.',
  },
  'Hapus dari daftar': {
    en: 'Remove from list', es: 'Eliminar de la lista', fr: 'Retirer de la liste', de: 'Aus Liste entfernen',
    pt: 'Remover da lista', it: 'Rimuovi dall\'elenco', nl: 'Uit lijst verwijderen', ru: 'Удалить из списка',
    ar: 'إزالة من القائمة', tr: 'Listeden kaldır', zh: '从列表中移除', ja: 'リストから削除', ko: '목록에서 제거',
  },
  'Manual': {
    en: 'Manual', es: 'Manual', fr: 'Manuel', de: 'Manuell',
    pt: 'Manual', it: 'Manuale', nl: 'Handmatig', ru: 'Вручную',
    ar: 'يدوي', tr: 'Manuel', zh: '手动', ja: '手動', ko: '수동',
  },
  'Pilih berkas aplikasi (.exe).': {
    en: 'Choose an app file (.exe).', es: 'Elige un archivo de app (.exe).', fr: 'Choisissez un fichier d\'app (.exe).', de: 'Bitte eine App-Datei (.exe) wählen.',
    pt: 'Escolha um arquivo de app (.exe).', it: 'Scegli un file di app (.exe).', nl: 'Kies een app-bestand (.exe).', ru: 'Выберите файл приложения (.exe).',
    ar: 'اختر ملف تطبيق (.exe).', tr: 'Bir uygulama dosyası seçin (.exe).', zh: '请选择应用文件（.exe）。', ja: 'アプリのファイル (.exe) を選んでください。', ko: '앱 파일(.exe)을 선택하세요.',
  },
  'Ini adalah berkas pemasang/penghapus, bukan aplikasi utama.': {
    en: 'This is an installer/removal tool, not the main app.', es: 'Es un instalador o desinstalador, no la app principal.', fr: 'C\'est un installateur/désinstalleur, pas l\'app principale.', de: 'Das ist ein Installer/Deinstaller, nicht die eigentliche App.',
    pt: 'Isso é um instalador/removedor, não o aplicativo principal.', it: 'È un programma di installazione/rimozione, non l\'app principale.', nl: 'Dit is een installatie-/verwijderprogramma, niet de hoofd-app.', ru: 'Это установщик/удаляющий файл, а не основное приложение.',
    ar: 'هذا مثبت/أداة إزالة، وليس التطبيق الرئيسي.', tr: 'Bu bir kurulum/kaldırma aracıdır, ana uygulama değildir.', zh: '这是安装/卸载工具，不是主应用。', ja: 'これはインストーラー/アンインストーラーで、メインのアプリではありません。', ko: '이것은 설치/제거 도구이지 기본 앱이 아닙니다.',
  },
  'Aplikasi sudah ada di daftar.': {
    en: 'App is already in the list.', es: 'La app ya está en la lista.', fr: 'L\'app est déjà dans la liste.', de: 'Die App ist bereits in der Liste.',
    pt: 'O app já está na lista.', it: 'L\'app è già nell\'elenco.', nl: 'De app staat al in de lijst.', ru: 'Приложение уже есть в списке.',
    ar: 'التطبيق موجود بالفعل في القائمة.', tr: 'Uygulama zaten listede.', zh: '该应用已在列表中。', ja: 'アプリはすでにリストにあります。', ko: '앱이 이미 목록에 있습니다.',
  },
  'Berkas aplikasi tidak ditemukan.': {
    en: 'App file not found.', es: 'No se encontró el archivo de la app.', fr: 'Fichier d\'app introuvable.', de: 'App-Datei nicht gefunden.',
    pt: 'Arquivo do app não encontrado.', it: 'File dell\'app non trovato.', nl: 'App-bestand niet gevonden.', ru: 'Файл приложения не найден.',
    ar: 'ملف التطبيق غير موجود.', tr: 'Uygulama dosyası bulunamadı.', zh: '未找到应用文件。', ja: 'アプリのファイルが見つかりません。', ko: '앱 파일을 찾을 수 없습니다.',
  },
};

const FILES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'ar', 'tr', 'zh', 'ja', 'ko'];

function esc(v) {
  return v.replace(/'/g, "\\'");
}

let updated = 0;
for (const code of FILES) {
  const file = path.join(dir, code + '.ts');
  const src = fs.readFileSync(file, 'utf8');
  let block = '';
  for (const [key, dict] of Object.entries(KEYS)) {
    block += `  '${key}': '${esc(dict[code])}',\n`;
  }
  const idx = src.lastIndexOf('};');
  if (idx === -1) {
    console.error(code + ': SKIP (no closing found)');
    continue;
  }
  fs.writeFileSync(file, src.slice(0, idx) + block + '};' + src.slice(idx + 2), 'utf8');
  updated++;
  console.log(code + ': +' + Object.keys(KEYS).length + ' keys');
}

console.log('updated ' + updated + ' dictionaries');