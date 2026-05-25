import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { init } from 'pptx-preview';
import {
	Download,
	Loader2,
	Maximize2,
	Minimize2,
	MonitorPlay,
	Pause,
	Presentation,
	RotateCcw,
	SkipBack,
	SkipForward,
	ZoomIn,
	ZoomOut,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';

interface PptxPreviewAndEditorProps {
	url: string;
	path: string;
	onDownload: () => void;
	setLoading: (v: boolean) => void;
	setError: (v: string | null) => void;
}

type PptxPreviewerInstance = {
	preview: (file: ArrayBuffer) => Promise<unknown>;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const POWERPOINT_ORANGE = '#B6472B';

export function PptxPreviewAndEditor({
	url,
	path,
	onDownload,
	setLoading,
	setError,
}: PptxPreviewAndEditorProps) {
	const shellRef = useRef<HTMLDivElement | null>(null);
	const previewAreaRef = useRef<HTMLDivElement | null>(null);
	const mountRef = useRef<HTMLDivElement | null>(null);
	const previewerRef = useRef<PptxPreviewerInstance | null>(null);
	const laserHideTimerRef = useRef<number | null>(null);

	const [isRendering, setIsRendering] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [slideCount, setSlideCount] = useState(0);
	const [currentSlide, setCurrentSlide] = useState(0);
	const [isSlideshow, setIsSlideshow] = useState(false);
	const [isSectionFullscreen, setIsSectionFullscreen] = useState(false);
	const [slideshowScale, setSlideshowScale] = useState(1);
	const [laserPointer, setLaserPointer] = useState({ x: 0, y: 0, visible: false });

	const fileName = useMemo(() => path.split('/').pop() || 'presentation.pptx', [path]);

	const getWrapper = useCallback(() => {
		if (!mountRef.current) return null;
		return mountRef.current.querySelector<HTMLElement>('.pptx-preview-wrapper');
	}, []);

	const getSlides = useCallback(() => {
		if (!mountRef.current) return [];
		return Array.from(mountRef.current.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper'));
	}, []);

	const waitForSlides = useCallback((timeoutMs = 12000) => {
		return new Promise<number>((resolve) => {
			const existing = getSlides().length;
			if (existing > 0) {
				resolve(existing);
				return;
			}

			if (!mountRef.current) {
				resolve(0);
				return;
			}

			let settled = false;
			const settle = (count: number) => {
				if (settled) return;
				settled = true;
				observer.disconnect();
				window.clearTimeout(timer);
				resolve(count);
			};

			const observer = new MutationObserver(() => {
				const count = getSlides().length;
				if (count > 0) settle(count);
			});

			observer.observe(mountRef.current, { childList: true, subtree: true });
			const timer = window.setTimeout(() => settle(getSlides().length), timeoutMs);
		});
	}, [getSlides]);

	const applySlideMode = useCallback((slideshow: boolean, activeIndex: number) => {
		const slides = getSlides();
		slides.forEach((slide, index) => {
			const isActive = index === activeIndex;
			slide.style.display = slideshow ? (isActive ? 'block' : 'none') : 'block';
			slide.style.margin = slideshow ? '0 auto' : '0 auto 10px';
			slide.style.boxShadow = slideshow
				? '0 24px 60px rgba(0, 0, 0, 0.35)'
				: '0 10px 24px rgba(0, 0, 0, 0.14)';
			slide.style.borderRadius = slideshow ? '6px' : '4px';
		});
	}, [getSlides]);

	const applyNormalZoom = useCallback((nextZoom: number) => {
		setZoom(nextZoom);
		if (isSlideshow) return;

		const wrapper = getWrapper();
		if (!wrapper) return;

		wrapper.style.transform = `scale(${nextZoom})`;
		wrapper.style.transformOrigin = 'top center';
		wrapper.style.margin = '0 auto';
	}, [getWrapper, isSlideshow]);

	const fitSlideshowToViewport = useCallback(() => {
		if (!isSlideshow || !previewAreaRef.current) return;

		const wrapper = getWrapper();
		const slides = getSlides();
		const active = slides[currentSlide];
		if (!wrapper || !active) return;

		const availableWidth = Math.max(previewAreaRef.current.clientWidth - 24, 1);
		const availableHeight = Math.max(previewAreaRef.current.clientHeight - 24, 1);
		const slideWidth = Math.max(active.offsetWidth, 1);
		const slideHeight = Math.max(active.offsetHeight, 1);

		const fittedScale = Math.max(0.1, Math.min(availableWidth / slideWidth, availableHeight / slideHeight));
		setSlideshowScale(fittedScale);

		wrapper.style.transform = `scale(${fittedScale})`;
		wrapper.style.transformOrigin = 'center center';
		wrapper.style.margin = '0 auto';
	}, [currentSlide, getSlides, getWrapper, isSlideshow]);

	const fitFullscreenNormalMode = useCallback(() => {
		if (isSlideshow || !isSectionFullscreen || !previewAreaRef.current) return;

		const wrapper = getWrapper();
		const slides = getSlides();
		const active = slides[currentSlide] || slides[0];
		if (!wrapper || !active) return;

		const availableWidth = Math.max(previewAreaRef.current.clientWidth - 24, 1);
		const availableHeight = Math.max(previewAreaRef.current.clientHeight - 24, 1);
		const slideWidth = Math.max(active.offsetWidth, 1);
		const slideHeight = Math.max(active.offsetHeight, 1);

		const fittedScale = Math.max(0.1, Math.min(availableWidth / slideWidth, availableHeight / slideHeight));
		wrapper.style.transform = `scale(${fittedScale})`;
		wrapper.style.transformOrigin = 'top center';
		wrapper.style.margin = '0 auto';
	}, [currentSlide, getSlides, getWrapper, isSectionFullscreen, isSlideshow]);

	const goToSlide = useCallback((index: number) => {
		if (slideCount <= 0) return;
		const clamped = Math.max(0, Math.min(index, slideCount - 1));
		setCurrentSlide(clamped);
		applySlideMode(isSlideshow, clamped);

		if (!isSlideshow) {
			const slides = getSlides();
			slides[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}, [applySlideMode, getSlides, isSlideshow, slideCount]);

	const startSlideshow = useCallback(async () => {
		if (slideCount <= 0) return;

		setIsSlideshow(true);
		setSlideshowScale(1);
		applySlideMode(true, currentSlide);

		if (shellRef.current?.requestFullscreen && !document.fullscreenElement) {
			try {
				await shellRef.current.requestFullscreen();
			} catch {
				// Keep slideshow embedded if fullscreen is denied.
			}
		}
	}, [applySlideMode, currentSlide, slideCount]);

	const stopSlideshow = useCallback(async () => {
		setIsSlideshow(false);
		setLaserPointer({ x: 0, y: 0, visible: false });
		setSlideshowScale(1);
		applySlideMode(false, currentSlide);

		if (document.fullscreenElement === shellRef.current) {
			try {
				await document.exitFullscreen();
			} catch {
				// Ignore exit errors.
			}
		}
	}, [applySlideMode, currentSlide]);

	const toggleSectionFullscreen = useCallback(async () => {
		if (!shellRef.current) return;

		if (document.fullscreenElement === shellRef.current) {
			try {
				await document.exitFullscreen();
			} catch {
				// Ignore exit errors.
			}
			return;
		}

		if (document.fullscreenElement) {
			try {
				await document.exitFullscreen();
			} catch {
				// Ignore transition errors.
			}
		}

		if (shellRef.current.requestFullscreen) {
			try {
				await shellRef.current.requestFullscreen();
			} catch {
				// Ignore request errors.
			}
		}
	}, []);

	useEffect(() => {
		let cancelled = false;

		const loadPresentation = async () => {
			if (!mountRef.current) return;

			try {
				setIsRendering(true);
				setLoading(true);
				setError(null);
				setSlideCount(0);
				setCurrentSlide(0);
				setIsSlideshow(false);
				setZoom(1);
				setSlideshowScale(1);

				mountRef.current.innerHTML = '';

				const fetchUrl = url + (url.includes('?') ? '&' : '?') + `cb=${Date.now()}`;
				const response = await fetch(fetchUrl);
				if (!response.ok) {
					throw new Error(`Failed to fetch presentation: ${response.statusText}`);
				}

				const buffer = await response.arrayBuffer();
				if (cancelled || !mountRef.current) return;

				const viewportWidth = Math.max(600, Math.min(mountRef.current.clientWidth || 1200, 1600));
				const viewportHeight = Math.max(340, Math.round(viewportWidth * 0.56));

				const previewer = init(mountRef.current, {
					width: viewportWidth,
					height: viewportHeight,
				});

				previewerRef.current = previewer;
				let previewError: unknown = null;
				const previewPromise = previewer.preview(buffer).catch((err: unknown) => {
					previewError = err;
				});

				const renderedSlides = await waitForSlides(12000);
				if (renderedSlides === 0) {
					await previewPromise;
				}

				if (cancelled) return;
				if (previewError && renderedSlides === 0) {
					throw previewError;
				}

				const totalSlides = getSlides().length;
				if (totalSlides === 0) {
					throw new Error('Unable to render slides from this presentation.');
				}

				setSlideCount(totalSlides);
				setCurrentSlide(0);
				applySlideMode(false, 0);

				const wrapper = getWrapper();
				if (wrapper) {
					wrapper.style.transform = 'scale(1)';
					wrapper.style.transformOrigin = 'top center';
					wrapper.style.margin = '0 auto';
				}
			} catch (err: unknown) {
				if (cancelled) return;
				const message = err instanceof Error ? err.message : 'Failed to load presentation';
				setError(message);
				toast.error(message);
			} finally {
				if (!cancelled) {
					setIsRendering(false);
					setLoading(false);
				}
			}
		};

		void loadPresentation();

		return () => {
			cancelled = true;
			previewerRef.current = null;
		};
	}, [applySlideMode, getSlides, getWrapper, setError, setLoading, url, waitForSlides]);

	useEffect(() => {
		if (!isSlideshow) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				void stopSlideshow();
				return;
			}
			if (event.key === 'ArrowRight' || event.key === ' ') {
				event.preventDefault();
				goToSlide(currentSlide + 1);
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				goToSlide(currentSlide - 1);
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [currentSlide, goToSlide, isSlideshow, stopSlideshow]);

	useEffect(() => {
		const onFullscreenChange = () => {
			const fullscreen = document.fullscreenElement === shellRef.current;
			setIsSectionFullscreen(fullscreen);

			if (!fullscreen && isSlideshow) {
				setIsSlideshow(false);
				setLaserPointer((prev) => ({ ...prev, visible: false }));
			}
		};

		document.addEventListener('fullscreenchange', onFullscreenChange);
		onFullscreenChange();

		return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
	}, [isSlideshow]);

	useEffect(() => {
		if (!isSlideshow) {
			if (isSectionFullscreen) {
				fitFullscreenNormalMode();
			} else {
				const wrapper = getWrapper();
				if (wrapper) {
					wrapper.style.transform = `scale(${zoom})`;
					wrapper.style.transformOrigin = 'top center';
					wrapper.style.margin = '0 auto';
				}
			}
			return;
		}

		fitSlideshowToViewport();
	}, [fitFullscreenNormalMode, fitSlideshowToViewport, getWrapper, isSectionFullscreen, isSlideshow, zoom]);

	useEffect(() => {
		if (!isSlideshow && !isSectionFullscreen) return;

		const onResize = () => {
			if (isSlideshow) {
				fitSlideshowToViewport();
				return;
			}

			if (isSectionFullscreen) {
				fitFullscreenNormalMode();
			}
		};

		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [fitFullscreenNormalMode, fitSlideshowToViewport, isSectionFullscreen, isSlideshow]);

	useEffect(() => {
		if (slideCount === 0) return;
		applySlideMode(isSlideshow, currentSlide);
	}, [applySlideMode, currentSlide, isSlideshow, slideCount]);

	useEffect(() => {
		return () => {
			if (laserHideTimerRef.current) {
				window.clearTimeout(laserHideTimerRef.current);
			}
		};
	}, []);

	const handleSlideshowMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
		if (!isSlideshow || !previewAreaRef.current) return;

		const rect = previewAreaRef.current.getBoundingClientRect();
		setLaserPointer({
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			visible: true,
		});

		if (laserHideTimerRef.current) {
			window.clearTimeout(laserHideTimerRef.current);
		}

		laserHideTimerRef.current = window.setTimeout(() => {
			setLaserPointer((prev) => ({ ...prev, visible: false }));
		}, 700);
	}, [isSlideshow]);

	const handleSlideshowMouseLeave = useCallback(() => {
		if (!isSlideshow) return;
		setLaserPointer((prev) => ({ ...prev, visible: false }));
	}, [isSlideshow]);

	return (
		<div
			ref={shellRef}
			className={`relative flex h-full w-full flex-col ${isSlideshow ? 'bg-black' : 'bg-[#F8ECE8] dark:bg-slate-900'}`}
		>
			<style>{`
				.pptx-host .slide-master-wrapper .text-wrapper,
				.pptx-host .slide-layout-wrapper .text-wrapper {
					display: none !important;
				}

				.pptx-host .pptx-preview-slide-wrapper,
				.pptx-host .slide-wrapper,
				.pptx-host .text-wrapper,
				.pptx-host .text-wrapper p,
				.pptx-host .text-wrapper span {
					font-family: Arial, "Segoe UI", Tahoma, sans-serif !important;
					font-kerning: normal;
					text-rendering: geometricPrecision;
				}
			`}</style>

			{!isSlideshow && (
				<div
					className="border-b px-4 py-3 text-white shadow-sm"
					style={{ backgroundColor: POWERPOINT_ORANGE, borderColor: '#8E3722' }}
				>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<div className="rounded-md bg-white/20 p-1.5">
								<Presentation className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h2 className="truncate text-lg font-semibold tracking-tight">PowerPoint Viewer</h2>
								<p className="truncate text-xs text-orange-100">{fileName}</p>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Button
								size="sm"
								onClick={() => applyNormalZoom(Math.max(MIN_ZOOM, Number((zoom - ZOOM_STEP).toFixed(2))))}
								disabled={zoom <= MIN_ZOOM || isRendering}
								className="gap-2 border border-white/30 bg-white/15 text-white hover:bg-white/25"
							>
								<ZoomOut className="h-4 w-4" />
								Zoom Out
							</Button>

							<Button
								size="sm"
								onClick={() => applyNormalZoom(Math.min(MAX_ZOOM, Number((zoom + ZOOM_STEP).toFixed(2))))}
								disabled={zoom >= MAX_ZOOM || isRendering}
								className="gap-2 border border-white/30 bg-white/15 text-white hover:bg-white/25"
							>
								<ZoomIn className="h-4 w-4" />
								Zoom In
							</Button>

							<Button
								size="sm"
								onClick={() => applyNormalZoom(1)}
								disabled={isRendering}
								className="gap-2 border border-white/30 bg-white/15 text-white hover:bg-white/25"
							>
								<RotateCcw className="h-4 w-4" />
								Reset
							</Button>

							<Button
								size="sm"
								onClick={() => void toggleSectionFullscreen()}
								className="gap-2 border border-white/30 bg-white/15 text-white hover:bg-white/25"
							>
								{isSectionFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
								{isSectionFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
							</Button>

							<Button
								size="sm"
								onClick={() => void startSlideshow()}
								disabled={slideCount <= 0 || isRendering}
								className="gap-2 border border-white/30 bg-white text-[#B6472B] hover:bg-[#F8ECE8]"
							>
								<MonitorPlay className="h-4 w-4" />
								Slideshow
							</Button>

							<Button
								size="sm"
								onClick={onDownload}
								className="gap-2 border border-white/30 bg-[#15803D] text-white hover:bg-[#166534]"
							>
								<Download className="h-4 w-4" />
								Download
							</Button>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/15 px-3 py-2 text-xs">
						<div className="font-medium text-orange-50">Zoom: {Math.round(zoom * 100)}%</div>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								onClick={() => goToSlide(currentSlide - 1)}
								disabled={currentSlide <= 0 || slideCount <= 0}
								className="h-7 gap-1 border border-white/25 bg-white/10 px-2 text-white hover:bg-white/20"
							>
								<SkipBack className="h-3.5 w-3.5" />
								Prev
							</Button>
							<span className="min-w-24 text-center text-orange-100">
								Slide {slideCount > 0 ? currentSlide + 1 : 0} / {slideCount}
							</span>
							<Button
								size="sm"
								onClick={() => goToSlide(currentSlide + 1)}
								disabled={slideCount <= 0 || currentSlide >= slideCount - 1}
								className="h-7 gap-1 border border-white/25 bg-white/10 px-2 text-white hover:bg-white/20"
							>
								Next
								<SkipForward className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				</div>
			)}

			{isSlideshow && (
				<div className="absolute right-4 top-4 z-30">
					<Button
						size="sm"
						onClick={() => void stopSlideshow()}
						className="gap-2 border border-white/30 bg-black/55 text-white hover:bg-black/75"
					>
						<Pause className="h-4 w-4" />
						Exit Slideshow
					</Button>
				</div>
			)}

			<div
				ref={previewAreaRef}
				onMouseMove={handleSlideshowMouseMove}
				onMouseLeave={handleSlideshowMouseLeave}
				className={`relative flex-1 overflow-auto p-4 ${isSlideshow ? 'flex items-center justify-center overflow-hidden bg-black p-2' : ''}`}
			>
				{isRendering && (
					<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
						<div className="rounded-lg border border-orange-200 bg-white px-4 py-3 shadow-xl">
							<div className="flex items-center gap-2 text-sm text-slate-700">
								<Loader2 className="h-4 w-4 animate-spin text-[#B6472B]" />
								Rendering presentation...
							</div>
						</div>
					</div>
				)}

				{isSlideshow && laserPointer.visible && (
					<div
						className="pointer-events-none absolute z-20 h-5 w-5 rounded-full border border-red-200"
						style={{
							left: `${laserPointer.x}px`,
							top: `${laserPointer.y}px`,
							transform: 'translate(-50%, -50%)',
							background: 'radial-gradient(circle, rgba(255,62,62,0.95) 0%, rgba(255,0,0,0.65) 40%, rgba(255,0,0,0) 75%)',
							boxShadow: '0 0 22px rgba(255, 38, 38, 0.95)',
						}}
					/>
				)}

				<div
					ref={mountRef}
					className={`pptx-host mx-auto w-full ${isSlideshow ? 'flex items-center justify-center' : ''}`}
				/>

				{isSlideshow && (
					<div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/55 px-3 py-1 text-xs text-white/90">
						Slide {slideCount > 0 ? currentSlide + 1 : 0} / {slideCount} | Fit {Math.round(slideshowScale * 100)}%
					</div>
				)}
			</div>
		</div>
	);
}
