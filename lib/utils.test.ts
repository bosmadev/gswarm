import { cn } from "./utils";

describe("cn", () => {
  it("merges class names correctly", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "active")).toBe("base active");
    expect(cn("base", false && "active")).toBe("base");
  });

  it("deduplicates conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
