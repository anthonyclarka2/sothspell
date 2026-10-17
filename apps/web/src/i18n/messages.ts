/**
 * Typed UI catalogs. `en` is the source locale and the shape every other
 * catalog must satisfy, so a missing key is a compile error; the runtime lookup
 * still falls back to the source catalog so a stale catalog can never render a
 * blank string.
 */

export const LOCALES = ['en', 'es', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const SOURCE_LOCALE: Locale = 'en';

/** Right-to-left locales; the shell flips direction, not the code browser. */
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/** Endonyms, identical in every catalog: people look for their own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  ar: 'العربية',
};

const en = {
  'shell.settings': 'Settings',
  'shell.locale': 'Language',
  'shell.tagline': 'truth story',

  'home.loading': 'Loading the golden tour…',
  'home.loadError': 'The golden tour did not load.',
  'home.play': 'Play the tour',
  'home.readChapters': 'Read the chapters',
  'home.project': 'Project',
  'home.revision': 'Revision',
  'home.chapters': 'Chapters',
  'home.beats': 'Beats',
  'home.runtime': 'Runtime',
  'home.chapterIndex': 'Tour chapters',
  'home.beatCount': '{count} beats',
  'home.startChapter': 'Start chapter',

  'player.loading': 'Loading the tour…',
  'player.loadError': 'The tour did not load.',
  'player.beatNotFound': 'The requested beat is not part of this tour.',
  'player.diagram': 'Diagram',
  'player.codeEvidence': 'Code evidence',
  'player.resume': 'You have progress in this tour: {beat}.',
  'player.resumeCompleted': '{count} beats completed.',
  'player.resumeAction': 'Resume',
  'player.startOver': 'Start over',

  'narration.label': 'Narration',
  'narration.readMode': 'Read mode',
  'narration.listen': 'Listen',
  'narration.voice': 'Narration voice',
  'narration.browserVoice': 'Browser voice',
  'narration.cloudVoice': 'Cloud voice',
  'narration.playingCloud': 'Listening · cloud voice',
  'narration.playingBrowser': 'Listening · browser voice',
  'narration.paused': 'Narration paused',
  'narration.preparing': 'Preparing narration…',
  'narration.unavailable': 'Narration unavailable',
  'narration.listenMode': 'Listen mode',
  'narration.askYourself': 'Ask yourself',
  'narration.noQuestions': 'No suggested questions for this beat.',
  'narration.askAbout': 'Ask about this beat',
  'narration.chapter': 'Chapter: {title}',
  'narration.evidenceOne': 'Evidence: 1 anchor',
  'narration.evidenceMany': 'Evidence: {count} anchors',

  'rail.label': 'Chapters and beats',
  'rail.chapters': 'Chapters',
  'rail.empty': 'No chapters yet.',
  'rail.current': 'Current chapter: {id}',
  'rail.completed': 'completed',

  'transport.label': 'Playback controls',
  'transport.previous': 'Previous beat',
  'transport.play': 'Play',
  'transport.pause': 'Pause',
  'transport.next': 'Next beat',
  'transport.seek': 'Seek through the tour',
  'transport.speed': 'Playback speed',
  'transport.theaterEnter': 'Enter theater mode',
  'transport.theaterExit': 'Exit theater mode',
  'transport.position': '{elapsed} of {total}',

  'ask.label': 'Ask about this beat',
  'ask.title': 'Ask about this beat',
  'ask.intro':
    'The tour pauses while the guide answers. Citations open the pinned code beside the explanation.',
  'ask.close': 'Close question panel',
  'ask.question': 'Your question',
  'ask.placeholder': 'How does this hand-off work?',
  'ask.submit': 'Ask',
  'ask.submitting': 'Asking…',
  'ask.continue': 'Continue tour',
  'ask.error': 'The question could not be answered.',
  'ask.evidence': 'Evidence',
  'ask.next': 'Ask next',

  'code.needsAnchor':
    'This code page needs an anchor. Open it from a beat or a diagram node.',
  'code.loading': 'Loading the evidence…',
  'code.loadError': 'The code page did not load.',
  'code.lines': 'lines {start}–{end} of {total} · {language}',
  'code.stale': 'Source changed since this tour',
  'code.fresh': 'Matches the pinned snapshot',
  'code.backToBeat': 'Back to the beat',
  'code.outlineLabel': 'Anchors in this file',
  'code.anchors': 'Anchors',
  'code.noAnchors': 'No tour anchors point at this file.',
  'code.sourceLabel': 'Source',
  'code.readOnly':
    'Read-only evidence from the pinned project snapshot. The full tour never writes to the project.',

  'shell.newTour': 'New tour',

  'new.title': 'Open a repository',
  'new.subtitle':
    'Point Sóþspell at a local git repository or a public GitHub URL, then author a tour. The project is read-only; the tour is written under SOTHSPELL_HOME.',
  'new.sourceLabel': 'Repository source',
  'new.local': 'Local git repository',
  'new.localHint': 'A path on this machine, for example /Users/you/projects/tiny-notes.',
  'new.localPath': 'Repository path',
  'new.localPlaceholder': '/Users/you/projects/tiny-notes',
  'new.check': 'Check repository',
  'new.checking': 'Checking…',
  'new.checkError': 'The repository could not be checked.',
  'new.github': 'Public GitHub repository',
  'new.githubHint':
    'A public github.com URL. The repository is shallow-cloned into SOTHSPELL_HOME and analyzed read-only.',
  'new.githubUrl': 'GitHub URL',
  'new.githubPlaceholder': 'https://github.com/owner/repo',
  'new.ref': 'Branch or tag (optional)',
  'new.refPlaceholder': 'main',
  'new.project': 'Project',
  'new.revision': 'Revision',
  'new.languages': 'Languages',
  'new.files': 'Files',
  'new.model': 'Authoring model',
  'new.modelFixture': 'Fixture model — offline demo',
  'new.modelFixtureHint': 'Deterministic, needs no API key, and works without a network.',
  'new.modelProfile': 'Active authoring profile',
  'new.modelProfileHint': 'Uses the profile from Settings: {name}.',
  'new.modelProfileNone':
    'No authoring profile is active. Add one in Settings to use a real model.',
  'new.audience': 'Audience',
  'new.audienceNew': 'New contributor',
  'new.audienceTechnical': 'Technical evaluator',
  'new.audienceMaintainer': 'Maintainer',
  'new.maxMinutes': 'Target runtime (minutes)',
  'new.start': 'Author the tour',
  'new.starting': 'Authoring…',
  'new.cancel': 'Cancel',
  'new.resultTitle': 'The tour is ready',
  'new.resultMeta': '{chapters} chapters · {beats} beats · {anchors} anchors',
  'new.open': 'Open the tour',
  'new.another': 'Author another tour',
  'new.errorTitle': 'Authoring failed',
  'new.error.model':
    'No authoring model is available. Choose the fixture model or activate a profile in Settings.',
  'new.error.generic': 'The tour could not be authored.',
  'new.step.import': 'Importing the repository',
  'new.step.analyze': 'Analyzing the project',
  'new.step.plan': 'Planning the curriculum',
  'new.step.chapters': 'Writing the chapters',
  'new.step.validate': 'Validating the evidence',
  'new.step.save': 'Saving the tour',
  'new.step.pending': 'Waiting',
  'new.step.active': 'In progress',
  'new.step.done': 'Done',
  'new.step.failed': 'Failed',
} as const;

export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;

const es: Catalog = {
  'shell.settings': 'Ajustes',
  'shell.locale': 'Idioma',
  'shell.tagline': 'historia verdadera',

  'home.loading': 'Cargando el tour de referencia…',
  'home.loadError': 'El tour de referencia no se cargó.',
  'home.play': 'Reproducir el tour',
  'home.readChapters': 'Leer los capítulos',
  'home.project': 'Proyecto',
  'home.revision': 'Revisión',
  'home.chapters': 'Capítulos',
  'home.beats': 'Beats',
  'home.runtime': 'Duración',
  'home.chapterIndex': 'Capítulos del tour',
  'home.beatCount': '{count} beats',
  'home.startChapter': 'Empezar capítulo',

  'player.loading': 'Cargando el tour…',
  'player.loadError': 'El tour no se cargó.',
  'player.beatNotFound': 'El beat solicitado no forma parte de este tour.',
  'player.diagram': 'Diagrama',
  'player.codeEvidence': 'Evidencia de código',
  'player.resume': 'Tienes progreso en este tour: {beat}.',
  'player.resumeCompleted': '{count} beats completados.',
  'player.resumeAction': 'Continuar',
  'player.startOver': 'Empezar de nuevo',

  'narration.label': 'Narración',
  'narration.readMode': 'Modo lectura',
  'narration.listen': 'Escuchar',
  'narration.voice': 'Voz de narración',
  'narration.browserVoice': 'Voz del navegador',
  'narration.cloudVoice': 'Voz en la nube',
  'narration.playingCloud': 'Escuchando · voz en la nube',
  'narration.playingBrowser': 'Escuchando · voz del navegador',
  'narration.paused': 'Narración en pausa',
  'narration.preparing': 'Preparando la narración…',
  'narration.unavailable': 'Narración no disponible',
  'narration.listenMode': 'Modo escucha',
  'narration.askYourself': 'Pregúntate',
  'narration.noQuestions': 'No hay preguntas sugeridas para este beat.',
  'narration.askAbout': 'Pregunta sobre este beat',
  'narration.chapter': 'Capítulo: {title}',
  'narration.evidenceOne': 'Evidencia: 1 ancla',
  'narration.evidenceMany': 'Evidencia: {count} anclas',

  'rail.label': 'Capítulos y beats',
  'rail.chapters': 'Capítulos',
  'rail.empty': 'Aún no hay capítulos.',
  'rail.current': 'Capítulo actual: {id}',
  'rail.completed': 'completado',

  'transport.label': 'Controles de reproducción',
  'transport.previous': 'Beat anterior',
  'transport.play': 'Reproducir',
  'transport.pause': 'Pausar',
  'transport.next': 'Beat siguiente',
  'transport.seek': 'Desplazarse por el tour',
  'transport.speed': 'Velocidad de reproducción',
  'transport.theaterEnter': 'Entrar en modo teatro',
  'transport.theaterExit': 'Salir del modo teatro',
  'transport.position': '{elapsed} de {total}',

  'ask.label': 'Pregunta sobre este beat',
  'ask.title': 'Pregunta sobre este beat',
  'ask.intro':
    'El tour se pausa mientras el guía responde. Las citas abren el código fijado junto a la explicación.',
  'ask.close': 'Cerrar el panel de preguntas',
  'ask.question': 'Tu pregunta',
  'ask.placeholder': '¿Cómo funciona este traspaso?',
  'ask.submit': 'Preguntar',
  'ask.submitting': 'Preguntando…',
  'ask.continue': 'Continuar el tour',
  'ask.error': 'No se pudo responder la pregunta.',
  'ask.evidence': 'Evidencia',
  'ask.next': 'Pregunta después',

  'code.needsAnchor':
    'Esta página de código necesita un ancla. Ábrela desde un beat o un nodo del diagrama.',
  'code.loading': 'Cargando la evidencia…',
  'code.loadError': 'La página de código no se cargó.',
  'code.lines': 'líneas {start}–{end} de {total} · {language}',
  'code.stale': 'El código cambió desde este tour',
  'code.fresh': 'Coincide con la instantánea fijada',
  'code.backToBeat': 'Volver al beat',
  'code.outlineLabel': 'Anclas en este archivo',
  'code.anchors': 'Anclas',
  'code.noAnchors': 'Ninguna ancla del tour apunta a este archivo.',
  'code.sourceLabel': 'Código',
  'code.readOnly':
    'Evidencia de solo lectura de la instantánea fijada del proyecto. El tour completo nunca escribe en el proyecto.',

  'shell.newTour': 'Nuevo tour',

  'new.title': 'Abrir un repositorio',
  'new.subtitle':
    'Apunta Sóþspell a un repositorio git local o a una URL pública de GitHub y luego genera un tour. El proyecto es de solo lectura; el tour se guarda en SOTHSPELL_HOME.',
  'new.sourceLabel': 'Origen del repositorio',
  'new.local': 'Repositorio git local',
  'new.localHint':
    'Una ruta en esta máquina, por ejemplo /Users/you/projects/tiny-notes.',
  'new.localPath': 'Ruta del repositorio',
  'new.localPlaceholder': '/Users/you/projects/tiny-notes',
  'new.check': 'Comprobar repositorio',
  'new.checking': 'Comprobando…',
  'new.checkError': 'No se pudo comprobar el repositorio.',
  'new.github': 'Repositorio público de GitHub',
  'new.githubHint':
    'Una URL pública de github.com. El repositorio se clona superficialmente en SOTHSPELL_HOME y se analiza en solo lectura.',
  'new.githubUrl': 'URL de GitHub',
  'new.githubPlaceholder': 'https://github.com/usuario/repo',
  'new.ref': 'Rama o etiqueta (opcional)',
  'new.refPlaceholder': 'main',
  'new.project': 'Proyecto',
  'new.revision': 'Revisión',
  'new.languages': 'Lenguajes',
  'new.files': 'Archivos',
  'new.model': 'Modelo de autoría',
  'new.modelFixture': 'Modelo de prueba — demo sin conexión',
  'new.modelFixtureHint': 'Determinista, sin clave de API y sin red.',
  'new.modelProfile': 'Perfil de autoría activo',
  'new.modelProfileHint': 'Usa el perfil de Ajustes: {name}.',
  'new.modelProfileNone':
    'No hay un perfil de autoría activo. Añade uno en Ajustes para usar un modelo real.',
  'new.audience': 'Audiencia',
  'new.audienceNew': 'Nueva persona colaboradora',
  'new.audienceTechnical': 'Evaluación técnica',
  'new.audienceMaintainer': 'Mantenimiento',
  'new.maxMinutes': 'Duración objetivo (minutos)',
  'new.start': 'Generar el tour',
  'new.starting': 'Generando…',
  'new.cancel': 'Cancelar',
  'new.resultTitle': 'El tour está listo',
  'new.resultMeta': '{chapters} capítulos · {beats} beats · {anchors} anclas',
  'new.open': 'Abrir el tour',
  'new.another': 'Generar otro tour',
  'new.errorTitle': 'La generación falló',
  'new.error.model':
    'No hay un modelo de autoría disponible. Elige el modelo de prueba o activa un perfil en Ajustes.',
  'new.error.generic': 'No se pudo generar el tour.',
  'new.step.import': 'Importando el repositorio',
  'new.step.analyze': 'Analizando el proyecto',
  'new.step.plan': 'Planificando el temario',
  'new.step.chapters': 'Escribiendo los capítulos',
  'new.step.validate': 'Validando la evidencia',
  'new.step.save': 'Guardando el tour',
  'new.step.pending': 'En espera',
  'new.step.active': 'En curso',
  'new.step.done': 'Hecho',
  'new.step.failed': 'Falló',
};

const ar: Catalog = {
  'shell.settings': 'الإعدادات',
  'shell.locale': 'اللغة',
  'shell.tagline': 'قصة الحقيقة',

  'home.loading': 'جارٍ تحميل الجولة المرجعية…',
  'home.loadError': 'تعذّر تحميل الجولة المرجعية.',
  'home.play': 'شغّل الجولة',
  'home.readChapters': 'اقرأ الفصول',
  'home.project': 'المشروع',
  'home.revision': 'المراجعة',
  'home.chapters': 'الفصول',
  'home.beats': 'المقاطع',
  'home.runtime': 'المدة',
  'home.chapterIndex': 'فصول الجولة',
  'home.beatCount': '{count} مقاطع',
  'home.startChapter': 'ابدأ الفصل',

  'player.loading': 'جارٍ تحميل الجولة…',
  'player.loadError': 'تعذّر تحميل الجولة.',
  'player.beatNotFound': 'المقطع المطلوب ليس جزءًا من هذه الجولة.',
  'player.diagram': 'المخطط',
  'player.codeEvidence': 'دليل الكود',
  'player.resume': 'لديك تقدّم في هذه الجولة: {beat}.',
  'player.resumeCompleted': 'اكتمل {count} من المقاطع.',
  'player.resumeAction': 'تابع',
  'player.startOver': 'ابدأ من جديد',

  'narration.label': 'السرد',
  'narration.readMode': 'وضع القراءة',
  'narration.listen': 'استمع',
  'narration.voice': 'صوت السرد',
  'narration.browserVoice': 'صوت المتصفح',
  'narration.cloudVoice': 'صوت سحابي',
  'narration.playingCloud': 'يستمع · صوت سحابي',
  'narration.playingBrowser': 'يستمع · صوت المتصفح',
  'narration.paused': 'السرد متوقف مؤقتًا',
  'narration.preparing': 'جارٍ تحضير السرد…',
  'narration.unavailable': 'السرد غير متاح',
  'narration.listenMode': 'وضع الاستماع',
  'narration.askYourself': 'اسأل نفسك',
  'narration.noQuestions': 'لا توجد أسئلة مقترحة لهذا المقطع.',
  'narration.askAbout': 'اسأل عن هذا المقطع',
  'narration.chapter': 'الفصل: {title}',
  'narration.evidenceOne': 'الأدلة: مرجع واحد',
  'narration.evidenceMany': 'الأدلة: {count} مراجع',

  'rail.label': 'الفصول والمقاطع',
  'rail.chapters': 'الفصول',
  'rail.empty': 'لا توجد فصول بعد.',
  'rail.current': 'الفصل الحالي: {id}',
  'rail.completed': 'مكتمل',

  'transport.label': 'عناصر التحكم في التشغيل',
  'transport.previous': 'المقطع السابق',
  'transport.play': 'تشغيل',
  'transport.pause': 'إيقاف مؤقت',
  'transport.next': 'المقطع التالي',
  'transport.seek': 'التنقل في الجولة',
  'transport.speed': 'سرعة التشغيل',
  'transport.theaterEnter': 'الدخول إلى وضع المسرح',
  'transport.theaterExit': 'الخروج من وضع المسرح',
  'transport.position': '{elapsed} من {total}',

  'ask.label': 'اسأل عن هذا المقطع',
  'ask.title': 'اسأل عن هذا المقطع',
  'ask.intro':
    'تتوقف الجولة أثناء إجابة الدليل. تفتح الاستشهادات الكود المثبَّت بجانب الشرح.',
  'ask.close': 'إغلاق لوحة السؤال',
  'ask.question': 'سؤالك',
  'ask.placeholder': 'كيف تعمل عملية التسليم هذه؟',
  'ask.submit': 'اسأل',
  'ask.submitting': 'جارٍ السؤال…',
  'ask.continue': 'تابع الجولة',
  'ask.error': 'تعذّر الإجابة عن السؤال.',
  'ask.evidence': 'الأدلة',
  'ask.next': 'اسأل بعد ذلك',

  'code.needsAnchor': 'تحتاج صفحة الكود هذه إلى مرجع. افتحها من مقطع أو عقدة في المخطط.',
  'code.loading': 'جارٍ تحميل الدليل…',
  'code.loadError': 'تعذّر تحميل صفحة الكود.',
  'code.lines': 'الأسطر {start}–{end} من {total} · {language}',
  'code.stale': 'تغيّر الكود منذ هذه الجولة',
  'code.fresh': 'مطابق للنسخة المثبَّتة',
  'code.backToBeat': 'العودة إلى المقطع',
  'code.outlineLabel': 'المراجع في هذا الملف',
  'code.anchors': 'المراجع',
  'code.noAnchors': 'لا يشير أي مرجع من الجولة إلى هذا الملف.',
  'code.sourceLabel': 'الكود',
  'code.readOnly':
    'دليل للقراءة فقط من النسخة المثبَّتة للمشروع. الجولة الكاملة لا تكتب في المشروع أبدًا.',

  'shell.newTour': 'جولة جديدة',

  'new.title': 'افتح مستودعًا',
  'new.subtitle':
    'وجّه Sóþspell إلى مستودع git محلي أو رابط GitHub عام، ثم أنشئ جولة. المشروع للقراءة فقط؛ وتُكتب الجولة تحت SOTHSPELL_HOME.',
  'new.sourceLabel': 'مصدر المستودع',
  'new.local': 'مستودع git محلي',
  'new.localHint': 'مسار على هذا الجهاز، مثل /Users/you/projects/tiny-notes.',
  'new.localPath': 'مسار المستودع',
  'new.localPlaceholder': '/Users/you/projects/tiny-notes',
  'new.check': 'افحص المستودع',
  'new.checking': 'جارٍ الفحص…',
  'new.checkError': 'تعذّر فحص المستودع.',
  'new.github': 'مستودع GitHub عام',
  'new.githubHint':
    'رابط عام على github.com. يُستنسخ المستودع استنساخًا سطحيًا إلى SOTHSPELL_HOME ويُحلَّل للقراءة فقط.',
  'new.githubUrl': 'رابط GitHub',
  'new.githubPlaceholder': 'https://github.com/owner/repo',
  'new.ref': 'الفرع أو الوسم (اختياري)',
  'new.refPlaceholder': 'main',
  'new.project': 'المشروع',
  'new.revision': 'المراجعة',
  'new.languages': 'اللغات',
  'new.files': 'الملفات',
  'new.model': 'نموذج التأليف',
  'new.modelFixture': 'النموذج التجريبي — عرض دون اتصال',
  'new.modelFixtureHint': 'حتمي، لا يحتاج مفتاح API، ويعمل دون شبكة.',
  'new.modelProfile': 'ملف التأليف النشط',
  'new.modelProfileHint': 'يستخدم الملف من الإعدادات: {name}.',
  'new.modelProfileNone':
    'لا يوجد ملف تأليف نشط. أضف ملفًا في الإعدادات لاستخدام نموذج حقيقي.',
  'new.audience': 'الجمهور',
  'new.audienceNew': 'مساهم جديد',
  'new.audienceTechnical': 'تقييم تقني',
  'new.audienceMaintainer': 'مشرف',
  'new.maxMinutes': 'المدة المستهدفة (دقائق)',
  'new.start': 'أنشئ الجولة',
  'new.starting': 'جارٍ الإنشاء…',
  'new.cancel': 'إلغاء',
  'new.resultTitle': 'الجولة جاهزة',
  'new.resultMeta': '{chapters} فصول · {beats} مقاطع · {anchors} مراجع',
  'new.open': 'افتح الجولة',
  'new.another': 'أنشئ جولة أخرى',
  'new.errorTitle': 'فشل الإنشاء',
  'new.error.model':
    'لا يتوفر نموذج تأليف. اختر النموذج التجريبي أو فعّل ملفًا في الإعدادات.',
  'new.error.generic': 'تعذّر إنشاء الجولة.',
  'new.step.import': 'استيراد المستودع',
  'new.step.analyze': 'تحليل المشروع',
  'new.step.plan': 'تخطيط المنهج',
  'new.step.chapters': 'كتابة الفصول',
  'new.step.validate': 'التحقق من الأدلة',
  'new.step.save': 'حفظ الجولة',
  'new.step.pending': 'في الانتظار',
  'new.step.active': 'قيد التنفيذ',
  'new.step.done': 'تم',
  'new.step.failed': 'فشل',
};

export const catalogs: Record<Locale, Catalog> = { en, es, ar };

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );
}

/** The catalog entry for a key, falling back to the source locale. */
export function templateFor(
  locale: Locale,
  key: MessageKey,
  catalog: Partial<Catalog> = catalogs[locale],
): string {
  return catalog[key] ?? en[key];
}

export function translate(
  locale: Locale,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  return interpolate(templateFor(locale, key), values);
}
