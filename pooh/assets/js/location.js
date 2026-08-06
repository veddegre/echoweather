/**
 * Optional browser geolocation — refines IP-based estimate when permitted.
 */
(function () {
    'use strict';

    var body = document.body;
    if (!body || body.dataset.locationSource === 'browser' || body.dataset.locationSource === 'manual') {
        return;
    }

    if (!navigator.geolocation) {
        return;
    }

    var btn = document.getElementById('use-my-location');
    if (btn) {
        btn.addEventListener('click', function () {
            requestBrowserLocation(btn);
        });
    }

    // Silently try browser location once if IP/default was used
    if (body.dataset.locationSource === 'ip' || body.dataset.locationSource === 'default') {
        requestBrowserLocation(null, true);
    }

    function requestBrowserLocation(button, silent) {
        if (button) {
            button.disabled = true;
            button.textContent = 'Finding you…';
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                var lat = pos.coords.latitude;
                var lon = pos.coords.longitude;
                var url = new URL(window.location.href);
                url.searchParams.set('lat', lat.toFixed(4));
                url.searchParams.set('lon', lon.toFixed(4));
                url.searchParams.set('detected', 'browser');
                url.searchParams.delete('name');
                window.location.href = url.toString();
            },
            function () {
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Use my precise location';
                }
                if (!silent && button) {
                    button.insertAdjacentHTML('afterend', ' <span class="location-hint">Location access was denied.</span>');
                }
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    }
})();
