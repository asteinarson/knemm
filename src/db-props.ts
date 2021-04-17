
import { Dict, tryGet } from './utils.js';

// The valid (and different) base numeric types 
const numerics_w_smallint: Dict<number> = {
    smallint: 1, int: 1, bigint: 1,
    smallint_u: 1, int_u: 1, bigint_u: 1,
    float: 1, real: 1,
    decimal: 1, numeric: 1,
};
const numerics: Dict<number> = {
    int: 1, bigint: 1,
    int_u: 1, bigint_u: 1,
    float: 1, real: 1,
    decimal: 1, numeric: 1,
};

const strings: Dict<number> = { text: 1, varchar: 1 };

const datetimes: Dict<number> = { date: 1, time: 1, datetime: 1, timestamp: 1, timestamp_tz: 1 };

export function isNumeric(t:string){
    return numerics[t];
}

export function isString(t:string){
    return strings[t];
}

export function getTypeGroup(type: string): "numeric" | "datetime" | "text" | "json" | "boolean" | "uuid" {
    type = tryGet(type, type_synonyms, type);
    if (numerics[type]) return "numeric";
    if (strings[type]) return "text";
    if (datetimes[type]) return "datetime";
    if (type == "json" || type == "jsonb") return "json";
    if (type == "boolean") return "boolean";
    if (type == "uuid") return "uuid";
    return null;
}

// In type comparisons, replace these before starting 
const type_synonyms = {
    integer: "int",
    decimal: "numeric",
    double: "float"
};


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

let datetime_type_tree_loose: Dict<any> = {
    timestamp_tz: {
        timestamp: 1,
        time_tz: 1,
    },
    time_tz: {
        time: 1,
    },
    timestamp: {
        date: 1,
    },
}

// See if a type tree gives that the outer type contains the inner 
function typeTreeContains(t_outer: string, t_inner: string, type_dict: Dict<any>) {
    let outer = type_dict[t_outer];
    if (outer) {
        if (outer[t_inner]) return true;
        for (let k in outer) {
            if (typeTreeContains(k, t_inner, type_dict))
                return true;
        }
    }
}

// The 'Loose' suffix is here used in the meaning in "what works
// under most common(normal) circumstances" - i.e. it does does not 
// assume to hold under all corner cases. An example is the type 
// 'int' which is said to contain 'int_u'. Of course, it only holds
// for unsigned integers up to 2^31. But if we regularly (normally) 
// start to store larger integers beyond that, in such a column, we 
// normally would have considered migrating to 'bigint' by then. 
export function typeContainsLoose(t1: string, t2: string) {
    t1 = tryGet(t1,type_synonyms,t1);
    t2 = tryGet(t2,type_synonyms,t2);
    if( t1==t2 ) return true;
    const tg1 = getTypeGroup(t1);
    const tg2 = getTypeGroup(t2);
    if (tg1 == tg2) {
        if( tg1=="numeric"){
            return typeTreeContains(t1,t2,num_type_tree_loose);
        }
        if( tg1=="datetime" ){
            return typeTreeContains(t1,t2,datetime_type_tree_loose);
        }
        if( tg1=="text" ){
            return t1=="text";
        }
        if( tg1=="json" ) return true;
    }
}
