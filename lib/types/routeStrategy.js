"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRouteStrategy = exports.RouteStrategy = void 0;
var RouteStrategy;
(function (RouteStrategy) {
    RouteStrategy["INGRESS"] = "ingress";
    RouteStrategy["SMI"] = "smi";
    RouteStrategy["SERVICE"] = "service";
})(RouteStrategy = exports.RouteStrategy || (exports.RouteStrategy = {}));
exports.parseRouteStrategy = (str) => RouteStrategy[Object.keys(RouteStrategy).filter((k) => RouteStrategy[k].toString().toLowerCase() === str.toLowerCase())[0]];
