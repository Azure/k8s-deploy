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
exports.sleepFor = exports.sendRequest = exports.WebRequestOptions = exports.WebResponse = exports.WebRequest = exports.StatusCodes = void 0;
// Taken from https://github.com/Azure/aks-set-context/blob/master/src/client.ts
const util = require("util");
const fs = require("fs");
const httpClient = require("typed-rest-client/HttpClient");
const core = require("@actions/core");
var httpCallbackClient = new httpClient.HttpClient('GITHUB_RUNNER', null, {});
var StatusCodes;
(function (StatusCodes) {
    StatusCodes[StatusCodes["OK"] = 200] = "OK";
    StatusCodes[StatusCodes["CREATED"] = 201] = "CREATED";
    StatusCodes[StatusCodes["ACCEPTED"] = 202] = "ACCEPTED";
    StatusCodes[StatusCodes["UNAUTHORIZED"] = 401] = "UNAUTHORIZED";
    StatusCodes[StatusCodes["NOT_FOUND"] = 404] = "NOT_FOUND";
    StatusCodes[StatusCodes["INTERNAL_SERVER_ERROR"] = 500] = "INTERNAL_SERVER_ERROR";
    StatusCodes[StatusCodes["SERVICE_UNAVAILABLE"] = 503] = "SERVICE_UNAVAILABLE";
})(StatusCodes = exports.StatusCodes || (exports.StatusCodes = {}));
class WebRequest {
}
exports.WebRequest = WebRequest;
class WebResponse {
}
exports.WebResponse = WebResponse;
class WebRequestOptions {
}
exports.WebRequestOptions = WebRequestOptions;
function sendRequest(request, options) {
    return __awaiter(this, void 0, void 0, function* () {
        let i = 0;
        let retryCount = options && options.retryCount ? options.retryCount : 5;
        let retryIntervalInSeconds = options && options.retryIntervalInSeconds ? options.retryIntervalInSeconds : 2;
        let retriableErrorCodes = options && options.retriableErrorCodes ? options.retriableErrorCodes : ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "EPIPE", "EA_AGAIN"];
        let retriableStatusCodes = options && options.retriableStatusCodes ? options.retriableStatusCodes : [408, 409, 500, 502, 503, 504];
        let timeToWait = retryIntervalInSeconds;
        while (true) {
            try {
                if (request.body && typeof (request.body) !== 'string' && !request.body["readable"]) {
                    request.body = fs.createReadStream(request.body["path"]);
                }
                let response = yield sendRequestInternal(request);
                if (retriableStatusCodes.indexOf(response.statusCode) != -1 && ++i < retryCount) {
                    core.debug(util.format("Encountered a retriable status code: %s. Message: '%s'.", response.statusCode, response.statusMessage));
                    yield sleepFor(timeToWait);
                    timeToWait = timeToWait * retryIntervalInSeconds + retryIntervalInSeconds;
                    continue;
                }
                return response;
            }
            catch (error) {
                if (retriableErrorCodes.indexOf(error.code) != -1 && ++i < retryCount) {
                    core.debug(util.format("Encountered a retriable error:%s. Message: %s.", error.code, error.message));
                    yield sleepFor(timeToWait);
                    timeToWait = timeToWait * retryIntervalInSeconds + retryIntervalInSeconds;
                }
                else {
                    if (error.code) {
                        core.debug("error code =" + error.code);
                    }
                    throw error;
                }
            }
        }
    });
}
exports.sendRequest = sendRequest;
function sleepFor(sleepDurationInSeconds) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, sleepDurationInSeconds * 1000);
    });
}
exports.sleepFor = sleepFor;
function sendRequestInternal(request) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(util.format("[%s]%s", request.method, request.uri));
        var response = yield httpCallbackClient.request(request.method, request.uri, request.body, request.headers);
        return yield toWebResponse(response);
    });
}
function toWebResponse(response) {
    return __awaiter(this, void 0, void 0, function* () {
        var res = new WebResponse();
        if (response) {
            res.statusCode = response.message.statusCode;
            res.statusMessage = response.message.statusMessage;
            res.headers = response.message.headers;
            var body = yield response.readBody();
            if (body) {
                try {
                    res.body = JSON.parse(body);
                }
                catch (error) {
                    core.debug("Could not parse response: " + JSON.stringify(error));
                    core.debug("Response: " + JSON.stringify(res.body));
                    res.body = body;
                }
            }
        }
        return res;
    });
}
