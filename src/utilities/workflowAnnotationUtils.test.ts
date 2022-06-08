import { prefixObjectKeys } from "../utilities/workflowAnnotationUtils";

describe("WorkflowAnnotationUtils", () => {
    describe("prefixObjectKeys", () => {
        it("should prefix an object with a given prefix", () => {
            const obj = {
                foo: "bar",
                baz: "qux",
            };
            const prefix = "prefix.";
            const expected = {
                "prefix.foo": "bar",
                "prefix.baz": "qux",
            };
            expect(prefixObjectKeys(obj, prefix)).toEqual(expected);
        });
    });
});