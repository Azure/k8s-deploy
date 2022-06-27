export enum RouteStrategy {
   INGRESS = 'ingress',
   SMI = 'smi',
   SERVICE = 'service'
}

export const parseRouteStrategy = (str: string): RouteStrategy | undefined =>
   RouteStrategy[
      Object.keys(RouteStrategy).filter(
         (k) => RouteStrategy[k].toString().toLowerCase() === str.toLowerCase()
      )[0] as keyof typeof RouteStrategy
   ]
