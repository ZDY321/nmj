export type TourRect = { left: number; top: number; width: number; height: number };
export type TourViewport = { width: number; height: number; left?: number; top?: number };
type TourPanelSize = { width: number; height: number };

const margin = 12;
const gap = 18;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Keep the guide inside the visible viewport, including above a mobile keyboard. */
export function getTourPanelLayout(target: TourRect | null, viewport: TourViewport, panel: TourPanelSize) {
  const minLeft = (viewport.left ?? 0) + margin;
  const minTop = (viewport.top ?? 0) + margin;
  const right = (viewport.left ?? 0) + viewport.width - margin;
  const bottom = (viewport.top ?? 0) + viewport.height - margin;
  const width = Math.min(panel.width, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(panel.height, Math.max(0, viewport.height - margin * 2));
  const centered = {
    left: minLeft + (viewport.width - margin * 2 - width) / 2,
    top: minTop + (viewport.height - margin * 2 - height) / 2
  };
  if (!target) return { ...centered, width, height, placement: "center" as const };

  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const alignedTop = clamp(target.top, minTop, bottom - height);
  const alignedLeft = clamp(target.left, minLeft, right - width);
  if (targetRight + gap + width <= right) {
    return { left: clamp(targetRight + gap, minLeft, right - width), top: alignedTop, width, height, placement: "right" as const };
  }
  if (target.left - gap - width >= minLeft) {
    return { left: clamp(target.left - gap - width, minLeft, right - width), top: alignedTop, width, height, placement: "left" as const };
  }
  if (targetBottom + gap + height <= bottom) {
    return { left: alignedLeft, top: clamp(targetBottom + gap, minTop, bottom - height), width, height, placement: "bottom" as const };
  }
  if (target.top - gap - height >= minTop) {
    return { left: alignedLeft, top: clamp(target.top - gap - height, minTop, bottom - height), width, height, placement: "top" as const };
  }
  return { left: alignedLeft, top: bottom - height, width, height, placement: "sheet" as const };
}

export function getTourSpotlight(target: TourRect, viewport: TourViewport, bottomLimit?: number): TourRect | null {
  const left = Math.max((viewport.left ?? 0) + 6, target.left - 6);
  const top = Math.max((viewport.top ?? 0) + 6, target.top - 6);
  const right = Math.min((viewport.left ?? 0) + viewport.width - 6, target.left + target.width + 6);
  const bottom = Math.min((viewport.top ?? 0) + viewport.height - 6, target.top + target.height + 6, bottomLimit ?? Infinity);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}
