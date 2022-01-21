"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInlineArray = void 0;
function createInlineArray(str) {
    if (typeof str === "string") {
        return str;
    }
    return str.join(",");
}
exports.createInlineArray = createInlineArray;
