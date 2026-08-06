(function () {
    'use strict';

    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const counter = document.getElementById('slide-counter');
    const total = slides.length;
    let current = 0;

    function showSlide(index) {
        if (index < 0 || index >= total) return;

        slides[current].classList.remove('active');
        current = index;
        slides[current].classList.add('active');

        counter.textContent = (current + 1) + ' / ' + total;
        prevBtn.disabled = current === 0;
        nextBtn.disabled = current === total - 1;

        history.replaceState(null, '', '#slide-' + (current + 1));
    }

    prevBtn.addEventListener('click', function () {
        showSlide(current - 1);
    });

    nextBtn.addEventListener('click', function () {
        showSlide(current + 1);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
            e.preventDefault();
            showSlide(current + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault();
            showSlide(current - 1);
        } else if (e.key === 'Home') {
            showSlide(0);
        } else if (e.key === 'End') {
            showSlide(total - 1);
        }
    });

    // Touch swipe support
    let touchStartX = 0;
    document.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
            showSlide(diff > 0 ? current + 1 : current - 1);
        }
    }, { passive: true });

    // Deep link support
    const hash = window.location.hash.match(/slide-(\d+)/);
    if (hash) {
        const idx = parseInt(hash[1], 10) - 1;
        if (idx >= 0 && idx < total) {
            current = idx;
            slides.forEach(function (s, i) {
                s.classList.toggle('active', i === current);
            });
        }
    }

    showSlide(current);
})();
