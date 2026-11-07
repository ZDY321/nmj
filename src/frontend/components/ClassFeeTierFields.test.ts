// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassFeeTierFields } from "./ClassFeeTierFields";

let container: HTMLDivElement;
let root: Root;
const onChange = vi.fn();
function render(visible: boolean) {
  act(() => root.render(createElement(ClassFeeTierFields, {
    feeRule: { mode: "class_headcount", classFeeTiers: [{ id: "late", minStudents: 5, baseFee: 300 }, { id: "first", minStudents: 2, baseFee: 100 }] },
    amountsVisible: visible,
    onChange,
    rowClassName: "tier-row",
    inputClassName: "tier-input"
  })));
}
function inputValue(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onChange.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("class fee tier controls", () => {
  it("emits the normalized tier ID and clips negative or blank numeric edits", () => {
    render(true);
    const inputs = container.querySelectorAll("input");
    expect(Array.from(inputs, input => input.value)).toEqual(["2", "100", "0"]);
    inputValue(inputs[0], "3");
    inputValue(inputs[1], "-50");
    inputValue(inputs[2], "12");
    inputValue(inputs[2], "");
    expect(onChange.mock.calls).toEqual([
      ["first", { minStudents: 3 }], ["first", { baseFee: 0 }],
      ["first", { perStudentFee: 12 }], ["first", { perStudentFee: 0 }]
    ]);
  });

  it("keeps the headcount editable while hidden amounts have no input controls", () => {
    render(false);
    expect(container.querySelectorAll("input")).toHaveLength(1);
    expect(container.textContent).toContain("***");
    expect(container.innerHTML).not.toContain('value="100"');
    inputValue(container.querySelector("input")!, "4");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("first", { minStudents: 4 });
    render(true);
    expect(container.querySelectorAll("input")).toHaveLength(3);
    expect(container.querySelectorAll("input")[1].value).toBe("100");
  });
});
