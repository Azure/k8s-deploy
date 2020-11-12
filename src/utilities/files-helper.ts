'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as os from 'os';

export function getTempDirectory(): string {
    return process.env['runner.tempDirectory'] || os.tmpdir();
}

export function getNewUserDirPath(): string {
    let userDir = path.join(getTempDirectory(), 'kubectlTask');
    ensureDirExists(userDir);

    userDir = path.join(userDir, getCurrentTime().toString());
    ensureDirExists(userDir);

    return userDir;
}

export function ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
}

export function assertFileExists(path: string) {
    if (!fs.existsSync(path)) {
        core.error(`FileNotFoundException : ${path}`);
        throw new Error(`FileNotFoundException:  ${path}`);
    }
}

export function doesFileExist(path: string): boolean {
    if (!fs.existsSync(path)) {
        return false;
    }
    return true;
}

export function writeObjectsToFile(inputObjects: any[]): string[] {
    const newFilePaths = [];

    if (!!inputObjects) {
        inputObjects.forEach((inputObject: any) => {
            try {
                const inputObjectString = JSON.stringify(inputObject);
                if (!!inputObject.kind && !!inputObject.metadata && !!inputObject.metadata.name) {
                    const fileName = getManifestFileName(inputObject.kind, inputObject.metadata.name);
                    fs.writeFileSync(path.join(fileName), inputObjectString);
                    newFilePaths.push(fileName);
                } else {
                    core.debug('Input object is not proper K8s resource object. Object: ' + inputObjectString);
                }
            } catch (ex) {
                core.debug('Exception occurred while writing object to file : ' + inputObject + ' . Exception: ' + ex);
            }
        });
    }

    return newFilePaths;
}

export function writeManifestToFile(inputObjectString: string, kind: string, name: string): string {
    if (inputObjectString) {
        try {
            const fileName = getManifestFileName(kind, name);
            fs.writeFileSync(path.join(fileName), inputObjectString);
            return fileName;
        } catch (ex) {
            core.debug('Exception occurred while writing object to file : ' + inputObjectString + ' . Exception: ' + ex);
        }
    }
    return '';
}

function getManifestFileName(kind: string, name: string) {
    const filePath = kind + '_' + name + '_' + getCurrentTime().toString();
    const tempDirectory = getTempDirectory();
    const fileName = path.join(tempDirectory, path.basename(filePath));
    return fileName;
}

function getCurrentTime(): number {
    return new Date().getTime();
}

