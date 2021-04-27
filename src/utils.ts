import { isObject } from "lodash";

export type Dict<T> = Record<string, T>;
export type BaseTypes = string | number | boolean;


// Invert keys and values of 1-level deep object
export function invert(o: Dict<BaseTypes>) {
    let tgt:Dict<string> = {};
    for (let k in o) {
        let v = o[k];
        if( !isString(v) ) v = v.toString();
        tgt[v] = k;
    }
    return tgt;
}

// With <transl> as a key dictionary, remap the <src> object
// into the <tgt> object
export function remap(src: Dict<any>, transl: Dict<string>, tgt?: Dict<any>) {
    if (!tgt) tgt = {};
    for (let [ks, kt] of Object.entries(transl)) {
        if (src[ks]) {
            tgt[kt ? kt : ks] = src[ks];
        }
    }
    return tgt;
}

export function toLut<T>(keys: string[], v: T | T[]): Dict<T> {
    let r: Dict<T> = {};
    if (Array.isArray(v)) {
        // Set all according to second array, even if length mismatch
        for (let ix in keys) {
            r[keys[ix]] = v[ix];
        }
    } else {
        // Set all to the same
        for (let k of keys) {
            r[k] = v;
        }
    }
    return r;
}

export function tryGet<T>(k: string, dict: Dict<T>, fallback_value?: T) {
    if (typeof dict == "object") {
        let r = dict?.[k];
        return r != undefined ? r : fallback_value;
    }
}

export function firstKey(o: object): any {
    if (typeof o == "object") {
        for (let k in o) {
            if (o.hasOwnProperty(k))
                return k;
        }
    }
}

// Find keys/values in <keys> in <lut>
export function inLut(keys: string[] | Dict<any>, lut: Dict<any>): typeof keys {
    if (Array.isArray(keys)) {
        let r: string[] = [];
        for (let k of keys)
            if (lut[k] != undefined)
                r.push(k);
        return r.length > 0 ? r : null;
    }
    else {
        let r: Dict<number> = {};
        for (let k in keys)
            if (lut[k] != undefined)
                r[k] = 1;
        return firstKey(r) ? r : null;
    }
}

// Find keys/values in <keys> not in <lut>
export function notInLut(keys: string[] | Dict<any>, lut: Dict<any>): typeof keys {
    if (Array.isArray(keys)) {
        let r: string[] = [];
        for (let k of keys)
            if (lut[k]==undefined)
                r.push(k);
        return r.length > 0 ? r : null;
    }
    else {
        let r: Dict<number> = {};
        for (let k in keys)
            if (!lut[k])
                r[k] = 1;
        return firstKey(r) ? r : null;
    }
}

// Let each type contain an 'empty' value (0, "", [], null, {}, ...)
export function isEmpty(v:any){
    if( !v ) return true;
    if( isArray(v) ) return !v.length;
    if( isDict(v) ) return !firstKey(v);
}

export function isString(s: any): s is String {
    return typeof s == "string";
}

export function isNumber(n: any): n is Number {
    return typeof n == "number";
}

export function isDict<T>(o: any): o is Dict<T> {
    return o?.constructor == Object;
}

export function isArray<T>(a: any): a is T[] {
    return Array.isArray(a);
    //return a?.constructor == Array;
}

export function isDictWithKeys(o: any): o is Object {
    return o?.constructor == Object && firstKey(o);
}

export function isArrayWithElems(a: any): a is [] {
    return Array.isArray(a) && a.length > 0;
    //return a?.constructor == Array;
}

export function append<T>(acc: Dict<T> | Array<T>, to_add: typeof acc): typeof acc {
    if (isArray(acc)) {
        for (let e of to_add as T[])
            acc.push(e);
    }
    else {
        for (let k in to_add)
            acc[k] = (to_add as Dict<T>)[k];
    }
    return acc;
}

export function errorRv<RV>(msg: string, rv?: RV): RV {
    console.error(msg);
    return rv;
}

export function warnRv<RV>(msg: string, rv?: RV): RV {
    console.warn(msg);
    return rv;
}

export function logRv<RV>(msg: string, rv?: RV): RV {
    console.log(msg);
    return rv;
}


