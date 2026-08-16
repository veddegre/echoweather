/**
 * Lakes Log — GPS, station search, and Echo handoff.
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
            button.textContent = 'Taking a fix…';
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                navigateTo(pos.coords.latitude, pos.coords.longitude, null, 'browser');
            },
            function () {
                if (button) {
                    button.disabled = false;
                    button.textContent = 'This vessel';
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
    var geoTimer = 0;
    if (source === 'ip' || source === 'default') {
        geoTimer = setTimeout(function () {
            requestBrowserLocation(null);
        }, 1200);
    }

    if (!searchForm || !searchInput || !searchResults) return;

    var searchTimer = 0;
    var searchSeq = 0;

    function clearResults() {
        searchResults.innerHTML = '';
        searchResults.hidden = true;
        searchResults.removeAttribute('data-status');
    }

    function showMessage(msg) {
        searchResults.innerHTML = '';
        var note = document.createElement('div');
        note.className = 'log-search-empty';
        note.textContent = msg;
        searchResults.appendChild(note);
        searchResults.hidden = false;
        searchResults.dataset.status = 'message';
    }

    function pickResult(r) {
        clearResults();
        searchInput.value = r.label;
        navigateTo(r.lat, r.lon, r.label, 'search');
    }

    function parseCoordinates(q) {
        var m = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*$/);
        if (!m) return null;
        var lat = parseFloat(m[1]);
        var lon = parseFloat(m[2]);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return {
            lat: lat,
            lon: lon,
            label: lat.toFixed(4) + ', ' + lon.toFixed(4)
        };
    }

    function renderResults(rows) {
        searchResults.innerHTML = '';
        rows.forEach(function (row) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = row.label;
            btn.addEventListener('click', function () {
                pickResult(row);
            });
            searchResults.appendChild(btn);
        });
        searchResults.hidden = false;
        searchResults.dataset.status = 'results';
    }

    async function fetchGeocode(q) {
        var urls = [
            'api/geocode.php?q=' + encodeURIComponent(q),
            'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(q)
        ];
        var lastErr = null;
        for (var i = 0; i < urls.length; i++) {
            try {
                var res = await fetch(urls[i]);
                if (!res.ok) {
                    lastErr = new Error('HTTP ' + res.status);
                    continue;
                }
                return await res.json();
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('unavailable');
    }

    async function runSearch(q) {
        if (q.length < 2) {
            clearResults();
            return;
        }

        var coords = parseCoordinates(q);
        if (coords) {
            renderResults([coords]);
            return;
        }

        var seq = ++searchSeq;
        searchResults.dataset.status = 'loading';
        searchResults.innerHTML = '<div class="log-search-empty">Searching the chart…</div>';
        searchResults.hidden = false;

        try {
            var data = await fetchGeocode(q);
            if (seq !== searchSeq) return;

            var rows = (data.results || []).map(function (row) {
                var parts = [row.name];
                if (row.admin1) parts.push(row.admin1);
                if (row.country) parts.push(row.country);
                return {
                    lat: row.latitude,
                    lon: row.longitude,
                    label: parts.join(', ')
                };
            });

            if (!rows.length) {
                showMessage('No matches — try a harbor town or enter coordinates as 42.97, -85.95');
                return;
            }

            renderResults(rows);
        } catch (e) {
            if (seq !== searchSeq) return;
            showMessage('Search unavailable — try coordinates as 42.97, -85.95');
        }
    }

    function pickFirstResult() {
        var first = searchResults.querySelector('button');
        if (first) {
            first.click();
            return true;
        }
        return false;
    }

    searchInput.addEventListener('focus', function () {
        if (geoTimer) {
            clearTimeout(geoTimer);
            geoTimer = 0;
        }
    });

    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var q = searchInput.value.trim();
        searchTimer = setTimeout(function () { runSearch(q); }, 280);
    });

    searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(searchTimer);
            var q = searchInput.value.trim();
            if (pickFirstResult()) return;
            runSearch(q).then(function () {
                pickFirstResult();
            });
        } else if (e.key === 'Escape') {
            clearResults();
            searchInput.blur();
        }
    });

    searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearTimeout(searchTimer);
        var q = searchInput.value.trim();
        if (pickFirstResult()) return;
        runSearch(q).then(function () {
            pickFirstResult();
        });
    });

    searchResults.addEventListener('mousedown', function (e) {
        if (e.target.closest('button')) {
            e.preventDefault();
        }
    });

    document.addEventListener('click', function (e) {
        if (!searchForm.contains(e.target)) clearResults();
    });
})();
