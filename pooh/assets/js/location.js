/**
 * Location — GPS, search, and Echo handoff.
 */
(function () {
    'use strict';

    var body = document.body;
    var geoBtn = document.getElementById('use-my-location');
    var searchForm = document.getElementById('location-search-form');
    var searchInput = document.getElementById('location-search-input');
    var searchResults = document.getElementById('location-search-results');

    function navigateTo(lat, lon, name, source) {
        var url = new URL(window.location.pathname, window.location.origin);
        var params = new URLSearchParams(window.location.search);
        url.searchParams.set('lat', lat.toFixed(4));
        url.searchParams.set('lon', lon.toFixed(4));
        if (name) url.searchParams.set('name', name);
        if (source === 'browser') url.searchParams.set('detected', 'browser');
        else url.searchParams.delete('detected');
        if (source === 'search') url.searchParams.set('source', 'search');
        else url.searchParams.delete('source');
        if (params.get('from') === 'echo') url.searchParams.set('from', 'echo');
        window.location.href = url.toString();
    }

    function requestBrowserLocation(button) {
        if (!navigator.geolocation) {
            if (button) button.textContent = 'Geolocation unavailable';
            return;
        }
        if (button) {
            button.disabled = true;
            button.textContent = 'Finding you…';
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                navigateTo(pos.coords.latitude, pos.coords.longitude, null, 'browser');
            },
            function () {
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Where I am';
                }
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
    }

    if (geoBtn) {
        geoBtn.addEventListener('click', function () {
            requestBrowserLocation(geoBtn);
        });
    }

    var source = body ? body.dataset.locationSource : '';
    if (source === 'ip' || source === 'default') {
        requestBrowserLocation(null);
    }

    if (!searchForm || !searchInput || !searchResults) return;

    var searchTimer = 0;

    function clearResults() {
        searchResults.innerHTML = '';
        searchResults.hidden = true;
    }

    function pickResult(r) {
        clearResults();
        searchInput.value = r.label;
        navigateTo(r.lat, r.lon, r.label, 'search');
    }

    async function runSearch(q) {
        if (q.length < 2) {
            clearResults();
            return;
        }
        try {
            var url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name='
                + encodeURIComponent(q);
            var res = await fetch(url);
            if (!res.ok) return;
            var data = await res.json();
            var rows = data.results || [];
            searchResults.innerHTML = '';
            if (!rows.length) {
                searchResults.hidden = true;
                return;
            }
            rows.forEach(function (row) {
                var parts = [row.name];
                if (row.admin1) parts.push(row.admin1);
                if (row.country) parts.push(row.country);
                var label = parts.join(', ');
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = label;
                btn.addEventListener('click', function () {
                    pickResult({ lat: row.latitude, lon: row.longitude, label: label });
                });
                searchResults.appendChild(btn);
            });
            searchResults.hidden = false;
        } catch (e) { /* ignore */ }
    }

    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var q = searchInput.value.trim();
        searchTimer = setTimeout(function () { runSearch(q); }, 280);
    });

    searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        runSearch(searchInput.value.trim());
    });

    document.addEventListener('click', function (e) {
        if (!searchForm.contains(e.target)) clearResults();
    });
})();
