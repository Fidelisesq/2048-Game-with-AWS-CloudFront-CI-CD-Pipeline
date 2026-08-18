(() => {
    'use strict';

    const consentKey = '2048-analytics-consent';
    const measurementId = 'G-819F6L1LMC';

    function enableAnalytics() {
        if (window.gtag) return;

        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag() {
            window.dataLayer.push(arguments);
        };
        window.gtag('js', new Date());
        window.gtag('config', measurementId, {
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
        });

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
        document.head.appendChild(script);
    }

    function showConsentBanner() {
        const banner = document.createElement('section');
        banner.className = 'consent-banner';
        banner.setAttribute('aria-label', 'Analytics preference');

        const message = document.createElement('p');
        message.textContent = 'Allow privacy-conscious analytics to help improve the game? No advertising or score data is sent.';

        const actions = document.createElement('div');
        actions.className = 'consent-actions';

        const decline = document.createElement('button');
        decline.type = 'button';
        decline.className = 'secondary-button';
        decline.textContent = 'Decline';

        const allow = document.createElement('button');
        allow.type = 'button';
        allow.textContent = 'Allow analytics';

        decline.addEventListener('click', () => {
            localStorage.setItem(consentKey, 'denied');
            banner.remove();
        });
        allow.addEventListener('click', () => {
            localStorage.setItem(consentKey, 'granted');
            enableAnalytics();
            banner.remove();
        });

        actions.append(decline, allow);
        banner.append(message, actions);
        document.body.appendChild(banner);
    }

    const consent = localStorage.getItem(consentKey);
    if (consent === 'granted') {
        enableAnalytics();
    } else if (consent !== 'denied' && navigator.doNotTrack !== '1') {
        window.addEventListener('DOMContentLoaded', showConsentBanner, { once: true });
    }
})();
