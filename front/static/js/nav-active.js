/**
 * Модуль для автоматического определения активного пункта навигации.
 *
 * Использует data-атрибуты для сопоставления URL с пунктами меню:
 * - data-nav-match: регулярное выражение для проверки pathname
 *
 * Преимущества подхода:
 * - Логика отделена от разметки (конфигурация через data-атрибуты)
 * - Масштабируется: добавление новых пунктов не требует изменения JS
 * - Работает при навигации через History API (pushState/popState)
 */

(function initNavActive() {
    'use strict';

    const NAV_SELECTOR = '#mainNav .nav-link[data-nav-match]';
    const ACTIVE_CLASS = 'active';

    /**
     * Обновляет активное состояние навигации на основе текущего URL
     */
    function updateActiveNav() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll(NAV_SELECTOR);

        navLinks.forEach(link => {
            const pattern = link.getAttribute('data-nav-match');
            if (!pattern) return;

            try {
                const regex = new RegExp(pattern);
                const isActive = regex.test(currentPath);

                link.classList.toggle(ACTIVE_CLASS, isActive);

                // Обновляем ARIA-атрибут для доступности
                if (isActive) {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            } catch (e) {
                console.warn(`Invalid nav pattern: ${pattern}`, e);
            }
        });
    }

    // Инициализация при загрузке DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateActiveNav);
    } else {
        updateActiveNav();
    }

    // Поддержка навигации через History API (SPA-like переходы)
    window.addEventListener('popstate', updateActiveNav);

    // Перехватываем pushState/replaceState для SPA-сценариев
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        updateActiveNav();
    };

    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        updateActiveNav();
    };

    // Экспортируем функцию для ручного вызова (если потребуется)
    window.updateNavActive = updateActiveNav;
})();
