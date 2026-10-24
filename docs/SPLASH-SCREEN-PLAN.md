# План: сплэшскрин с пульсирующей иконкой

Задача (m00727): «хотел бы сделать при холодном запуске приложение сплэшкрин на котором иконка приложения пульсирует 3 сек».

Согласованные решения пользователя:
1. Содержимое — **только иконка**: тёмный фон `#0b0d12`, по центру замок, плавно «дышит» масштабом и свечением.
2. Длительность — **минимум 3 с, дальше по готовности** приложения.
3. Нативный сплэш Android — **переделать под стиль приложения** (фон `#0b0d12` + иконка замка), чтобы не было белой вспышки с логотипом Capacitor.

## Текущее состояние (проблема)

- **Веб-слой:** сплэша нет. `index.html` открывает сразу рабочий экран, холодный старт = мгновенный показ UI.
- **Нативный слой:** в `AppTheme.NoActionBarLaunch` стоит `<item name="android:background">@drawable/splash</item>` — дефолтные ассеты Capacitor: белый фон с синим «X». В `drawable/` лежат 12 вариантов `splash.png` (port/land × density), они перекрывают основной `drawable/splash.png` и именно дают белый экран.

## 1. Веб-сплэш (пульс)

- `index.html`: сразу после `<div id="app">` добавить оверлей `#splash` — фон `#0b0d12`, по центру `<img src="./logo.png">` (тот же логотип, что на экране разблокировки и в лаунчере). Разметка статическая, значит логотип виден уже на первом кадре, без «мигания» рабочего экрана.
- `src/styles.css`: добавить `@keyframes splash-pulse` — плавный scale 1 → 1.05 + усиление свечения (`drop-shadow`), `ease-in-out`, бесконечно. Класс `.splash-exit` — fade-out 400 мс перед удалением. Учесть существующий `prefers-reduced-motion` (пульс статичный).
- Новый `src/ui/splash.js`: `hideSplash()` — ждёт **одновременно** (а) минимум 3000 мс от старта навигации (`performance.now()`) и (б) сигнала «приложение готово», затем добавляет `.splash-exit` и через 400 мс удаляет оверлей из DOM.
- `src/main.js`: в `bootstrap()` вызвать `hideSplash()` после того, как `render()` отрисовал первый экран (`renderUnlock()` завершился, `mount()` прошёл) — «приложение готово» = экран ввода мастер-пароля на месте.
- `tests/splash.test.js`: сплэш не скрывается раньше 3 с; скрывается после ready + 3 с; оверлей удаляется из DOM.

## 2. Нативный сплэш (тёмный, в стиле приложения)

- Удалить все 12 `drawable/splash.png` (port/land × density) и `drawable/splash.png` — именно они дают белый «X».
- Добавить `drawable/splash.xml` (layer-list): подложка `#0b0d12` + по центру иконка замка (`@mipmap/ic_launcher_foreground` — та же круглая иконка, что в лаунчере; проверить альфа-канал PNG и при необходимости перегенерировать прозрачный вариант).
- `values/styles.xml`: в `AppTheme.NoActionBarLaunch` заменить `android:background` на `android:windowBackground` = `@drawable/splash` (Android < 12, окно рисует наш тёмный фон с логотипом).
- Новый `values-v31/styles.xml` (Android 12+): `android:windowSplashScreenBackground` = `@color/background` (`#0b0d12`), `android:windowSplashScreenAnimatedIcon` = `@mipmap/ic_launcher_foreground` — системный сплэш в том же стиле.
- Статус-бар (`colorPrimaryDark #0b0d12`) и фон WebView (`#0b0d12`) уже тёмные — переход нативный → веб бесшовный.

## 3. Релиз

Версия `1.12.5` (versionCode 30):
- `package.json`, `android/app/build.gradle` (versionCode + versionName), README;
- `tools/release-notes-1.12.5.md`;
- сборка `tools\build-apk.ps1` → проверка версии через aapt2 → публикация `node tools\publish-release.mjs v1.12.5 "Замок 1.12.5" tools\release-notes-1.12.5.md build\apk\zamok-debug.apk zamok-1.12.5.apk`.

На телефон не устанавливать (AGENTS.md).

## Открытые вопросы к пользователю

1. Публиковать ли релиз 1.12.5 сразу после реализации, или сначала только сборка APK на проверку.
