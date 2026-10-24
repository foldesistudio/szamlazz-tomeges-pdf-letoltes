// ==UserScript==
// @name         Számlázz.hu – Ingyenes számlaklónózás
// @namespace    szamlazz-ingyen-klonozas
// @version      2026-10-24
// @description  Tétel, vevő és megjegyzés átmásolása új számlára
// @author       Földesi Mihály
// @match        https://www.szamlazz.hu/app/szamlareszletek/ki/*
// @match        https://www.szamlazz.hu/szamla/szamlaszerkeszto
// @icon         https://www.google.com/s2/favicons?sz=64&domain=szamlazz.hu
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @run-at       document-end
// ==/UserScript==

(function() {
	'use strict';

	const ROUTE_CLASS_PREFIX = 'foldesistudio-';
	const ROUTE_CLASS_FALLBACK = 'unknown';
	const SPACER_SELECTOR = `.${ROUTE_CLASS_PREFIX}app-szamlareszletek .ndk2-page-header-left`; // position of the clone button
	const BUTTON_ARIA = 'Új számlára másolása gomb';
	const BUTTON_TEXT = 'Számla ingyenes klónozása';
	const CREATE_URL = 'https://www.szamlazz.hu/szamla/szamlaszerkeszto';
	const NOTIF_ICON_URL = 'https://www.google.com/s2/favicons?sz=64&domain=szamlazz.hu';
	const iconSvg = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
		<path fill-rule="evenodd" clip-rule="evenodd" d="M4 9.5H2.5v-7h7V4H11V2a1 1 0 00-1-1H2a1 1 0 00-1 1v8a1 1 0 001 1h2V9.5zm9.5 4h-7v-7h7v7zM5 6a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1V6z"></path>
		</svg>`;

	function pathnameToBodyClass(pathname) {
		// Example:
		//   /app/szamlareszletek/ki/856923429  ->  misi-page-app-szamlareszletek
		// We only keep the first 2 segments to avoid IDs and deep routes.
		const segments = String(pathname || '/')
			.toLowerCase()
			.split('?')[0]
			.split('#')[0]
			.split('/')
			.filter(Boolean)
			.slice(0, 2)
			.map(s => s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
			.filter(Boolean);

		const slug = segments.join('-').slice(0, 80);
		return ROUTE_CLASS_PREFIX + (slug || ROUTE_CLASS_FALLBACK);
	}

	function syncBodyRouteClass() {
		const body = document.body;
		if (!body) return;

		for (const cls of Array.from(body.classList)) {
			if (cls.startsWith(ROUTE_CLASS_PREFIX)) {
				body.classList.remove(cls);
			}
		}

		body.classList.add(pathnameToBodyClass(window.location.pathname));
	}

	function buildButton(onClick) {
		const btn = document.createElement('button');
		btn.className = `ndk2-button ndk2-button-secondary ndk2-button-size-s ${ROUTE_CLASS_PREFIX}szamlazz-klon-gomb`;
		btn.setAttribute('ndk2-button', '');
		btn.setAttribute('ndk2tooltip', '');
		btn.setAttribute('variant', 'secondary');
		btn.setAttribute('size', 's');
		btn.setAttribute('aria-label', BUTTON_ARIA);
		btn.setAttribute('style', 'order: 2;');

		const icon = document.createElement('ndk2-icon');
		icon.className = 'ndk2-icon ndk2-icon-color-inherit ndk2-icon-size-s';
		icon.setAttribute('color', 'inherit');
		icon.innerHTML = iconSvg.trim();

		const text = document.createElement('span');
		text.className = 'ndk2-button-text';
		text.textContent = BUTTON_TEXT;

		btn.appendChild(icon);
		btn.appendChild(text);
		btn.addEventListener('click', onClick);
		return btn;
	}

	function resolveSpacer() {
		return document.querySelector(SPACER_SELECTOR);
	}

	function installRouteClassSync() {
		syncBodyRouteClass();

		let lastPath = window.location.pathname;
		setInterval(() => {
			if (window.location.pathname !== lastPath) {
				lastPath = window.location.pathname;
				syncBodyRouteClass();
			}
		}, 300);

		window.addEventListener('popstate', syncBodyRouteClass);
		window.addEventListener('hashchange', syncBodyRouteClass);
	}

	function watchElement(target, callback, options) {
		if (typeof target === 'string') {
			const el = document.querySelector(target);
			if (el) return callback(el);

			const observer = new MutationObserver(() => {
				const found = document.querySelector(target);
				if (!found) return;
				observer.disconnect();
				callback(found);
			});

			observer.observe(document.body, { childList: true, subtree: true });
			return observer;
		}

		if (!target) return null;
		const observer = new MutationObserver(() => callback(target));
		observer.observe(target, options || { childList: true, subtree: true });
		return observer;
	}

	// -----------------------------
	// 1) SZÁMLA RÉSZLETEI OLDAL
	// -----------------------------
	if (window.location.pathname.includes('/app/szamlareszletek/')) {
		installRouteClassSync();

		watchElement(SPACER_SELECTOR, () => {
			const spacer = resolveSpacer();
			const container = spacer?.parentElement || spacer;
			if (!container) return;
			if (container.querySelector('[aria-label="' + BUTTON_ARIA + '"]')) return;

			const btn = buildButton(() => {

				// --- TETEL ADATOK ---
				const row = document.querySelector('tr.ng-star-inserted');
				if (!row) {
					alert('Nincs másolandó adat, evégett meg kell nyitni a Számlaadat fület!');
					return;
				}

				const item = row.querySelector('.szamlaadat-print__cell-title')?.innerText.trim() || '';
				const mennyRaw = row.querySelector('td:nth-child(2)')?.innerText.trim() || '';
				const nettEgysArRaw = row.querySelector('td:nth-child(3).szamlaadat-print__number')?.innerText.trim() || '';
				const mennyParts = mennyRaw.split(' ');
				const menny = mennyParts[0] || '';
				const meEgys = mennyParts[1] || '';
				const nettEgysAr = nettEgysArRaw.replace(/\D/g, '');

				// --- VEVO (flex-box + badge = Vevo) ---
				const partnerName = [...document.querySelectorAll('ndk2-flex-box')]
					.find(box => box.innerText.includes('Vevő'))
					?.querySelector('ndk2-body-text[weight="bold"] .ndk2-body-text-text')
					?.innerText.trim() || '';

				// --- MEGJEGYZES (Szamlamegjegyzes blokk, teljes szoveg) ---
				const desc = [...document.querySelectorAll('ndk2-text-block')]
					.find(block => block.innerText.includes('Számlamegjegyzés'))
					?.querySelectorAll('ndk2-body-text .ndk2-body-text-text')[1]
					?.innerText.trim() || '';

				const adatok = { item, menny, meEgys, nettEgysAr, partnerName, desc };

				GM_notification({
					title: "Számla klónozva!",
					text: `Vevő: ${adatok.partnerName}\nÖsszeg: ${adatok.nettEgysAr} Ft`,
					image: NOTIF_ICON_URL,
					timeout: 8000
				});

				//alert('Kimasolt adatok:\n\n' + JSON.stringify(adatok, null, 2));
				console.log('Kimasolt adatok:', adatok);

				GM_setValue('adatok', adatok);
				window.open(CREATE_URL, '_blank');
			});

			if (spacer && spacer.parentElement) {
				spacer.parentElement.insertBefore(btn, spacer);
			} else {
				container.appendChild(btn);
			}
		});
	}

	// -----------------------------
	// 2) ÚJ SZÁMLA OLDAL
	// -----------------------------
	if (window.location.pathname.includes('/szamla/szamlaszerkeszto')) {

		const adatok = GM_getValue('adatok');
		if (!adatok) return;

		watchElement('#item_1', () => {

			// --- PARTNER KITÖLTÉSE ---
			const partner = document.querySelector('#partnername');
			if (partner) {
				partner.value = adatok.partnerName;
				partner.dispatchEvent(new Event('input'));
			}

			// --- TÉTEL MEZŐK ---
			document.querySelector('#item_1').value = adatok.item;
			document.querySelector('#menny_1').value = adatok.menny;
			document.querySelector('#meegys_1').value = adatok.meEgys;
			document.querySelector('#nettegysar_1').value = adatok.nettEgysAr;

			['#item_1', '#menny_1', '#meegys_1', '#nettegysar_1'].forEach(sel => {
				const el = document.querySelector(sel);
				if (el) el.dispatchEvent(new Event('input'));
			});

			// --- MEGJEGYZÉS KITÖLTÉSE ---
			const megj = document.querySelector('#megjegyzes');
			if (megj) {
				// 1. Első próbálkozás (azonnal)
				megj.value = adatok.desc;
				megj.dispatchEvent(new Event('input', { bubbles: true }));

				// 2. Ha a #cegbox változik (megjelenik), tegyük vissza az adatot
				const cegbox = document.querySelector('#cegbox');
				if (cegbox) {
					watchElement(cegbox, () => {
						if (cegbox.style.display === 'block' && megj.value === '') {
							megj.value = adatok.desc;
							megj.dispatchEvent(new Event('input', { bubbles: true }));
						}
					}, { attributes: true, attributeFilter: ['style'] });
				}
			}
			setTimeout(() => GM_deleteValue('adatok'), 1000);
		});
	}
})();
