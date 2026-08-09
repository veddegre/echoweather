/**
 * Hundred Acre — first-visit guide nudge and unit toggle.
 */
(function () {
    'use strict';

    var GUIDE_COOKIE = 'hundred_acre_seen_guide';
    var UNITS_COOKIE = 'hundred_acre_units';

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

    var nudge = document.getElementById('woods-guide-nudge');
    if (nudge && !readCookie(GUIDE_COOKIE)) {
        nudge.hidden = false;
    }

    var dismiss = document.getElementById('woods-guide-dismiss');
    if (dismiss && nudge) {
        dismiss.addEventListener('click', function () {
            writeCookie(GUIDE_COOKIE, '1', 60 * 60 * 24 * 365);
            nudge.hidden = true;
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
})();
