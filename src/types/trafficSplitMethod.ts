export enum TrafficSplitMethod {
   POD = 'pod',
   SMI = 'smi'
}

/**
 * Converts a string to the TrafficSplitMethod enum
 * @param str The traffic split method (case insensitive)
 * @returns The TrafficSplitMethod enum or undefined if it can't be parsed
 */
export const parseTrafficSplitMethod = (
   str: string
): TrafficSplitMethod | undefined =>
   TrafficSplitMethod[
      Object.keys(TrafficSplitMethod).filter(
         (k) =>
            TrafficSplitMethod[k].toString().toLowerCase() === str.toLowerCase()
      )[0] as keyof typeof TrafficSplitMethod
   ]
