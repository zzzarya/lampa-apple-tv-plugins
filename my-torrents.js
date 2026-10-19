/*
 * My Torrents 1.0.0 — standalone Lampa plugin (ES5).
 * API checked against TorrServer MatriX.137 and public Lampa source.
 * Apple TV TestFlight execution has NOT been verified.
 * No remote dependencies, parser, torrent add/remove, or settings changes.
 */
(function (w) {
    'use strict';

    // Change only this value if the local server address changes.
    var SERVER_URL = 'http://192.168.1.98:8090';
    var TITLE = 'Мои торренты';
    var KEY = '__lampa_my_torrents_137';
    var VIDEO = /\.(mkv|mp4|m4v|mov|avi|ts|m2ts|mts|webm|mpg|mpeg|m2v|vob|wmv|flv|ogv|3gp|3g2|divx)$/i;
    var L, $, attempts = 0;

    if (w[KEY]) return;
    var state = w[KEY] = { version: '1.0.0', ready: false, lastError: '' };
    SERVER_URL = SERVER_URL.replace(/\/+$/, '');

    function escapeHTML(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function nameOf(torrent) {
        return String(torrent.title || torrent.name || torrent.hash || 'Без названия');
    }

    function sizeOf(bytes) {
        if (!(bytes > 0)) return '';
        var units = ['Б', 'КиБ', 'МиБ', 'ГиБ', 'ТиБ'];
        var i = 0;
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return (i ? bytes.toFixed(1) : String(bytes)) + ' ' + units[i];
    }

    function backToMenu() {
        L.Controller.toggle('menu');
    }

    function errorBox(message, retry, back) {
        state.lastError = message;
        if (w.console && w.console.warn) w.console.warn('[My Torrents]', message);
        L.Select.show({
            title: TITLE + ' — ошибка',
            items: [
                { title: escapeHTML(message), noenter: true },
                { title: 'Повторить', action: 'retry' },
                { title: 'Назад', action: 'back' }
            ],
            onSelect: function (item) { (item.action === 'retry' ? retry : back)(); },
            onBack: back
        });
    }

    function networkError(xhr, reason) {
        // Reguest versions may discard the second jQuery error argument.
        if (reason === 'timeout' || (xhr && xhr.statusText === 'timeout')) {
            return 'MYTS-TIMEOUT: сервер не ответил вовремя.';
        }
        if (xhr && xhr.status >= 200 && xhr.status < 300) return 'MYTS-JSON: сервер вернул не JSON.';
        if (xhr && xhr.status) return 'MYTS-HTTP ' + xhr.status + ': ' + SERVER_URL;
        return 'MYTS-NET: нет доступа к ' + SERVER_URL +
            '. Проверьте сеть, разрешение локальной сети, HTTP и CORS в этой сборке.';
    }

    // Each request owns a cancellable loading picker. clear() suppresses its
    // callbacks; it need not abort the underlying transport in every Lampa build.
    function request(path, body, timeout, success, retry, back) {
        var net = new L.Reguest();
        var alive = true;

        function cancel() {
            if (!alive) return;
            alive = false;
            net.clear();
            back();
        }

        function finish() {
            if (!alive) return false;
            alive = false;
            // close() may call onBack. alive=false makes that a no-op.
            L.Select.close();
            net.clear();
            return true;
        }

        L.Select.show({
            title: TITLE,
            items: [
                { title: 'Загрузка…', noenter: true },
                { title: 'Отмена' }
            ],
            onSelect: cancel,
            onBack: cancel
        });

        try {
            net.native(SERVER_URL + path, function (json) {
                if (!finish()) return;
                try {
                    if (typeof json === 'string') json = JSON.parse(json);
                } catch (e) {
                    errorBox('MYTS-JSON: сервер вернул не JSON.', retry, back);
                    return;
                }
                state.lastError = '';
                success(json);
            }, function (xhr, reason) {
                if (finish()) errorBox(networkError(xhr, reason), retry, back);
            }, body ? JSON.stringify(body) : false, {
                dataType: 'json',
                timeout: timeout,
                headers: body ? { 'Content-Type': 'application/json' } : {}
            });
        } catch (e) {
            if (finish()) errorBox('MYTS-API: ' + String(e.message || e), retry, back);
        }
    }

    function showTorrents(torrents) {
        var items = [];
        torrents.forEach(function (torrent) {
            if (!torrent || !/^[a-f0-9]{40}$/i.test(torrent.hash || '')) return;
            items.push({
                title: escapeHTML(nameOf(torrent)),
                subtitle: escapeHTML(sizeOf(torrent.torrent_size)),
                torrent: torrent
            });
        });
        if (!items.length) items.push({ title: 'Раздач нет. Добавьте торрент через браузер.', noenter: true });
        items.push({ title: 'Обновить список', action: 'refresh' });

        L.Select.show({
            title: TITLE,
            items: items,
            onSelect: function (item) {
                if (item.action === 'refresh') openTorrents();
                else openFiles(item.torrent, torrents);
            },
            onBack: backToMenu
        });
    }

    function openTorrents() {
        request('/torrents', { action: 'list' }, 15000, function (json) {
            if (!Array.isArray(json)) {
                errorBox('MYTS-LIST: ожидался массив раздач.', openTorrents, backToMenu);
                return;
            }
            showTorrents(json);
        }, openTorrents, backToMenu);
    }

    function openFiles(torrent, torrents) {
        function retry() { openFiles(torrent, torrents); }
        function back() { showTorrents(torrents); }

        // Unlike action:get, /stream?stat loads a saved but inactive torrent
        // and waits for metadata. Use the server's file id, never array position.
        request('/stream?link=' + encodeURIComponent(torrent.hash) + '&stat', null, 60000, function (json) {
            if (!json || !Array.isArray(json.file_stats)) {
                errorBox('MYTS-FILES: сервер не вернул file_stats. Повторите запрос.', retry, back);
                return;
            }
            var items = [];
            json.file_stats.forEach(function (file) {
                if (!file || typeof file.path !== 'string' || !VIDEO.test(file.path)) return;
                if (typeof file.id !== 'number' || file.id < 1 || file.id % 1 !== 0) return;
                items.push({
                    title: escapeHTML(file.path.split(/[\\/]/).pop()),
                    subtitle: escapeHTML(sizeOf(file.length) + ' · ' + file.path),
                    file: file
                });
            });
            if (!items.length) {
                items.push({ title: 'В раздаче нет видео с поддержанным расширением.', noenter: true });
                items.push({ title: 'Назад', action: 'back' });
            }
            L.Select.show({
                title: nameOf(torrent),
                items: items,
                onSelect: function (item) {
                    if (item.action === 'back') return back();
                    var file = item.file;
                    var filename = file.path.split(/[\\/]/).pop();
                    var url = SERVER_URL + '/stream/' + encodeURIComponent(filename) +
                        '?link=' + encodeURIComponent(torrent.hash) + '&index=' + file.id + '&play';
                    // Direct media playback through Lampa's existing player routing.
                    // No torrent_hash: this does not depend on Lampa's global
                    // TorrServer settings, statistics or torrent search component.
                    backToMenu();
                    try {
                        var media = { url: url, title: filename };
                        L.Player.play(media);
                        if (typeof L.Player.playlist === 'function') L.Player.playlist([media]);
                    } catch (e) {
                        errorBox('MYTS-PLAYER: ' + String(e.message || e), retry, back);
                    }
                },
                onBack: back
            });
        }, retry, back);
    }

    function boot() {
        L = w.Lampa;
        $ = w.jQuery || w.$;
        if (!L || !$ || !w.appready || !$('.menu .menu__list').length) {
            if (++attempts < 240) w.setTimeout(boot, 250);
            else {
                state.lastError = 'MYTS-INIT: за 60 секунд не найден готовый интерфейс Lampa.';
                if (w.console && w.console.warn) w.console.warn('[My Torrents]', state.lastError);
                if (L && L.Noty) L.Noty.show(state.lastError);
            }
            return;
        }
        if (!L.Select || typeof L.Select.show !== 'function' || typeof L.Select.close !== 'function' ||
            !L.Player || typeof L.Player.play !== 'function' ||
            !L.Controller || typeof L.Controller.toggle !== 'function' || typeof L.Reguest !== 'function') {
            state.lastError = 'MYTS-INIT: эта сборка не предоставляет нужные API Lampa.';
            if (L.Noty) L.Noty.show(state.lastError);
            return;
        }
        if (!$('.menu [data-action="my_ts137"]').length) {
            var button = $('<li class="menu__item selector" data-action="my_ts137">' +
                '<div class="menu__ico"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="3" y="5" width="26" height="22" rx="3" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M13 11l9 5-9 5V11z" fill="currentColor"/></svg></div>' +
                '<div class="menu__text">' + TITLE + '</div></li>');
            button.on('hover:enter', openTorrents);
            $('.menu .menu__list').eq(0).append(button);
        }
        state.ready = true;
        if (w.console && w.console.log) w.console.log('[My Torrents] 1.0.0 ready');
    }

    boot();
})(window);
