# Замок — заметки для разработчика

Офлайн-менеджер паролей. Данные шифруются на устройстве, мастер-пароль нигде не сохраняется.

Пользовательское описание проекта — в корневом `README.md`.

Результаты аудита безопасности и список открытых пунктов — в `docs/AUDIT.md`.

## Стек

- Vite 8 + Tailwind CSS 4 (движок `@tailwindcss/vite`, конфигурация в `src/styles.css` через `@theme`)
- Чистый JavaScript (ES-модули), без фреймворков
- Capacitor 8 для сборки Android
- Vitest для тестов

## Структура

```
src/
  core/
    crypto.js      PBKDF2-SHA-256 (600 000 итераций) + AES-GCM-256
    store.js       Vault: создание, разблокировка, CRUD, импорт/экспорт
    generator.js   Пароли, парольные фразы, оценка стойкости
    totp.js        Base32, разбор otpauth:// URI
    otp.js         Генерация TOTP (HMAC-SHA1/256/512)
    search.js      Поиск по записям
    format.js      Форматирование дат и чисел
    biometric-policy.js  Условия автопредложения биометрии
  ui/
    dom.js         Микро-хелперы и набор иконок
    brand-icons.js Фирменные значки сервисов (генерируются tools/gen-brand-icons.mjs)
    components/    form.js, feedback.js, photo.js, barcode.js, scanner.js
    screens/       unlock, list, detail, editor, card, loyalty, new-item, categories, generator, settings
  platform/
    native.js      Обёртки над Capacitor-плагинами
  main.js          Роутинг, состояние, автоблокировка
tools/             Локальные JDK 21, Android SDK, скрипты сборки
tests/             Модульные тесты
```

## Криптография

| Что | Как |
|---|---|
| Мастер-пароль | Не сохраняется, не может быть восстановлен |
| Ключ | PBKDF2-HMAC-SHA-256, 600 000 итераций, случайная соль 16 байт |
| Данные | AES-256-GCM, случайный IV 12 байт на каждую запись |
| Хранилище | Capacitor Preferences (SharedPreferences на Android), весь блок зашифрован |
| Буфер обмена | Очищается по таймеру (настраивается) |

При каждом изменении данных весь массив записей шифруется заново.

## Команды

```bash
npm install
npm run dev        # дев-сервер Vite
npm run build      # прод-сборка в dist/
npm test           # тесты (vitest)
npm run sync       # build + cap sync android
npm run apk        # полная сборка debug APK

node tools\preview-icons.mjs ticket barcode scanBarcode   # PNG-превью иконок (tools/icons-preview.png)
node tools\preview-field.mjs                              # как иконки выглядят в поле ввода
node tools\preview-list.mjs                               # как записи выглядят в списке
```

## Локальное окружение

Всё необходимое лежит в `tools/`, глобальная установка не требуется:

- `tools/jdk21` — Eclipse Temurin JDK 21 (требуется AGP 8.13)
- `tools/android-sdk` — Android SDK (platform 35/36, build-tools 35/36)
- `tools/gradle-home` — кэш Gradle

Переменные окружения выставляются скриптами в `tools/`.

## Сборка APK

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-apk.ps1
```

Скрипт сам собирает веб-часть (`npm run sync`: vite build + cap sync android), затем запускает Gradle и копирует APK. Если веб-сборка падает, Gradle пропускается и скрипт выходит с кодом 1.

Результат: `build\apk\zamok-debug.apk`

Логи сборки: `tools\cap-sync.log`, `tools\gradle.log` (смешанная кодировка: метки — UTF-8, вывод Gradle — UTF-16; читать через `Get-Content -Encoding Unicode`).

## Релизы

Релизы публикуются в GitHub (`adminmik7/zamok`) вручную: APK прикладывается к тегу `vX.Y`
как asset. Токен лежит в `github_token` и исключён из git (`.gitignore`).

Скрипт `tools\publish-release.mjs` делает это за один запуск: создаёт/обновляет релиз,
заливает asset и обновляет README в репозитории.

```
node tools\publish-release.mjs v1.1 "Замок 1.1" tools\release-notes-1.1.md build\apk\zamok-debug.apk zamok-1.1.apk
```

Перед публикацией обязательно поднять версию в трёх местах: `package.json`
(`version`), `android\app\build.gradle` (`versionCode` + `versionName`) и README.

## Android-настройки

- `minSdk 24` (требуется плагином биометрии), `targetSdk 36`
- `allowBackup=false`
- Разрешение `USE_BIOMETRIC` для биометрии
- Тема настраивается под тёмный интерфейс
- Edge-to-edge: отступы под системные панели берутся из CSS-переменных `--safe-area-inset-*`

## Ограничения

- Биометрия подтверждается только на устройстве с поддержкой и реально настроенным отпечатком/PIN
- Экспорт в незашифрованный JSON — файл нужно самостоятельно обезопасить
- Приглашение «введите мастер-пароль после биометрии» — намеренное: ключ шифрования хранится только в памяти и восстанавливается паролем
