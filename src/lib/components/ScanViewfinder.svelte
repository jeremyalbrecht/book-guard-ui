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

	/** Longest edge, in pixels, that the cropped reticle region is upscaled to before decoding. */
	const DECODE_TARGET = 900;

	interface ZXingResult {
		getText(): string;
	}
	interface ZXingReaderLike {
		decodeFromCanvas(canvas: HTMLCanvasElement): ZXingResult;
	}

	let video = $state<HTMLVideoElement | null>(null);
	let reticle = $state<HTMLDivElement | null>(null);
	let error = $state<string | null>(null);
	let engine = $state<'native' | 'fallback' | null>(null);

	let stream: MediaStream | null = null;
	let frame = 0;
	let canvas: HTMLCanvasElement | null = null;
	let ctx: CanvasRenderingContext2D | null = null;
	let zxingReader: ZXingReaderLike | null = null;
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

	/**
	 * Maps the reticle's on-screen box to a pixel rect in the raw video
	 * frame, undoing the object-fit: cover crop/scale, then reports how
	 * large a canvas to draw it into so the decoder sees a magnified image
	 * instead of a tiny fraction of the full frame. This is what lets a
	 * barcode be decoded from a comfortable (well-focused) distance, and
	 * what lets physically small barcodes be read at all.
	 */
	function cropRegion(el: HTMLVideoElement, box: HTMLDivElement) {
		const videoRect = el.getBoundingClientRect();
		const boxRect = box.getBoundingClientRect();
		const vw = el.videoWidth;
		const vh = el.videoHeight;
		if (!videoRect.width || !videoRect.height || !vw || !vh) return null;

		const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
		const offsetX = (vw * scale - videoRect.width) / 2;
		const offsetY = (vh * scale - videoRect.height) / 2;

		let sx = (boxRect.left - videoRect.left + offsetX) / scale;
		let sy = (boxRect.top - videoRect.top + offsetY) / scale;
		let sw = boxRect.width / scale;
		let sh = boxRect.height / scale;

		sx = Math.max(0, sx);
		sy = Math.max(0, sy);
		sw = Math.min(sw, vw - sx);
		sh = Math.min(sh, vh - sy);
		if (sw <= 0 || sh <= 0) return null;

		const upscale = Math.min(4, Math.max(1, DECODE_TARGET / Math.max(sw, sh)));
		return { sx, sy, sw, sh, cw: Math.round(sw * upscale), ch: Math.round(sh * upscale) };
	}

	async function tick(detector: BarcodeDetectorLike | null) {
		if (!stream || !video || !reticle || !ctx || !canvas) return;
		const region = cropRegion(video, reticle);
		if (region) {
			canvas.width = region.cw;
			canvas.height = region.ch;
			ctx.drawImage(video, region.sx, region.sy, region.sw, region.sh, 0, 0, region.cw, region.ch);
			try {
				if (detector) {
					const [found] = await detector.detect(canvas);
					if (found?.rawValue) emit(found.rawValue);
				} else if (zxingReader) {
					emit(zxingReader.decodeFromCanvas(canvas).getText());
				}
			} catch {
				// No barcode in this frame — the common case, not worth surfacing.
			}
		}
		frame = requestAnimationFrame(() => void tick(detector));
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
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 1920 },
					height: { ideal: 1080 }
				},
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

		canvas = document.createElement('canvas');
		ctx = canvas.getContext('2d', { willReadFrequently: true });

		const detector = nativeDetector();
		/** iOS Safari has no BarcodeDetector, so ZXing is loaded on demand there. */
		if (detector) {
			engine = 'native';
		} else {
			engine = 'fallback';
			const { BrowserMultiFormatReader } = await import('@zxing/browser');
			zxingReader = new BrowserMultiFormatReader();
		}
		frame = requestAnimationFrame(() => void tick(detector));
	}

	function stop() {
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		engine = null;
		zxingReader = null;
		canvas = null;
		ctx = null;
		if (video) video.srcObject = null;
	}

	let refocusing = false;

	/**
	 * Chromium exposes pointsOfInterest/focusMode (non-standard) to nudge
	 * focus at a point. Safari on iOS exposes no focus API at all, and
	 * restarting the capture session does not reliably reset the lens
	 * either — WebKit just doesn't give JS a lever here. Restarting is
	 * still attempted as a best-effort fallback, but the reticle crop
	 * above is what actually removes the need to focus at macro range.
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

	<div class="reticle" bind:this={reticle} aria-hidden="true"></div>

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
