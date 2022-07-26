export function parseAnnotations(str: string) {
   if (str == '') {
      return {}
   } else {
      const annotaion = JSON.parse(str)
      return new Map(annotaion)
   }
}
