import type { EnDict } from "./en";

export const uk: EnDict = {
  // ─── Brand / general ───
  "site.name": "Video Hoster",
  "common.cancel": "Скасувати",
  "common.back": "Назад",
  "common.save": "Зберегти",
  "common.saving": "Збереження...",
  "common.delete": "Видалити",
  "common.deleting": "Видалення...",
  "common.remove": "Прибрати",
  "common.reset": "Скинути",
  "common.continue": "Продовжити",
  "common.notNow": "Не зараз",
  "common.or": "АБО",
  "common.private": "Приватне",
  "common.public": "Публічне",
  "common.edited": "(відредаговано)",

  // ─── TopBar ───
  "topbar.search.placeholder.signedIn": "Пошук відео за назвою або тегом",
  "topbar.search.placeholder.signedOut": "Увійдіть, щоб шукати",
  "topbar.search.aria": "Пошук відео",
  "topbar.signIn": "Увійти",
  "topbar.signUp": "Зареєструватися",
  "topbar.upload": "Завантажити",
  "topbar.uploadVideo": "Завантажити відео",
  "topbar.uploadGif": "Завантажити GIF",
  "topbar.uploadTooltip.any": "Завантажити відео або GIF",
  "topbar.uploadTooltip.video": "Завантажити відео",
  "topbar.uploadTooltip.gif": "Завантажити GIF",
  "topbar.uploadTooltip.busy": "Зачекайте, поки завершиться поточне завантаження",
  "topbar.uploadTooltip.otherTabBusy":
    "Інша вкладка вже завантажує. Зачекайте, поки вона закінчить.",
  "topbar.nav.all": "Усе",
  "topbar.nav.videos": "Відео",
  "topbar.nav.gifs": "GIF",
  "topbar.nav.screenshots": "Скріншоти",

  // ─── User menu ───
  "user.menu.aria": "Меню користувача {name}",
  "user.profile.changeAvatar": "Змінити аватар",
  "user.profile.verified": "Підтверджено",
  "user.profile.unverified": "Не підтверджено",
  "user.profile.videosUploaded": "Завантажено відео",
  "user.profile.miniPlayer.label": "Міні-плеєр",
  "user.profile.miniPlayer.hint":
    "Показувати плаваючий плеєр, коли ви виходите зі сторінки відео.",
  "user.profile.miniPlayer.toggleAria": "Перемкнути міні-плеєр",
  "user.profile.notifySubs.label": "Сповіщати підписників про завантаження",
  "user.profile.notifySubs.hint":
    "Надсилати сповіщення підписникам, коли ви публікуєте нове відео чи GIF.",
  "user.profile.notifySubs.toggleAria":
    "Перемкнути сповіщення підписників про завантаження",
  "user.profile.favorites": "Обране",
  "user.profile.subscriptions": "Підписки",
  "user.profile.signOut": "Вийти",
  "user.profile.language": "Мова",

  // Avatar pick / edit
  "avatar.pickNew": "Оберіть новий аватар",
  "avatar.dropHere": "Перетягніть зображення сюди",
  "avatar.browseHint":
    "або натисніть, щоб вибрати — JPEG, PNG, WebP до {mb} МБ",
  "avatar.cropAndRotate": "Обрізати та повернути",
  "avatar.zoom": "Масштаб",
  "avatar.rotate": "Поворот",
  "avatar.errorWrongType": "Оберіть зображення JPEG, PNG або WebP.",
  "avatar.errorTooLarge": "Зображення завелике. Максимум {mb} МБ.",
  "avatar.errorRead": "Не вдалося прочитати це зображення",
  "avatar.saveButton": "Зберегти аватар",

  // ─── Auth pages / forms ───
  "auth.login.title": "Video Hoster",
  "auth.login.subtitle":
    "Увійдіть, щоб завантажувати, переглядати та обговорювати відео.",
  "auth.login.continueGoogle": "Продовжити з Google",
  "auth.login.email": "Електронна пошта",
  "auth.login.password": "Пароль",
  "auth.login.signInButton": "Увійти",
  "auth.login.signingIn": "Виконується вхід...",
  "auth.login.invalid": "Невірна пошта або пароль",
  "auth.login.newHere": "Тут уперше?",
  "auth.login.createAccount": "Створити обліковий запис",

  "auth.signup.heading": "Створення облікового запису",
  "auth.signup.subtitle":
    "Зареєструйтесь за допомогою пошти та пароля.",
  "auth.signup.name": "Ім’я",
  "auth.signup.email": "Електронна пошта",
  "auth.signup.password": "Пароль",
  "auth.signup.namePlaceholder": "Іван Петренко",
  "auth.signup.emailPlaceholder": "you@example.com",
  "auth.signup.passwordPlaceholder": "Щонайменше 8 символів",
  "auth.signup.submit": "Зареєструватися",
  "auth.signup.creating": "Створення облікового запису...",
  "auth.signup.alreadyHave": "Вже маєте обліковий запис?",
  "auth.signup.signInLink": "Увійти",
  "auth.signup.takenLine": "Обліковий запис із поштою {email} вже існує.",
  "auth.signup.signInInstead": "Увійти замість цього →",
  "auth.signup.autoFail":
    "Обліковий запис створено, але автоматичний вхід не вдався. Спробуйте увійти вручну.",
  "auth.signup.checkEmailHeading": "Перевірте свою пошту",
  "auth.signup.checkEmailBody":
    "Ми надіслали посилання для підтвердження на {email}. Натисніть на нього, щоб активувати обліковий запис, а потім увійдіть.",
  "auth.signup.linkExpires": "Посилання дійсне 24 години.",
  "auth.signup.backToSignIn": "Повернутися до входу",
  "auth.signup.failed": "Не вдалося зареєструватися",

  "confirm.missing.heading": "Немає токена",
  "confirm.missing.body":
    "Це посилання для підтвердження неповне. Скористайтеся посиланням з листа, який ми вам надіслали.",
  "confirm.loading.heading": "Підтвердження…",
  "confirm.loading.body": "Зачекайте, поки ми підтвердимо ваш обліковий запис.",
  "confirm.success.heading": "Обліковий запис підтверджено",
  "confirm.success.body": "{email} готовий до входу.",
  "confirm.success.cta": "Перейти до входу",
  "confirm.error.heading": "Не вдалося підтвердити",
  "confirm.error.fallback": "Не вдалося підтвердити ваш обліковий запис.",
  "confirm.error.cta": "Зареєструватися знову",

  "auth.required.title": "Увійдіть, щоб продовжити",
  "auth.required.body":
    "Потрібен обліковий запис, щоб переглядати відео, шукати, коментувати або зберігати в обране.",

  // ─── Pages ───
  "page.dashboard.heading": "Усе",
  "page.dashboard.subtitle":
    "Останні відео та GIF від усіх на Video Hoster.",
  "page.dashboard.empty":
    'Тут поки що порожньо. Натисніть «Завантажити», щоб додати перше відео або GIF.',

  "page.videos.heading": "Усі відео",
  "page.videos.subtitle": "Останні завантаження відео на Video Hoster.",
  "page.videos.empty":
    'Поки що немає відео. Натисніть «Завантажити», щоб додати перше.',

  "page.gifs.heading": "Усі GIF",
  "page.gifs.subtitle": "Короткі цикли, завантажені на Video Hoster.",
  "page.gifs.empty":
    'Поки що немає GIF. Натисніть «Завантажити» та оберіть GIF у редакторі.',

  "page.favorites.heading": "Обране",
  "page.favorites.subtitle": "Відео, які ви зберегли на потім.",
  "favorites.empty": "Поки немає обраних.",
  "favorites.empty.hint":
    "Відкрийте відео й натисніть зірочку, щоб зберегти його сюди.",
  "favorites.empty.cta": "Переглянути відео →",

  "page.search.heading": "Пошук",
  "page.search.resultsFor": "Результати для «{q}»",
  "page.search.tagLabel": "Тег:",
  "page.search.empty.prompt":
    "Введіть запит у рядку пошуку вище або натисніть тег для фільтрації.",
  "page.search.noMatch": "Нічого не знайдено за вашим запитом.",

  "page.video.signInOverlay": "Увійдіть, щоб переглянути це відео",
  "page.video.signInButton": "Увійти",
  "page.video.processing": "Відео ще обробляється.",
  "page.video.suggested": "Рекомендоване",
  "page.gif.processing": "GIF ще обробляється.",
  "page.gif.similar": "Схожі GIF",
  "page.gif.noSimilar": "Поки немає схожих GIF.",

  // ─── Sort ───
  "sort.newest": "Найновіше",
  "sort.mostLiked": "Найбільше вподобань",
  "sort.mostDisliked": "Найбільше дизлайків",
  "sort.aria.videos": "Сортувати відео",
  "sort.aria.comments": "Сортувати коментарі",

  // ─── Cards ───
  "card.noThumbnail": "Без обкладинки",
  "card.noPreview": "Без прев’ю",
  "card.private": "Приватне",
  "suggested.empty": "Поки немає схожих відео.",

  // ─── Reactions / favorites ───
  "favorite.button.on": "В обраному",
  "favorite.button.off": "В обране",

  // ─── Share ───
  "share.button": "Поділитися",
  "share.copied": "Скопійовано!",

  // ─── Comments ───
  "comments.count.one": "{n} коментар",
  "comments.count.many": "{n} коментарів",
  "comments.add.placeholder": "Додати коментар...",
  "comments.post": "Коментувати",
  "comments.posting": "Надсилання...",
  "comments.reply": "Відповісти",
  "comments.replying": "Відповісти",
  "comments.replyTo": "Відповісти {name}...",
  "comments.edit": "Редагувати",
  "comments.delete": "Видалити",
  "comments.delete.title": "Видалити коментар?",
  "comments.delete.body":
    "Цей коментар буде остаточно видалено{withReplies}. Це не можна скасувати.",
  "comments.delete.withReplies": ", разом з усіма відповідями",
  "comments.delete.failed": "Не вдалося видалити",

  // ─── Upload dialog (video) ───
  "upload.video.title": "Завантажити відео",
  "upload.video.subtitle":
    "До {gb} ГіБ. Виберіть кадр для обкладинки або завантажте власне зображення.",
  "upload.field.title": "Назва",
  "upload.field.title.placeholder": "Мій похід на вихідні",
  "upload.field.description": "Опис",
  "upload.field.description.placeholder": "Про що це?",
  "upload.field.tags": "Теги",
  "upload.field.tags.hint": "(через кому)",
  "upload.field.tags.placeholder": "похід, природа, влог",
  "upload.field.tags.gif.placeholder": "реакція, смішне, цикл",
  "upload.field.visibility": "Видимість",
  "upload.visibility.publicHint":
    "Видно на головній і в рекомендаціях для всіх.",
  "upload.visibility.privateHint": "Це відео можете бачити лише ви.",
  "upload.field.videoFile": "Відеофайл",
  "upload.field.thumbnail": "Обкладинка",
  "upload.thumb.capturing": "Створення...",
  "upload.thumb.frame": "Кадр",
  "upload.thumb.useFrame": "Узяти цей кадр",
  "upload.thumb.uploadCustom": "Завантажити власну",
  "upload.thumb.errorType":
    "Обкладинка має бути зображенням JPEG, PNG або WebP.",
  "upload.thumb.errorSize":
    "Зображення {actual} МБ. Максимум {max} МБ.",
  "upload.thumb.autoFail":
    "Не вдалося автоматично створити обкладинку. Виберіть кадр або завантажте власне зображення.",
  "upload.file.errorSize":
    "Файл {gib} ГіБ. Максимум {max} ГіБ.",
  "upload.file.errorType": "Непідтримуваний тип файлу: {type}.",
  "upload.busy": "Завантаження...",
  "upload.continue": "Продовжити",
  "upload.otherTab.busy":
    "Інша вкладка вже завантажує. Зачекайте, поки вона закінчить, перш ніж починати нове завантаження тут.",
  "upload.progress.preparing": "Підготовка...",
  "upload.progress.compressing": "Стискаємо {name} {pct}%",
  "upload.progress.uploading": "Завантаження {name} {pct}%",
  "upload.progress.finalizing": "Завершення (генеруємо обкладинку)...",
  "upload.progress.failed": "Завантаження не вдалося: {reason}",
  "upload.error.unknown": "невідома помилка",
  "upload.success.heading": "Завантаження завершено",
  "upload.success.body": "{title} завантажено.",
  "upload.success.suffix": " — завантажено.",
  "upload.success.dismiss": "Закрити",

  // ─── Upload dialog (GIF) ───
  "upload.gif.title": "Завантажити GIF",
  "upload.gif.subtitle":
    "До {mb} МБ і {sec} секунд при завантаженні як GIF. Можна також конвертувати у відео MP4.",
  "upload.gif.title.placeholder": "Мій улюблений цикл",
  "upload.gif.saveAs": "Зберегти як",
  "upload.gif.saveAs.gif": "GIF",
  "upload.gif.saveAs.mp4": "Конвертувати в MP4",
  "upload.gif.saveAs.gifHint":
    "Збережеться як анімований GIF і відображатиметься на сторінці GIF.",
  "upload.gif.saveAs.mp4Hint":
    "Перекодуємо у MP4 480p і збережемо у ваші відео.",
  "upload.gif.fileLabel": "Файл GIF",
  "upload.gif.dropHint":
    "Перетягніть GIF сюди або натисніть, щоб вибрати",
  "upload.gif.dropSize": "До {mb} МБ · .gif",
  "upload.gif.notGif":
    "Це не схоже на GIF. Виберіть файл .gif.",
  "upload.gif.tooBig": "GIF — {size} МБ. Максимум {max} МБ.",
  "upload.gif.tooLong":
    "GIF — {sec} с. Максимальна тривалість {max} с.",
  "upload.gif.converting": "Конвертуємо в MP4… {pct}%",
  "upload.gif.convertingShort": "Конвертуємо…",
  "upload.gif.uploading": "Завантаження…",
  "upload.gif.upload": "Завантажити GIF",
  "upload.gif.convertAndUpload": "Конвертувати та завантажити",

  // ─── Video editor ───
  "editor.title": "Редагувати відео",
  "editor.subtitle":
    "Обріжте, поверніть, кадруйте та масштабуйте перед завантаженням. Можна також зробити з кліпу анімований GIF (макс. {sec} с, {mb} МБ).",
  "editor.output": "Вивід",
  "editor.output.video": "Відео",
  "editor.output.gif": "GIF",
  "editor.trim": "Обрізка",
  "editor.trim.start": "Початок",
  "editor.trim.end": "Кінець",
  "editor.rotate": "Поворот",
  "editor.crop": "Кадр",
  "editor.crop.original": "Оригінал",
  "editor.zoom": "Масштаб",
  "editor.speed": "Швидкість",
  "editor.export": "Експорт",
  "editor.export.audio": "Аудіо (.mp3)",
  "editor.export.video": "Відео (без аудіо)",
  "editor.export.extracting": "Витягування…",
  "editor.noFile": "Файл не вибрано.",
  "editor.gif.tooLong":
    "GIF не може бути довшим за {sec} с. Спершу обріжте.",
  "editor.gif.tooBig":
    "Згенерований GIF — {size} МБ — більше за ліміт {max} МБ. Обріжте більше або зменште роздільну здатність.",
  "editor.gif.building": "Створюємо GIF… {pct}%",
  "editor.applyVideo": "Застосувати та завантажити",
  "editor.applyGif": "Конвертувати та завантажити GIF",
  "editor.aria.seek": "Перемотування",
  "editor.aria.trimStart": "Початок обрізки",
  "editor.aria.trimEnd": "Кінець обрізки",
  "editor.aria.zoom": "Масштаб",
  "editor.aria.speed": "Швидкість відтворення",

  // ─── Video player ───
  "player.aria.player": "Відеоплеєр",
  "player.aria.play": "Відтворити",
  "player.aria.pause": "Пауза",
  "player.aria.mute": "Вимкнути звук",
  "player.aria.unmute": "Увімкнути звук",
  "player.aria.fullscreen.enter": "На весь екран",
  "player.aria.fullscreen.exit": "Вийти з повноекранного режиму",
  "player.aria.seek": "Перемотування",
  "player.aria.volume": "Гучність",

  // ─── Mini player ───
  "mini.aria.label": "Міні-плеєр",
  "mini.aria.open": "Відкрити {title}",
  "mini.aria.close": "Закрити міні-плеєр",
  "mini.prompt.title": "Сховати міні-плеєр?",
  "mini.prompt.body":
    "Міні-плеєр продовжує відтворювати відео в кутку, коли ви переходите на інші сторінки.",
  "mini.prompt.q": "Сховати назавжди чи лише цього разу?",
  "mini.prompt.justOnce": "Лише цього разу",
  "mini.prompt.alwaysHide": "Сховати назавжди",

  // ─── Notifications ───
  "notifications.title": "Сповіщення",
  "notifications.aria": "Сповіщення",
  "notifications.aria.unread": "Сповіщення ({n} непрочитаних)",
  "notifications.loading": "Завантаження…",
  "notifications.empty":
    "Поки немає сповіщень. Тут з’являться вподобання ваших відео та GIF.",
  "notifications.markAll": "Позначити всі як прочитані",
  "notifications.likedVideo": "вподобав(-ла) ваше відео",
  "notifications.likedGif": "вподобав(-ла) ваш GIF",
  "notifications.time.secondsAgo": "{n} с тому",
  "notifications.time.minutesAgo": "{n} хв тому",
  "notifications.time.hoursAgo": "{n} год тому",
  "notifications.time.daysAgo": "{n} дн тому",

  // ─── Delete dialogs ───
  "delete.video.title": "Видалити відео?",
  "delete.video.body":
    '«{title}» буде остаточно видалено разом з обкладинкою та завантаженим файлом. Це не можна скасувати.',
  "delete.gif.title": "Видалити GIF?",
  "delete.gif.body":
    '«{title}» буде остаточно видалено. Це не можна скасувати.',

  // ─── Screenshots ───
  "screenshots.page.title": "Скріншоти",
  "screenshots.page.subtitle":
    "Кадри, які ви зберегли з відео та GIF.",
  "screenshots.empty":
    "Скріншотів ще немає. Збережіть кадр під час завантаження відео або GIF.",
  "screenshots.detail.notFound": "Скріншот не знайдено",
  "screenshots.detail.download": "Завантажити",
  "screenshots.detail.openOriginal": "Відкрити оригінал",
  "screenshots.card.download": "Завантажити",
  "screenshots.card.private": "Приватне",
  "screenshots.editor.button": "Зберегти скріншот",
  "screenshots.editor.saving": "Збереження скріншота…",
  "screenshots.editor.savedHtml":
    'Скріншот збережено. Перегляньте у вкладці <a href="{href}">Скріншоти</a>.',
  "screenshots.gif.button": "Зберегти скріншот",
  "screenshots.gif.saving": "Збереження…",
  "screenshots.gif.notReady": "GIF ще не повністю завантажено. Спробуйте ще раз.",
  "delete.screenshot.title": "Видалити скріншот?",
  "delete.screenshot.body":
    '«{title}» буде остаточно видалено. Це не можна скасувати.',
};
