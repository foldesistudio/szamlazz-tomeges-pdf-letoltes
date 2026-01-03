// ==UserScript==
// @name         Szamlazz.hu - PDF tömeges letöltés gomb
// @namespace	 szamlazz-ingyen-letoltes
// @version      1.0
// @description  Ingyen letöltés gomb hozzáadása a számlalista fejléchez a #free szolgáltatáscsomagnál
// @author       Földesi Mihály
// @match        https://www.szamlazz.hu/app/szamlalista/ki
// @icon         https://www.google.com/s2/favicons?sz=64&domain=szamlazz.hu
// @license      Attribution 4.0 International (CC BY 4.0 - https://creativecommons.org/licenses/by/4.0/)
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	// Configuration constants
	const TARGET_SELECTOR = '#cdk-drop-list-0 > div.ndk2-table-flex-row.ndk2-table-header-row.ng-star-inserted > ndk2-table-header-cell:nth-child(2)';
	const BUTTON_TEXT = ' Ingyen letöltés';
	const BUTTON_ARIA = 'Ingyen letöltés gomb';
	const SPACER_SELECTOR = 'ndk2-table-header-grid-item ndk2-spacer.ndk2-spacer-variant-s-fill';
	const SCROLL_ROOT_SELECTOR = 'cdk-virtual-scroll-viewport, #cdk-drop-list-0';
	const CLICK_DELAY_MS = 3000;
	const DROPDOWN_DELAY_MS = 1000;
	const OP_BTN_REGEX = /szamla-lista-(\d+)-operations-button-icon-svg/;
	const DROPDOWN_TPL = (id) => `szamla-lista-${id}-operations-dropdown-icon-2`;
	const DROPDOWN_ANY_REGEX = /szamla-lista-\d+-operations-dropdown-icon-2/;
	const ALERT_MESSAGE = 'Hamarosan {count} db bizonylat PDF-et fog letölteni. Kérjük, ne használja a böngészőt a folyamat során!';

	// Find the scrollable container for the invoice table
	function findScrollContainer() {
		const candidates = Array.from(document.querySelectorAll(SCROLL_ROOT_SELECTOR));
		for (const el of candidates) {
			if (el && el.scrollHeight > el.clientHeight + 5) return el;
			const parent = el?.parentElement;
			if (parent && parent.scrollHeight > parent.clientHeight + 5) return parent;
		}
		return document.scrollingElement || document.documentElement;
	}

	// Scroll to bottom and back to force rendering of all virtualized rows
	async function scrollToBottomAndBack(container) {
		const originalTop = container.scrollTop;
		container.scrollTop = container.scrollHeight;
		await new Promise(r => setTimeout(r, 60));
		container.scrollTop = originalTop;
		await new Promise(r => setTimeout(r, 40));
	}

	const iconSvg = `
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M11.78 7.159a.75.75 0 00-1.06 0l-1.97 1.97V1.75a.75.75 0 00-1.5 0v7.379l-1.97-1.97a.75.75 0 00-1.06 1.06l3.25 3.25L8 12l.53-.53 3.25-3.25a.75.75 0 000-1.061zM2.5 9.75a.75.75 0 00-1.5 0V13a2 2 0 002 2h10a2 2 0 002-2V9.75a.75.75 0 00-1.5 0V13a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V9.75z"></path>
    </svg>
  `;

	// Helper: delay execution
	const delay = (ms) => new Promise(r => setTimeout(r, ms));

	// Helper: wait for a condition to be truthy
	const waitFor = async (fn, timeout = 2000, step = 80) => {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const v = fn();
			if (v) return v;
			await delay(step);
		}
		return null;
	};

	// Wait for and click the dropdown menu item for a specific invoice ID; fallback to any visible option
	async function clickDropdownForId(id) {
		const targetId = DROPDOWN_TPL(id);
		const dropdown = await waitFor(() =>
			document.querySelector(`.cdk-overlay-pane [data-testid="${targetId}"]`)
		);
		if (dropdown) {
			await delay(DROPDOWN_DELAY_MS);
			(dropdown.closest('button') || dropdown).click();
			console.log('[Free Download] Dropdown clicked:', targetId);
			return true;
		}

		console.warn('[Free Download] Dropdown element not found, trying fallback:', targetId);
		const fallback = await waitFor(() => {
			const all = Array.from(document.querySelectorAll('.cdk-overlay-pane [data-testid]'));
			return all.find(el => DROPDOWN_ANY_REGEX.test(el.getAttribute('data-testid') || ''));
		});
		if (!fallback) {
			console.warn('[Free Download] No fallback dropdown option found');
			return false;
		}
		await delay(DROPDOWN_DELAY_MS);
		(fallback.closest('button') || fallback).click();
		console.log('[Free Download] Fallback dropdown clicked:', fallback.getAttribute('data-testid'));
		return true;
	}

	// Click the operations button and then the dropdown item to trigger PDF download
	async function handleOperationClick(opEl) {
		const testId = opEl.getAttribute('data-testid') || '';
		const match = testId.match(OP_BTN_REGEX);
		if (!match) return;
		const id = match[1];
		// Click operations menu button
		(opEl.closest('button') || opEl).click();
		console.log('[Free Download] Opening operations menu:', testId);
		// Wait for dropdown and click download option
		await clickDropdownForId(id);
	}

	// Collect all operation buttons from selected/active rows
	function collectOperationButtons() {
		return Array.from(document.querySelectorAll('.ndk2-table-body-cell-active [data-testid]'))
			.filter(el => OP_BTN_REGEX.test(el.getAttribute('data-testid') || ''));
	}

	// Click each button sequentially with delays between clicks
	async function clickButtonsSequentially(buttons) {
		for (const btn of buttons) {
			await handleOperationClick(btn);
			await delay(CLICK_DELAY_MS);
		}
	}

	// Build the custom download button with matching styles
	function buildButton() {
		const btn = document.createElement('button');
		btn.setAttribute('ndk2-button', '');
		btn.setAttribute('variant', 'secondary');
		btn.setAttribute('size', 's');
		btn.className = 'ndk2-button ndk2-button-secondary ndk2-button-size-s misi-szamlazz-letoltes-gomb';
		btn.setAttribute('aria-label', BUTTON_ARIA);

		const icon = document.createElement('ndk2-icon');
		icon.className = 'ndk2-icon ndk2-icon-color-inherit ndk2-icon-size-s';
		icon.setAttribute('color', 'inherit');
		icon.innerHTML = iconSvg.trim();

		const text = document.createElement('span');
		text.className = 'ndk2-button-text';
		text.textContent = BUTTON_TEXT;

		btn.appendChild(icon);
		btn.appendChild(text);

		// Main click handler: scroll, count, alert, and trigger downloads
		btn.addEventListener('click', async () => {
			console.log('[Free Download] Button clicked, starting process...');

			// Force render all virtualized rows by scrolling
			const container = findScrollContainer();
			if (container) {
				console.log('[Free Download] Scrolling to reveal all rows...');
				await scrollToBottomAndBack(container);
			}

			// Collect all operation buttons from active rows
			const targets = collectOperationButtons();
			console.log('[Free Download] Found', targets.length, 'selected invoices');

			// Confirm with user
			alert(ALERT_MESSAGE.replace('{count}', targets.length));

			// Trigger sequential downloads
			if (targets.length) {
				console.log('[Free Download] Starting sequential download clicks...');
				await clickButtonsSequentially(targets);
				console.log('[Free Download] All download triggers completed');
			} else {
				console.log('[Free Download] No invoices to download');
			}
		});

		return btn;
	}

	// Try to inject the button into the DOM
	function tryInject() {
		const spacer = document.querySelector(SPACER_SELECTOR);
		const host = spacer?.parentElement;
		if (!host) return false;

		// Check if button already exists
		if (host.querySelector('[aria-label="' + BUTTON_ARIA + '"]')) return true;

		// Inject the button before the spacer
		const newBtn = buildButton();
		host.insertBefore(newBtn, spacer);
		console.log('[Free Download] Button injected successfully');
		return true;
	}

	// Poll until injection succeeds
	console.log('[Free Download] Script loaded, waiting for injection point...');
	const interval = setInterval(() => {
		if (tryInject()) {
			clearInterval(interval);
		}
	}, 500);

})();
