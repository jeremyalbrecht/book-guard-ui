<script lang="ts">
	import { m } from '$lib/i18n';

	interface Props {
		/** Fires once per distinct barcode; the parent decides what to do with it. */
		ondetect: (code: string) => void;
		/** Set false to release the camera (e.g. while a lookup is in flight). */
		active?: boolean;
	}

	let { ondetect, active = true }: Props = $props();

	// BarcodeDetector is not in TypeScript's DOM lib yet; this is the slice we use.
	interface DetectedBarcode {
		rawValue: string;
	}
	interface BarcodeDetectorLike {
		detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
	}
	type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

	const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

	let video = $state<HTMLVideoElement | null>(null);
	let error = $state<string | null>(null);
	let engine = $state<'native' | 'fallback' | null>(null);

	let stream: MediaStream | null = null;
	let frame = 0;
	let stopFallback: (() => void) | null = null;
	let lastCode = '';
	let lastAt = 0;
	let tap = $state<{ x: number; y: number } | null>(null);
	let tapTimer: ReturnType<typeof setTimeout> | undefined;

	function emit(code: string) {
		const now = Date.now();
		// The same barcode stays in frame for many frames — report it once.
		if (code === lastCode && now - lastAt < 2500) return;
		lastCode = code;
		lastAt = now;
		ondetect(code);
	}

	function nativeDetector(): BarcodeDetectorLike | null {
		const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
		if (!ctor) return null;
		try {
			return new ctor({ formats: FORMATS });
		} catch {
			return null;
		}
	}

	async function runNative(el: HTMLVideoElement, detector: BarcodeDetectorLike) {
		engine = 'native';
		const tick = async () => {
			if (!stream) return;
			try {
				const [found] = await detector.detect(el);
				if (found?.rawValue) emit(found.rawValue);
			} catch {
				// A dropped frame is not worth surfacing; the next one will do.
			}
			frame = requestAnimationFrame(() => void tick());
		};
		frame = requestAnimationFrame(() => void tick());
	}

	/** iOS Safari has no BarcodeDetector, so ZXing is loaded on demand there. */
	async function runFallback(el: HTMLVideoElement) {
		engine = 'fallback';
		const { BrowserMultiFormatReader } = await import('@zxing/browser');
		if (!stream) return;
		const reader = new BrowserMultiFormatReader();
		const controls = reader.decodeFromVideoElement(el, (result) => {
			if (result) emit(result.getText());
		});
		stopFallback = () => void controls.then((c) => c.stop()).catch(() => {});
	}

	async function start(el: HTMLVideoElement) {
		error = null;
		if (!globalThis.isSecureContext) {
			error = m.scan_camera_insecure();
			return;
		}
		if (!navigator.mediaDevices?.getUserMedia) {
			error = m.scan_camera_unsupported();
			return;
		}

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
		} catch (cause) {
			const name = cause instanceof DOMException ? cause.name : '';
			error =
				name === 'NotAllowedError'
					? m.scan_camera_denied()
					: name === 'NotFoundError'
						? m.scan_camera_missing()
						: m.scan_camera_failed();
			return;
		}

		el.srcObject = stream;
		try {
			await el.play();
		} catch {
			// Autoplay was blocked; the poster frame stays and the manual field still works.
		}

		const detector = nativeDetector();
		if (detector) await runNative(el, detector);
		else await runFallback(el);
	}

	function stop() {
		cancelAnimationFrame(frame);
		stopFallback?.();
		stopFallback = null;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		engine = null;
		if (video) video.srcObject = null;
	}

	let refocusing = false;

	/**
	 * There is no cross-browser way to drive camera focus from JS.
	 * Chromium exposes pointsOfInterest/focusMode (non-standard); Safari on
	 * iOS exposes nothing at all. The one lever that works everywhere is
	 * restarting the capture session — AVFoundation (and most other camera
	 * stacks) re-run their initial autofocus sweep on a fresh getUserMedia
	 * call, which is the closest thing to a manual refocus iOS allows.
	 */
	async function focusAt(clientX: number, clientY: number, el: HTMLElement) {
		const rect = el.getBoundingClientRect();
		tap = { x: clientX - rect.left, y: clientY - rect.top };
		clearTimeout(tapTimer);
		tapTimer = setTimeout(() => (tap = null), 600);

		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		const capabilities = track.getCapabilities?.() as
			| (MediaTrackCapabilities & { focusMode?: string[] })
			| undefined;

		if (capabilities?.focusMode?.includes('single-shot')) {
			const x = (clientX - rect.left) / rect.width;
			const y = (clientY - rect.top) / rect.height;
			try {
				await track.applyConstraints({
					advanced: [
						{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] } as MediaTrackConstraintSet
					]
				});
			} catch {
				// Focus tap is a nice-to-have; a rejected constraint isn't worth surfacing.
			}
			return;
		}

		if (refocusing || !video) return;
		refocusing = true;
		stop();
		await start(video);
		refocusing = false;
	}

	$effect(() => {
		const el = video;
		if (!el || !active) {
			stop();
			return;
		}
		void start(el);
		return stop;
	});
</script>

<div
	class="viewfinder"
	role="button"
	tabindex="-1"
	onpointerdown={(e) => focusAt(e.clientX, e.clientY, e.currentTarget)}
>
	<!-- Live camera preview: no audio track, so no captions to provide. -->
	<video bind:this={video} playsinline muted autoplay></video>

	<div class="reticle" aria-hidden="true"></div>

	{#if tap}
		<div class="focus-ring" style:left="{tap.x}px" style:top="{tap.y}px" aria-hidden="true"></div>
	{/if}

	{#if error}
		<p class="error" role="alert">{error}</p>
	{:else}
		<p class="hint" aria-live="polite">
			{active ? m.scan_hint() : m.scan_paused()}
		</p>
	{/if}

	{#if engine === 'fallback'}
		<p class="engine">{m.scan_engine_fallback()}</p>
	{/if}
</div>

<style>
	.viewfinder {
		position: relative;
		aspect-ratio: 4 / 3;
		width: 100%;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: #16130f;
		cursor: pointer;
		touch-action: manipulation;
	}

	.focus-ring {
		position: absolute;
		width: 64px;
		height: 64px;
		margin-left: -32px;
		margin-top: -32px;
		border: 2px solid rgb(243 236 221 / 0.9);
		border-radius: 50%;
		pointer-events: none;
		animation: focus-pulse 0.6s ease-out forwards;
	}

	@keyframes focus-pulse {
		from {
			transform: scale(1.4);
			opacity: 1;
		}
		to {
			transform: scale(1);
			opacity: 0;
		}
	}

	video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Frames the barcode without covering it. */
	.reticle {
		position: absolute;
		inset: 22% 12%;
		border: 2px solid rgb(243 236 221 / 0.75);
		border-radius: var(--radius-md);
		box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.35);
	}

	.hint,
	.error,
	.engine {
		position: absolute;
		inset-inline: var(--space-3);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background: rgb(0 0 0 / 0.6);
		color: #f3ecdd;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-align: center;
	}

	.hint,
	.error {
		inset-block-end: var(--space-3);
	}

	.error {
		background: var(--wine-strong);
		text-transform: none;
		letter-spacing: 0.02em;
		font-size: 0.8125rem;
	}

	.engine {
		inset-block-start: var(--space-3);
		inset-inline-start: auto;
		opacity: 0.7;
	}
</style>
