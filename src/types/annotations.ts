export function parseAnnotations(str: string) {
   if (str == '') {
      return new Map<string,string>()
   } else {
      const annotation = JSON.parse(str)
      return new Map<string,string>(annotation)
   }
}
