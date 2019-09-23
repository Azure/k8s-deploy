import * as os from 'os';

export function isEqual(str1: string, str2: string) {
    if (!str1) str1 = "";
    if (!str2) str2 = "";
    return str1.toLowerCase() === str2.toLowerCase();
}

export function getRandomInt(max: number) {
    return Math.floor(Math.random() * Math.floor(max));
}

export function getExecutableExtension(): string {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }
    return '';
}

export function getCurrentTime(): number {
    return new Date().getTime();
}
