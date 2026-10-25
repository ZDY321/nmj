import { describe, expect, it } from "vitest";
import { getTourPanelLayout, getTourSpotlight, type TourRect } from "@/frontend/lib/onboardingLayout";

const panel = { width: 368, height: 340 };

describe("onboarding positioning", () => {
  it("uses space beside the target when available", () => {
    expect(getTourPanelLayout({ left: 100, top: 150, width: 500, height: 400 }, { width: 1440, height: 900 }, panel).placement).toBe("right");
    expect(getTourPanelLayout({ left: 900, top: 150, width: 400, height: 400 }, { width: 1440, height: 900 }, panel).placement).toBe("left");
  });

  it("places a wide target's guide above or below without covering it", () => {
    const viewport = { width: 1024, height: 900 };
    expect(getTourPanelLayout({ left: 50, top: 50, width: 900, height: 200 }, viewport, panel).placement).toBe("bottom");
    expect(getTourPanelLayout({ left: 50, top: 600, width: 900, height: 200 }, viewport, panel).placement).toBe("top");
  });

  it("uses a bottom sheet for a tall mobile form and leaves the spotlight above it", () => {
    const viewport = { width: 390, height: 844 };
    const target = { left: 16, top: 20, width: 358, height: 1000 };
    const layout = getTourPanelLayout(target, viewport, panel);
    expect(layout.placement).toBe("sheet");
    expect(layout.width).toBe(366);
    expect(layout.top + layout.height).toBe(832);
    const spotlight = getTourSpotlight(target, viewport, layout.top - 14)!;
    expect(spotlight.top + spotlight.height).toBeLessThan(layout.top);
  });

  it("keeps controls visible above the mobile keyboard", () => {
    const viewport = { width: 390, height: 300, top: 180 };
    const layout = getTourPanelLayout({ left: 16, top: 190, width: 358, height: 700 }, viewport, panel);
    expect(layout.top).toBeGreaterThanOrEqual(192);
    expect(layout.top + layout.height).toBeLessThanOrEqual(468);
  });

  it("stays inside the screen even while the target scrolls out of view", () => {
    for (const width of [320, 390, 768, 1440]) {
      for (const height of [300, 844, 1080]) {
        for (const left of [-1200, 0, 100, 1000]) {
          for (const top of [-1200, 0, 100, 1000]) {
            const layout = getTourPanelLayout({ left, top, width: 600, height: 600 }, { width, height }, panel);
            expect(layout.left).toBeGreaterThanOrEqual(12);
            expect(layout.top).toBeGreaterThanOrEqual(12);
            expect(layout.left + layout.width).toBeLessThanOrEqual(width - 12);
            expect(layout.top + layout.height).toBeLessThanOrEqual(height - 12);
          }
        }
      }
    }
  });

  it("centers the guide while a lazy page loads", () => {
    const layout = getTourPanelLayout(null, { width: 1440, height: 900 }, panel);
    expect(layout.placement).toBe("center");
    expect(layout.left).toBe((1440 - panel.width) / 2);
  });

  it("clips the spotlight to the viewport and hides offscreen targets", () => {
    const target: TourRect = { left: -100, top: -200, width: 1000, height: 1200 };
    expect(getTourSpotlight(target, { width: 390, height: 844 })).toEqual({ left: 6, top: 6, width: 378, height: 832 });
    expect(getTourSpotlight({ ...target, top: 1000 }, { width: 390, height: 844 })).toBeNull();
  });
});
