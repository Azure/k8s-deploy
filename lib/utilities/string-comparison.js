"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEqual = exports.StringComparer = void 0;
var StringComparer;
(function (StringComparer) {
    StringComparer[StringComparer["Ordinal"] = 0] = "Ordinal";
    StringComparer[StringComparer["OrdinalIgnoreCase"] = 1] = "OrdinalIgnoreCase";
})(StringComparer = exports.StringComparer || (exports.StringComparer = {}));
function isEqual(str1, str2, stringComparer) {
    if (str1 == null && str2 == null) {
        return true;
    }
    if (str1 == null) {
        return false;
    }
    if (str2 == null) {
        return false;
    }
    if (stringComparer == StringComparer.OrdinalIgnoreCase) {
        return str1.toUpperCase() === str2.toUpperCase();
    }
    else {
        return str1 === str2;
    }
}
exports.isEqual = isEqual;
