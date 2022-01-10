"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAction = exports.Action = void 0;
var Action;
(function (Action) {
    Action["DEPLOY"] = "deploy";
    Action["PROMOTE"] = "promote";
    Action["REJECT"] = "reject";
})(Action = exports.Action || (exports.Action = {}));
/**
 * Converts a string to the Action enum
 * @param str The action type (case insensitive)
 * @returns The Action enum or undefined if it can't be parsed
 */
exports.parseAction = (str) => Action[Object.keys(Action).filter((k) => Action[k].toString().toLowerCase() === str.toLowerCase())[0]];
