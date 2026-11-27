import { describe, expect, it } from "vitest";

import { addPoint, drawStroke, drawStrokes, INK_COLOR, INK_WIDTH, probePoints } from "./ink";

/** A pen that writes down what it was asked to draw. */
function recorder() {
  const calls: string[] = [];
  const log = (name: string) => (...args: number[]) => void calls.push(`${name}(${args.map((n) => Math.round(n * 100) / 100).join(",")})`);
  const pen = { beginPath: log("begin"), moveTo: log("move"), lineTo: log("line"), quadraticCurveTo: log("curve"), arc: log("arc"), stroke: log("stroke"), fill: log("fill"), lineWidth: 0, lineCap: "butt", lineJoin: "miter", strokeStyle: "", fillStyle: "" };
  return { pen: pen as unknown as Parameters<typeof drawStrokes>[0], calls, style: pen };
}

describe("the QA pencil", () => {
  it("drops samples from a hand that barely moved", () => {
    const points = [10, 10];
    expect(addPoint(points, 10.2, 10.3)).toBe(false);
    expect(addPoint(points, 12, 10)).toBe(true);
    expect(points).toEqual([10, 10, 12, 10]);
  });

  it("draws a click as a dot and a drag as a curve through the midpoints", () => {
    const dot = recorder();
    drawStroke(dot.pen, [5, 6]);
    expect(dot.calls).toEqual(["begin()", `arc(5,6,${INK_WIDTH / 2},0,6.28)`, "fill()"]);
    const line = recorder();
    drawStroke(line.pen, [0, 0, 10, 0, 10, 10, 20, 10]);
    expect(line.calls).toEqual(["begin()", "move(0,0)", "curve(10,0,10,5)", "curve(10,10,15,10)", "line(20,10)", "stroke()"]);
    const two = recorder();
    drawStroke(two.pen, [0, 0, 4, 4]);
    expect(two.calls).toEqual(["begin()", "move(0,0)", "line(4,4)", "stroke()"]);
  });

  it("is 3px, round and bright red", () => {
    const { pen, style, calls } = recorder();
    drawStrokes(pen, [[1, 1], [0, 0, 5, 5]]);
    expect(style).toMatchObject({ lineWidth: 3, lineCap: "round", lineJoin: "round", strokeStyle: INK_COLOR, fillStyle: INK_COLOR });
    expect(INK_COLOR).toBe("rgb(255, 31, 31)");
    expect(calls.filter((c) => c === "begin()")).toHaveLength(2);
  });

  it("looks under the middle of a stroke first, then its end and its start", () => {
    // A circle from (100,50) around (50,50): its middle is what it surrounds.
    expect(probePoints([100, 50, 50, 100, 0, 50, 50, 0, 99, 49])).toEqual([[50, 50], [99, 49], [100, 50]]);
    expect(probePoints([7, 7])).toEqual([[7, 7]]);
    expect(probePoints([])).toEqual([]);
  });
});
