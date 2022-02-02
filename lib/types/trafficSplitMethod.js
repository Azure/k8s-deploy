"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTrafficSplitMethod = exports.TrafficSplitMethod = void 0;
var TrafficSplitMethod;
(function (TrafficSplitMethod) {
    TrafficSplitMethod["POD"] = "pod";
    TrafficSplitMethod["SMI"] = "smi";
})(TrafficSplitMethod = exports.TrafficSplitMethod || (exports.TrafficSplitMethod = {}));
/**
 * Converts a string to the TrafficSplitMethod enum
 * @param str The traffic split method (case insensitive)
 * @returns The TrafficSplitMethod enum or undefined if it can't be parsed
 */
exports.parseTrafficSplitMethod = (str) => TrafficSplitMethod[Object.keys(TrafficSplitMethod).filter((k) => TrafficSplitMethod[k].toString().toLowerCase() === str.toLowerCase())[0]];
