"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrafficSplitAPIVersion = void 0;
const trafficSplitAPIVersionPrefix = "split.smi-spec.io";
function getTrafficSplitAPIVersion(kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield kubectl.executeCommand("api-versions");
        const trafficSplitAPIVersion = result.stdout
            .split("\n")
            .find((version) => version.startsWith(trafficSplitAPIVersionPrefix));
        if (!trafficSplitAPIVersion) {
            throw new Error("Unable to find traffic split api version");
        }
        return trafficSplitAPIVersion;
    });
}
exports.getTrafficSplitAPIVersion = getTrafficSplitAPIVersion;
