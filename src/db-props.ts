
import { Dict, tryGet } from './utils.js';

// The valid (and different) base numeric types 
const numerics: Dict<number> = {
    smallint: 1, int: 1, bigint: 1,
    smallint_u: 1, int_u: 1, bigint_u: 1,
    float: 1, real: 1,
    decimal: 1, numeric: 1,
};

// In type comparisons, replace these before starting 
const type_synonyms = {
    integer: "int",
    decimal: "numeric",
    double: "float"
};

const strings: Dict<number> = { text: 1, varchar: 1 };

const datetimes: Dict<number> = { date: 1, time: 1, datetime: 1, timestamp: 1, timestamp_tz: 1 };

export function getTypeGroup(type: string): "numeric" | "text" | "json" | "datetime" | "boolean" | "uuid" {
    type = tryGet(type, type_synonyms, type);
    if (numerics[type]) return "numeric";
    if (strings[type]) return "text";
    if (datetimes[type]) return "datetime";
    if (type == "json" || type == "jsonb") return "json";
    if (type == "boolean") return "boolean";
    if (type == "uuid") return "uuid";
    return null;
}

let num_type_tree_loose: Dict<any> = {
    numeric: {
        float: 1
    },
    float: {
        real: 1,
        int: 1,
    },
    bigint: {
        int: 1,
        bigint_u: 1
    },
    bigint_u: {
        int_u: 1,
    },
    int: {
        smallint: 1,
        int_u: 1
    },
    int_u: {
        smallint_u: 1,
    },
    real: {
        smallint: 1
    },
    smallint: {
        smallint_u: 1,
    },
}

function typeTreeContains(t_outer: string, t_inner: string, type_dict: Dict<any>) {
    let outer = type_dict[t_outer];
    if (!outer) return false;
    if (outer[t_inner]) return true;
    for (let k in outer) {
        if (typeTreeContains(k, t_inner, type_dict)) return true;
    }
    return false;
}

function adjustNumTypeLoose(t: string) {
    t = t.toLowerCase();
    // According to PG docs
    if (t == "decimal") return "numeric";
    return t;
}

export function numTypeContains(t1: string, t2: string) {
    t1 = adjustNumTypeLoose(t1);
    t2 = adjustNumTypeLoose(t2);
    if (t1 == t2) return true;
    if (typeTreeContains(t1, t2, num_type_tree_loose)) return true;
}


export function typeContains(t1: string, t2: string) {
    const tg1 = getTypeGroup(t1);
    const tg2 = getTypeGroup(t2);
    if (tg1 == tg2) {

    }
}
