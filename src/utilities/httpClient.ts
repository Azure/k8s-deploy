// Taken from https://github.com/Azure/aks-set-context/blob/master/src/client.ts
import util = require("util");
import fs = require('fs');
import httpClient = require("typed-rest-client/HttpClient");
import * as core from '@actions/core';

var httpCallbackClient = new httpClient.HttpClient('GITHUB_RUNNER', null, {});

export enum StatusCodes {
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    UNAUTHORIZED = 401,
    NOT_FOUND = 404,
    INTERNAL_SERVER_ERROR = 500,
    SERVICE_UNAVAILABLE = 503
}

export class WebRequest {
    public method: string;
    public uri: string;
    // body can be string or ReadableStream
    public body: string | NodeJS.ReadableStream;
    public headers: any;
}

export class WebResponse {
    public statusCode: number;
    public statusMessage: string;
    public headers: any;
    public body: any;
}

export class WebRequestOptions {
    public retriableErrorCodes?: string[];
    public retryCount?: number;
    public retryIntervalInSeconds?: number;
    public retriableStatusCodes?: number[];
    public retryRequestTimedout?: boolean;
}

export async function sendRequest(request: WebRequest, options?: WebRequestOptions): Promise<WebResponse> {
    let i = 0;
    let retryCount = options && options.retryCount ? options.retryCount : 5;
    let retryIntervalInSeconds = options && options.retryIntervalInSeconds ? options.retryIntervalInSeconds : 2;
    let retriableErrorCodes = options && options.retriableErrorCodes ? options.retriableErrorCodes : ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ESOCKETTIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "EPIPE", "EA_AGAIN"];
    let retriableStatusCodes = options && options.retriableStatusCodes ? options.retriableStatusCodes : [408, 409, 500, 502, 503, 504];
    let timeToWait: number = retryIntervalInSeconds;
    while (true) {
        try {
            if (request.body && typeof (request.body) !== 'string' && !request.body["readable"]) {
                request.body = fs.createReadStream(request.body["path"]);
            }

            let response: WebResponse = await sendRequestInternal(request);
            if (retriableStatusCodes.indexOf(response.statusCode) != -1 && ++i < retryCount) {
                core.debug(util.format("Encountered a retriable status code: %s. Message: '%s'.", response.statusCode, response.statusMessage));
                await sleepFor(timeToWait);
                timeToWait = timeToWait * retryIntervalInSeconds + retryIntervalInSeconds;
                continue;
            }

            return response;
        }
        catch (error) {
            if (retriableErrorCodes.indexOf(error.code) != -1 && ++i < retryCount) {
                core.debug(util.format("Encountered a retriable error:%s. Message: %s.", error.code, error.message));
                await sleepFor(timeToWait);
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
}

export function sleepFor(sleepDurationInSeconds: number): Promise<any> {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, sleepDurationInSeconds * 1000);
    });
}

async function sendRequestInternal(request: WebRequest): Promise<WebResponse> {
    core.debug(util.format("[%s]%s", request.method, request.uri));
    var response: httpClient.HttpClientResponse = await httpCallbackClient.request(request.method, request.uri, request.body, request.headers);
    return await toWebResponse(response);
}

async function toWebResponse(response: httpClient.HttpClientResponse): Promise<WebResponse> {
    var res = new WebResponse();
    if (response) {
        res.statusCode = response.message.statusCode;
        res.statusMessage = response.message.statusMessage;
        res.headers = response.message.headers;
        var body = await response.readBody();
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
}