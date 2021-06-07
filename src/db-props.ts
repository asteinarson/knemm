
import { append, Dict, tryGet } from './utils';

// short form boolean flags 
export let db_column_flags: Dict<string> = {
    is_primary_key: "pk",
    has_auto_increment: "auto_inc",
    is_unique: "unique",
};

// These are tucked as args on the data_type 
export let db_type_args: Dict<number> = {
    max_length: 1,
    numeric_precision: 1,
    numeric_scale: 1,
};

// These are tucked as args on the data_type 
export let db_types_with_args: Dict<1> = {
    varchar: 1,
    decimal: 1,
};

// These are other props with (string?) args 
export let db_with_args: Dict<string> = {
    comment: "comment",
    default: "default",
    //ref_data_type: "ref",
};

export let db_column_words: Dict<string | number> = {
    data_type: 1,
    ...db_column_flags,
    ...db_type_args,
    ...db_with_args,
    is_nullable: 1,
    foreign_key: 1,
};

// These properties can be held (locked) by a reference
export let db_ref_lockable: Dict<any> = {
    ...db_column_flags,
    is_nullable: 1,
    foreign_key: 1,
    ...db_with_args
};

export let db_always_declarable: Dict<any> = {
    data_type: 1,
    is_nullable: 1,
    ...db_with_args
};

export let db_create_non_trivial: Dict<any> = {
    has_auto_increment: 1,
    foreign_key: 1,
};

export const db_may_auto_increment: Dict<1> = {
    smallint: 1, int: 1, bigint: 1,
    smallint_u: 1, int_u: 1, bigint_u: 1,
};

// The valid (and different) base numeric types 
export const numerics_w_smallint: Dict<1> = {
    ...db_may_auto_increment,
    float: 1, double: 1,
    decimal: 1,
};
export const numerics: Dict<1> = {
    int: 1, bigint: 1,
    int_u: 1, bigint_u: 1,
    float: 1, double: 1,
    decimal: 1,
};

const strings: Dict<1> = { text: 1, varchar: 1 };

const datetimes: Dict<1> = { date: 1, time: 1, datetime: 1, timestamp: 1, timestamp_tz: 1 };

const other_types: Dict<1> = { boolean: 1, json: 1, jsonb: 1, uuid: 1 };

export let all_data_types: Dict<1> = append({}, datetimes, strings, numerics, other_types);

export function isNumeric(t: string) {
    return numerics[t];
}

export function isString(t: string) {
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
    //decimal: "numeric",
    //double: "float"
};

let num_type_tree_loose: Dict<any> = {
    decimal: {
        double: 1
    },
    double: {
        float: 1,
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
    float: {
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
    t1 = tryGet(t1, type_synonyms, t1);
    t2 = tryGet(t2, type_synonyms, t2);
    if (t1 == t2) return true;
    const tg1 = getTypeGroup(t1);
    const tg2 = getTypeGroup(t2);
    if (tg1 == tg2) {
        if (tg1 == "numeric") {
            return typeTreeContains(t1, t2, num_type_tree_loose);
        }
        if (tg1 == "datetime") {
            return typeTreeContains(t1, t2, datetime_type_tree_loose);
        }
        if (tg1 == "text") {
            return t1 == "text";
        }
        if (tg1 == "json") return true;
    }
}
