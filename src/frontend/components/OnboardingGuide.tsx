import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Compass, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { onboardingStepKeys, onboardingTourSteps, type OnboardingTourStep } from "@/frontend/lib/onboarding";
import { getTourPanelLayout, getTourSpotlight, type TourRect, type TourViewport } from "@/frontend/lib/onboardingLayout";

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function readViewport(): TourViewport {
  const visual = window.visualViewport;
  return {
    width: visual?.width ?? document.documentElement.clientWidth,
    height: visual?.height ?? window.innerHeight,
    left: visual?.offsetLeft ?? 0,
    top: visual?.offsetTop ?? 0
  };
}

export function OnboardingGuide({ step, stepIndex, onStepChange, onComplete, onDismiss }: {
  step: OnboardingTourStep;
  stepIndex: number;
  onStepChange: (index: number) => void;
  onComplete: () => void;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const callbacksRef = useRef({ onStepChange, onComplete, onDismiss, stepIndex });
  callbacksRef.current = { onStepChange, onComplete, onDismiss, stepIndex };
  const maskId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const [viewport, setViewport] = useState(readViewport);
  const [target, setTarget] = useState<{ id: string; rect: TourRect } | null>(null);
  const [panelSize, setPanelSize] = useState({ width: 368, height: 360 });
  const [missingTargetId, setMissingTargetId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const rect = target?.id === step.id ? target.rect : null;
  const layout = getTourPanelLayout(rect, viewport, panelSize);
  const spotlight = rect ? getTourSpotlight(rect, viewport, layout.placement === "sheet" ? layout.top - 14 : undefined) : null;
  const groupIndex = onboardingStepKeys.indexOf(step.group);
  const lastStep = stepIndex === onboardingTourSteps.length - 1;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => {
      const next = { width: 368, height: panel.offsetHeight };
      setPanelSize((current) => current.width === next.width && current.height === next.height ? current : next);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function handleKeyDown(event: KeyboardEvent) {
      // A confirmation opened from the form manages its own focus and Escape key.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const callbacks = callbacksRef.current;
      if (event.key === "Escape") {
        event.preventDefault();
        callbacks.onDismiss();
        return;
      }
      const editing = event.target instanceof Element && Boolean(event.target.closest('input, select, textarea, [contenteditable="true"]'));
      if (!editing && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        if (event.key === "ArrowLeft" && callbacks.stepIndex > 0) callbacks.onStepChange(callbacks.stepIndex - 1);
        if (event.key === "ArrowRight" && callbacks.stepIndex < onboardingTourSteps.length - 1) callbacks.onStepChange(callbacks.stepIndex + 1);
      }
      if (event.key !== "Tab") return;
      const elements = [targetRef.current, panelRef.current].flatMap((container) => container
        ? [...(container.matches(focusableSelector) ? [container] : []), ...container.querySelectorAll<HTMLElement>(focusableSelector)]
        : []).filter((element) => element.getClientRects().length > 0);
      if (elements.length === 0) return;
      const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? (event.shiftKey ? elements.length - 1 : 0)
        : (currentIndex + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      elements[nextIndex].focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let settleFrame = 0;
    let framesRemaining = 36;
    let positionedElement: HTMLElement | null = null;
    let observedElement: HTMLElement | null = null;
    targetRef.current = null;
    const resizeObserver = new ResizeObserver(scheduleMeasure);

    function measure() {
      frame = 0;
      setModalOpen(Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));
      const nextViewport = readViewport();
      setViewport((current) => Object.keys(nextViewport).every((key) => current[key as keyof TourViewport] === nextViewport[key as keyof TourViewport]) ? current : nextViewport);
      const element = document.querySelector<HTMLElement>(`[data-onboarding="${step.target}"]`);
      if (!element || !element.getClientRects().length) {
        targetRef.current = null;
        setTarget((current) => current === null ? current : null);
        return;
      }
      targetRef.current = element;
      if (observedElement !== element) {
        resizeObserver.disconnect();
        resizeObserver.observe(element);
        observedElement = element;
      }
      if (positionedElement !== element) {
        const bounds = element.getBoundingClientRect();
        element.scrollIntoView({ block: bounds.height > nextViewport.height - panelSize.height - 48 ? "start" : "center", inline: "nearest", behavior: "instant" });
        panelRef.current?.focus({ preventScroll: true });
        positionedElement = element;
      }
      const bounds = element.getBoundingClientRect();
      const next = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
      setTarget((current) => current?.id === step.id && Object.keys(next).every((key) => Math.abs(current.rect[key as keyof TourRect] - next[key as keyof TourRect]) < 0.5)
        ? current : { id: step.id, rect: next });
    }
    function scheduleMeasure() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function settle() {
      scheduleMeasure();
      if (--framesRemaining > 0) settleFrame = requestAnimationFrame(settle);
    }
    const mutations = new MutationObserver(scheduleMeasure);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-expanded"] });
    window.addEventListener("scroll", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);
    const missingTimer = window.setTimeout(() => setMissingTargetId(step.id), 5000);
    settle();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      window.clearTimeout(missingTimer);
      mutations.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [step.id, step.target]);

  useEffect(() => {
    if (layout.placement !== "sheet") return;
    // Leave enough scroll room to bring a form's final fields above the mobile guide.
    const previousPadding = document.body.style.paddingBottom;
    const previousScrollPadding = document.documentElement.style.scrollPaddingBottom;
    document.body.style.paddingBottom = `${layout.height + 32}px`;
    document.documentElement.style.scrollPaddingBottom = `${layout.height + 32}px`;
    return () => {
      document.body.style.paddingBottom = previousPadding;
      document.documentElement.style.scrollPaddingBottom = previousScrollPadding;
    };
  }, [layout.placement, layout.height]);

  const arrowOffset = spotlight ? {
    x: Math.max(24, Math.min(layout.width - 24, spotlight.left + spotlight.width / 2 - layout.left)),
    y: Math.max(24, Math.min(layout.height - 24, spotlight.top + spotlight.height / 2 - layout.top))
  } : { x: 24, y: 24 };
  const arrowStyle = layout.placement === "right" ? { left: -6, top: arrowOffset.y }
    : layout.placement === "left" ? { right: -6, top: arrowOffset.y }
      : layout.placement === "bottom" ? { top: -6, left: arrowOffset.x }
        : { bottom: -6, left: arrowOffset.x };

  return createPortal(
    <div className="onboarding-overlay" data-onboarding-overlay style={{ display: modalOpen ? "none" : undefined }}>
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs><mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          {spotlight && <rect x={spotlight.left} y={spotlight.top} width={spotlight.width} height={spotlight.height} rx="14" fill="black" />}
        </mask></defs>
        <rect width="100%" height="100%" fill="#061226" fillOpacity="0.58" mask={`url(#${maskId})`} />
      </svg>
      {spotlight ? <>
        <div className="onboarding-blocker" style={{ left: 0, right: 0, top: 0, height: spotlight.top }} />
        <div className="onboarding-blocker" style={{ left: 0, right: 0, top: spotlight.top + spotlight.height, bottom: 0 }} />
        <div className="onboarding-blocker" style={{ left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.height }} />
        <div className="onboarding-blocker" style={{ left: spotlight.left + spotlight.width, right: 0, top: spotlight.top, height: spotlight.height }} />
        <div className="onboarding-spotlight" style={spotlight} />
      </> : <div className="onboarding-blocker inset-0" />}
      <div ref={panelRef} role="dialog" aria-label="新手指引" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}
        className="onboarding-popover" style={{ left: layout.left, top: layout.top, width: layout.width, maxHeight: viewport.height - 24 }}>
        {spotlight && !["sheet", "center"].includes(layout.placement) && <span className="onboarding-arrow" style={arrowStyle} aria-hidden="true" />}
        <div className="relative max-h-[inherit] overflow-y-auto rounded-[20px] bg-white">
          <div className="flex items-center gap-3 px-5 pt-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#fff3e4] text-[#ed7913]"><Compass size={22} /></span>
            <div className="flex-1">
              <p className="text-[11px] font-bold tracking-widest text-[#94a3b8]">新手指引 · {groupIndex + 1}/5</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#1557c2]">{step.groupLabel}</p>
            </div>
            <span className="text-xs font-bold tabular-nums text-[#64748b]">{stepIndex + 1} / {onboardingTourSteps.length}</span>
            <button type="button" onClick={onDismiss} className="onboarding-close" aria-label="暂时退出引导" title="暂时退出，可从新手指引继续"><X size={17} /></button>
          </div>
          <div className="px-5 pb-4 pt-4" aria-live="polite" aria-atomic="true">
            <h2 id={titleId} className="text-xl font-extrabold leading-7 text-[#061226]">{step.title}</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#475569]">{step.description}</p>
            <p className="mt-3 rounded-[12px] bg-[#fff8ef] px-3 py-2 text-xs leading-5 text-[#9a5b21]">{step.hint}</p>
            {!rect && <div className="mt-3 text-xs leading-5 text-[#64748b]" role="status">
              {missingTargetId === step.id ? <>
                当前区域暂时不可见，可重新定位或继续下一步。
                <button type="button" onClick={() => onStepChange(stepIndex)} className="mt-1 flex items-center gap-1 font-bold text-[#1557c2]"><RotateCcw size={12} /> 重新定位</button>
              </> : "正在定位页面中的操作位置…"}
            </div>}
          </div>
          <nav className="grid grid-cols-5 gap-1.5 px-5 pb-4" aria-label="引导章节">
            {onboardingStepKeys.map((group, index) => {
              const firstIndex = onboardingTourSteps.findIndex((item) => item.group === group);
              const label = onboardingTourSteps[firstIndex].groupLabel;
              return <button key={group} type="button" onClick={() => onStepChange(firstIndex)} aria-current={step.group === group ? "step" : undefined} aria-label={`查看${label}`} className="group space-y-1.5 text-left">
                <span className={`block h-1 rounded-full transition-colors ${index <= groupIndex ? "bg-[#ff8617]" : "bg-[#e8eef6] group-hover:bg-[#cbd5e1]"}`} />
                <span className={`block whitespace-nowrap text-[10px] font-bold ${index === groupIndex ? "text-[#b85c08]" : "text-[#94a3b8]"}`}>{label}</span>
              </button>;
            })}
          </nav>
          <div className="flex items-center gap-2 border-t border-[#edf1f7] bg-[#f8fbff] px-5 py-4">
            <button type="button" onClick={onDismiss} className="mr-auto text-xs font-semibold text-[#64748b] hover:text-[#25324a]">暂时退出</button>
            <Button type="button" size="sm" variant="outline" disabled={stepIndex === 0} onClick={() => onStepChange(stepIndex - 1)}><ArrowLeft size={14} /> 上一步</Button>
            <Button type="button" size="sm" onClick={() => lastStep ? onComplete() : onStepChange(stepIndex + 1)}>
              {lastStep ? <><Check size={14} /> 完成引导</> : <>下一步 <ArrowRight size={14} /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>, document.body
  );
}
