import { createInlineArray } from "./arrayUtils";

describe("create inline array", () => {
  it("creates an inline array", () => {
    const strings = ["str1", "str2", "str3"];
    expect(createInlineArray(strings)).toBe(strings.join(","));

    const string = "str1";
    expect(createInlineArray([string])).toBe(string);
    expect(createInlineArray(string)).toBe(string);
  });
});
