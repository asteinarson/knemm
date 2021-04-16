
export type Dict<T> = Record<string, T>;

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

export function tryGet<T>( k:string, dict:Dict<T>, fallback_value?:T ){
    if( typeof dict=="object" ){
        let r = dict[k];
        return r!=undefined ? r : fallback_value;
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

export function errorRv<RV>(msg:string, rv?:RV):RV{
    console.error(msg);
    return rv;
}

export function warnRv<RV>(msg:string, rv?:RV):RV{
    console.warn(msg);
    return rv;
}

export function logRv<RV>(msg:string, rv?:RV):RV{
    console.log(msg);
    return rv;
}


