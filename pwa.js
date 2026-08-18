(() => {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                worker?.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        globalThis.game?.showToast('An updated version is ready. Refresh when convenient.');
                    }
                });
            });
        } catch (error) {
            console.warn('Offline support could not be enabled:', error);
        }
    });
})();
