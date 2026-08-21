/**
 * Lakes Log — first-visit standing-orders nudge, unit toggle, Echo shanty.
 */
(function () {
    'use strict';

    var GUIDE_COOKIE = 'lake_log_seen_guide';
    var UNITS_COOKIE = 'hundred_acre_units';
    var SHANTY_MUTE_KEY = 'st_log_shanty_mute';
    var SHANTY_VOLUME = 0.2;

    function readCookie(name) {
        var parts = document.cookie.split(';');
        for (var i = 0; i < parts.length; i++) {
            var bit = parts[i].trim();
            if (bit.indexOf(name + '=') === 0) {
                return decodeURIComponent(bit.substring(name.length + 1));
            }
        }
        return '';
    }

    function writeCookie(name, value, maxAge) {
        document.cookie = name + '=' + encodeURIComponent(value)
            + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
    }

    function hideNudge(nudge) {
        nudge.hidden = true;
        nudge.setAttribute('aria-hidden', 'true');
        nudge.style.display = 'none';
    }

    function shantyMuted() {
        try {
            return localStorage.getItem(SHANTY_MUTE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function setShantyMuted(on) {
        try {
            localStorage.setItem(SHANTY_MUTE_KEY, on ? '1' : '0');
        } catch (e) {}
    }

    function syncShantyBtn(btn, playing) {
        if (!btn) return;
        btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
        btn.textContent = playing ? 'Mute' : 'Sound';
        btn.setAttribute('aria-label', playing ? 'Mute sea shanty' : 'Play sea shanty');
    }

    function initShanty() {
        if (document.body.getAttribute('data-from-echo') !== '1') return;
        var audio = document.getElementById('logShanty');
        var btn = document.getElementById('logShantyBtn');
        if (!audio || !btn) return;

        audio.volume = SHANTY_VOLUME;
        audio.loop = true;

        function start() {
            return audio.play().then(function () {
                syncShantyBtn(btn, true);
            }).catch(function () {
                syncShantyBtn(btn, false);
            });
        }

        function stop() {
            audio.pause();
            syncShantyBtn(btn, false);
        }

        btn.addEventListener('click', function () {
            if (!audio.paused) {
                stop();
                setShantyMuted(true);
                return;
            }
            setShantyMuted(false);
            start();
        });

        if (shantyMuted()) {
            syncShantyBtn(btn, false);
            return;
        }

        start().then(function () {
            if (audio.paused) {
                var unlock = function () {
                    document.removeEventListener('pointerdown', unlock, true);
                    if (!shantyMuted() && audio.paused) start();
                };
                document.addEventListener('pointerdown', unlock, true);
            }
        });
    }

    function init() {
        var nudge = document.getElementById('log-guide-nudge');
        if (nudge && !readCookie(GUIDE_COOKIE)) {
            nudge.hidden = false;
            nudge.removeAttribute('aria-hidden');
            nudge.style.display = '';
        }

        var dismiss = document.getElementById('log-guide-dismiss');
        if (dismiss && nudge) {
            dismiss.addEventListener('click', function () {
                writeCookie(GUIDE_COOKIE, '1', 60 * 60 * 24 * 365);
                hideNudge(nudge);
            });
        }

        var unitToggle = document.getElementById('woods-unit-toggle');
        if (unitToggle) {
            unitToggle.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-units]');
                if (!btn) return;
                var units = btn.getAttribute('data-units');
                if (!units || units === readCookie(UNITS_COOKIE)) return;
                writeCookie(UNITS_COOKIE, units, 60 * 60 * 24 * 365);
                window.location.reload();
            });
        }

        initShanty();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
