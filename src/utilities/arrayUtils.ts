export function createInlineArray(str: string | string[]): string {
   if (typeof str === 'string') {
      return str
   }
   return str.join(',')
}
