import { browser } from '$app/environment';

/**
 * Live connectivity state. `navigator.onLine` is only ever read once at start —
 * after that the `online`/`offline` events keep it current, so the UI reacts to
 * losing the network mid-session instead of trusting a stale snapshot.
 */
class OnlineState {
	#online = $state(true);

	constructor() {
		if (!browser) return;
		this.#online = navigator.onLine;
		addEventListener('online', () => (this.#online = true));
		addEventListener('offline', () => (this.#online = false));
	}

	get current(): boolean {
		return this.#online;
	}
}

export const online = new OnlineState();
