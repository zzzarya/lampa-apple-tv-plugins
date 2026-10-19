**Мои торренты — плагин Lampa 1.0.0**

Файл: [my-torrents.js](my-torrents.js). Адрес уже задан: `http://192.168.1.98:8090`.
Путь: боковое меню → «Мои торренты» → раздача → видеофайл → штатный вызов плеера Lampa.
Сторонние библиотеки, поиск и Jackett не нужны.

Проверено 19.10.2026: реальный сервер отвечает `MatriX.137`, отдаёт две раздачи и десять видеофайлов в проверенной раздаче. Пройдены девять проверок логики и API, включая отмену, возврат, ошибки и формирование ссылки на выбранный файл. Сетевой модуль взят из исходников Lampa; интерфейс и видеоплеер в проверках заменены имитацией. **Запуск плагина и воспроизведение на вашей TestFlight-сборке tvOS пока не проверены.**

**HTTPS-хостинг: GitHub Pages**

1. Репозиторий: [zzzarya/lampa-apple-tv-plugins](https://github.com/zzzarya/lampa-apple-tv-plugins). Файлы `my-torrents.js` и `README.md` должны находиться в корне ветки `main`.
2. Откройте **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Выберите `main` и `/ (root)`, сохраните.
3. После успешной публикации адрес плагина: [https://zzzarya.github.io/lampa-apple-tv-plugins/my-torrents.js](https://zzzarya.github.io/lampa-apple-tv-plugins/my-torrents.js).
4. Откройте адрес на Mac: он должен отдавать JavaScript, начинающийся с комментария `My Torrents 1.0.0`, без страницы GitHub, входа в аккаунт или ошибки 404. Для своего хостинга нужны HTTPS с доверенным сертификатом и MIME-тип `application/javascript` либо `text/javascript`.

GitHub описывает [публикацию Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) и [HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https). Публикация изменений может занять до десяти минут.

**Установка на Apple TV**

1. В Lampa откройте настройки плагинов/расширений; название пункта зависит от сборки.
2. Отключите прежний неработающий `my_ts.js`, добавьте HTTPS-адрес нового файла и полностью перезапустите Lampa.
3. Откройте боковое меню → **Мои торренты**. Выберите раздачу, затем видеофайл. Первое получение метаданных может занять до минуты.
4. Плагин вызывает `Lampa.Player.play()` и использует выбранный в Lampa плеер. Если требуется встроенный плеер приложения, выберите его в настройках Lampa; названия вариантов на вашей сборке не подтверждены. Настройки TorrServer в Lampa плагин не меняет.

Кнопка **Назад** из списка файлов возвращает к раздачам, из раздач — в меню. **Обновить список** перечитывает сервер. Раздачи добавляйте прежним способом через браузер. Плагин не добавляет и не удаляет раздачи. При открытии файлов сервер может активировать раздачу для получения метаданных.

**Если не работает**

| Признак | Что проверить |
| --- | --- |
| Красный значок, раздел не появился | Сначала проверьте HTTPS-адрес файла и перезапуск. По одному значку нельзя установить причину сбоя прежнего плагина. |
| `MYTS-INIT` | За минуту не найден готовый интерфейс либо в сборке нет нужных JS API Lampa. |
| `MYTS-NET` | Доступ Apple TV к локальной сети и HTTP-серверу. CORS вашего TorrServer проверен; политика HTTP/mixed content внутри TestFlight-сборки не проверена. HTTPS-хостинг JS сам по себе не снимает эти ограничения. |
| `MYTS-HTTP 401` | Сервер требует авторизацию; отдельной формы логина в плагине нет. |
| `MYTS-TIMEOUT`, `MYTS-FILES` | Повторите запрос; проверьте, получила ли раздача метаданные в веб-интерфейсе TorrServer. |
| Файлы видны, видео не играет | Проверяйте выбранный плеер, контейнер и кодеки на tvOS. Успешное воспроизведение в VLC на Mac этого не гарантирует. Плагин не перекодирует видео. |

Если сборка блокирует локальный HTTP, потребуется разрешённый ею способ доступа к серверу или локальный HTTPS с доверенным сертификатом. Простая замена `http` на `https` без настройки TLS не поможет. Публичный доступ к TorrServer для хостинга плагина не нужен.

**Использованные API**

- [TorrServer MatriX.137: `/torrents`](https://github.com/YouROK/TorrServer/blob/MatriX.137/server/web/api/torrents.go): JSON POST `{"action":"list"}`.
- [TorrServer MatriX.137: `/stream`](https://github.com/YouROK/TorrServer/blob/MatriX.137/server/web/api/stream.go): GET `?link=<hash>&stat`, затем `/stream/<имя>?link=<hash>&index=<file.id>&play`. Индекс берётся из ответа сервера; файлы отбираются по расширению, что не является проверкой кодеков.
- [Lampa: меню](https://github.com/yumata/lampa-source/blob/7a53473aa5d75793e5b80fb2edbb862c4440c79c/docs/en/09-manifest-menu.md), [окна выбора](https://github.com/yumata/lampa-source/blob/7a53473aa5d75793e5b80fb2edbb862c4440c79c/src/interaction/select.js), [сеть](https://github.com/yumata/lampa-source/blob/7a53473aa5d75793e5b80fb2edbb862c4440c79c/src/utils/reguest.js), [плеер](https://github.com/yumata/lampa-source/blob/7a53473aa5d75793e5b80fb2edbb862c4440c79c/src/interaction/player.js). Используются встроенные в Lampa jQuery, `Reguest.native`, `Select`, `Controller`, `Player.play`; `Player.playlist`, если доступен, ограничивает очередь выбранным файлом. Обращений к сторонним API нет.

Если IP изменится, исправьте `SERVER_URL` в начале JS, загрузите файл заново и переустановите ссылку с новой меткой, например `?v=2`, затем полностью перезапустите приложение.
