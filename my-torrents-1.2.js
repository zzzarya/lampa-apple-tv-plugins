/*
 * My Torrents 1.2.0 — standalone Lampa plugin (ES5).
 * API checked against TorrServer MatriX.137 and public Lampa source.
 * Apple TV TestFlight execution has NOT been verified.
 * No remote dependencies, parser, torrent add/remove, or settings changes.
 */
(function (w) {
    'use strict';

    // Change only this value if the local server address changes.
    var SERVER_URL = 'http://192.168.1.98:8090';
    var VERSION = '1.2.0';
    var TITLE = 'Мои торренты';
    var KEY = '__lampa_my_torrents_137';
    var VIDEO = /\.(mkv|mp4|m4v|mov|avi|ts|m2ts|mts|webm|mpg|mpeg|m2v|vob|wmv|flv|ogv|3gp|3g2|divx)$/i;
    var L, $, attempts = 0, timer, noticeTimer, checkTimer;
    var followed, appReady = false, returnController = 'menu', reported = false;
    var ICON = '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="3" y="5" width="26" height="22" rx="3" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M13 11l9 5-9 5V11z" fill="currentColor"/></svg>';

    if (w[KEY] && w[KEY].version === VERSION) {
        if (w[KEY].refresh) w[KEY].refresh();
        return;
    }
    if (w[KEY] && w[KEY].dispose) w[KEY].dispose();
    var state = w[KEY] = { version: VERSION, ready: false, menu: false, settings: false, lastError: '' };
    SERVER_URL = SERVER_URL.replace(/\/+$/, '');

    // Visible proof of JS execution, even when this build lacks Lampa/jQuery.
    function notify(message) {
        state.lastNotice = message;
        var doc = w.document;
        var old = doc && doc.getElementById('my-ts137-notice');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        if (w.console && w.console.log) w.console.log('[My Torrents]', message);
        if (L && L.Noty && typeof L.Noty.show === 'function') {
            try { L.Noty.show(message, { time: 12000 }); return; } catch (e) { /* UI may still be starting. */ }
        }
        if (!doc || !doc.body) return;
        var node = doc.createElement('div');
        node.id = 'my-ts137-notice';
        node.textContent = message;
        node.style.cssText = 'position:fixed;top:24px;left:5%;right:5%;z-index:2147483647;' +
            'padding:16px;background:#171717;color:white;font:22px sans-serif;pointer-events:none;';
        doc.body.appendChild(node);
        w.clearTimeout(noticeTimer);
        noticeTimer = w.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 12000);
    }

    function diagnostics() {
        var button = $ && $('.menu__item[data-action="my_ts137"]');
        return 'MYTS-DIAG ' + VERSION + ': Lampa=' + (L ? 'да' : 'нет') +
            ', jQuery=' + (typeof $ === 'function' ? 'да' : 'нет') +
            ', меню=' + (state.menu ? 'да' : 'нет') +
            ', скрыто=' + (button && button.hasClass('hidden') ? 'да' : 'нет') +
            ', настройки=' + (state.settings ? 'да' : 'нет') +
            ', Player=' + (L && L.Player && typeof L.Player.play === 'function' ? 'да' : 'нет') +
            ', интерфейс=' + (L && L.Manifest ? L.Manifest.app_version || '?' : '?');
    }

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

    function timeLabel(seconds) {
        seconds = Math.max(0, Math.floor(Number(seconds) || 0));
        var h = Math.floor(seconds / 3600);
        var m = Math.floor(seconds / 60) % 60;
        var s = seconds % 60;
        return (h ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function fileTimeline(torrent, file) {
        if (!L.Timeline || typeof L.Timeline.view !== 'function') return null;
        // Same decimal-string hash shape as Lampa.Utils.hash. Identity excludes the
        // server URL and display title, so an IP/title change keeps the position.
        var identity = 'my_ts137|' + torrent.hash.toLowerCase() + '|' + file.path;
        var hash = 0;
        for (var i = 0; i < identity.length; i++) hash = ((hash << 5) - hash + identity.charCodeAt(i)) | 0;
        try { return L.Timeline.view(String(Math.abs(hash) || 1)); } catch (e) { return null; }
    }

    function backToMenu() {
        L.Controller.toggle(returnController);
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
        if (!L.Select || typeof L.Select.show !== 'function' || typeof L.Select.close !== 'function' ||
            !L.Controller || typeof L.Controller.toggle !== 'function' || typeof L.Reguest !== 'function') {
            state.lastError = 'MYTS-API: в этой сборке недоступны Select, Controller или Reguest.';
            notify(state.lastError + ' ' + diagnostics());
            return;
        }
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
                var timeline = fileTimeline(torrent, file);
                var position = timeline && timeline.time > 0 ? ' · Позиция ' + timeLabel(timeline.time) : '';
                items.push({
                    title: escapeHTML(file.path.split(/[\\/]/).pop()),
                    subtitle: escapeHTML(sizeOf(file.length) + position + ' · ' + file.path),
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
                        var timeline = fileTimeline(torrent, file);
                        var entry = { url: url, title: filename, id: file.id };
                        var media = { url: url, title: filename, id: file.id };
                        if (timeline) {
                            entry.timeline = timeline;
                            media.timeline = timeline;
                        } else {
                            notify('MYTS-TIMELINE: API таймкодов недоступен; видео откроется без сохранения позиции.');
                        }
                        // tvOS players receive serialized playlist entries. As in
                        // Lampa's torrent component, use a separate entry to avoid
                        // a circular media.playlist -> media reference.
                        var playlist = [entry];
                        media.playlist = playlist;
                        L.Player.play(media);
                        if (typeof L.Player.playlist === 'function') L.Player.playlist(playlist);
                    } catch (e) {
                        errorBox('MYTS-PLAYER: ' + String(e.message || e), retry, back);
                    }
                },
                onBack: back
            });
        }, retry, back);
    }

    function enter(controller) {
        returnController = controller;
        openTorrents();
    }

    function registerSettings() {
        var api = L && L.SettingsApi;
        if (state.settings || !api || !api.addComponent || !api.addParam) return;
        api.addComponent({ component: 'my_ts137', name: TITLE, icon: ICON });
        api.addParam({
            component: 'my_ts137',
            param: { name: 'my_ts137_open', type: 'button' },
            field: { name: 'Открыть мои торренты', description: 'Плагин ' + VERSION },
            onRender: function (item) {
                item.on('hover:enter', function () { enter('settings_component'); });
            }
        });
        api.addParam({
            component: 'my_ts137',
            param: { name: 'my_ts137_diagnostics', type: 'button' },
            field: { name: 'Диагностика ' + VERSION, description: 'Показать доступные API и состояние меню' },
            onRender: function (item) { item.on('hover:enter', function () { notify(diagnostics()); }); }
        });
        state.settings = true;
    }

    function menuList(body) {
        if (typeof $ !== 'function') return null;
        var list;
        if (body && typeof body.find === 'function') list = body.find('.menu__list').eq(0);
        if ((!list || !list.length) && L && L.Menu && typeof L.Menu.render === 'function') {
            try {
                var root = L.Menu.render();
                if (root) list = $(root).find('.menu__list').eq(0);
            } catch (e) { /* Menu has not been initialized yet. */ }
        }
        if (!list || !list.length) list = $('.menu .menu__list').eq(0);
        if (!list.length) list = $('.menu__list').eq(0);
        return list.length ? list : null;
    }

    function attachMenu(list) {
        if (!list) return false;
        if (!list.find('[data-action="my_ts137"]').length) {
            var button = $('<li class="menu__item selector" data-action="my_ts137">' +
                '<div class="menu__ico">' + ICON + '</div><div class="menu__text">' + TITLE + '</div></li>');
            button.on('hover:enter', function () { enter('menu'); });
            // Use Lampa's own menu insertion first; fall back to the discovered list.
            if (L.Menu && typeof L.Menu.addElement === 'function') {
                try { L.Menu.addElement(button); } catch (e) { /* Use list below. */ }
            }
            if (!list.find('[data-action="my_ts137"]').length) list.append(button);
        }
        state.menu = true;
        state.ready = true;
        if (!reported) {
            reported = true;
            // The menu editor applies saved visibility after a delay.
            checkTimer = w.setTimeout(function () {
                var hidden = list.find('[data-action="my_ts137"]').hasClass('hidden');
                notify(hidden ? 'MYTS-HIDDEN ' + VERSION + ': пункт скрыт. Откройте настройки → Мои торренты.' :
                    'MYTS-MENU ' + VERSION + ': пункт «Мои торренты» добавлен.');
            }, 1000);
        }
        return true;
    }

    function onApp(event) {
        if (event.type === 'ready') {
            appReady = true;
            reported = false;
            w.clearTimeout(checkTimer);
            boot();
        }
    }

    function onMenu(event) {
        if (event.type === 'start' || event.type === 'end' || event.type === 'toggle') boot(event.body);
    }

    function boot(body) {
        if (state.disposed) return;
        w.clearTimeout(timer);
        L = w.Lampa;
        $ = w.jQuery || w.$;
        try {
            if (L && L.Listener && L.Listener !== followed && typeof L.Listener.follow === 'function') {
                followed = L.Listener;
                followed.follow('app', onApp);
                followed.follow('menu', onMenu);
            }
            var list = menuList(body);
            // A real menu, or the app's ready event, is sufficient. A fork need
            // not expose window.appready to register this plugin's entry points.
            if (L && (w.appready || appReady || list)) {
                try { registerSettings(); } catch (settingsError) {
                    state.settingsError = String(settingsError.message || settingsError);
                }
            }
            if (L && attachMenu(list)) return;
        } catch (e) {
            state.lastError = 'MYTS-INIT ' + VERSION + ': ' + String(e.message || e);
        }
        if (++attempts < 240) timer = w.setTimeout(boot, 250);
        else {
            state.lastError = (state.settings ? 'MYTS-SETTINGS: откройте настройки → Мои торренты. ' : 'MYTS-INIT: ') + diagnostics();
            notify(state.lastError);
        }
    }

    state.refresh = boot;
    state.dispose = function () {
        state.disposed = true;
        w.clearTimeout(timer);
        w.clearTimeout(noticeTimer);
        w.clearTimeout(checkTimer);
        if (followed && typeof followed.remove === 'function') {
            followed.remove('app', onApp);
            followed.remove('menu', onMenu);
        }
    };
    notify('MYTS-JS ' + VERSION + ': код плагина запущен.');
    boot();
})(window);
