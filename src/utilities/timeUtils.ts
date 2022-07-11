export function sleep(timeout: number) {
   return new Promise((resolve) => setTimeout(resolve, timeout))
}

export function getCurrentTime(): number {
   return new Date().getTime()
}
