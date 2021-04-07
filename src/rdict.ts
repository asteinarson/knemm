
export type RDValue = number | string | boolean;
export type RDict = RDValue | {[name:string]: RDict} | RDict[];

