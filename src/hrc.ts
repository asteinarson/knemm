
import { invert as ldInvert, Dict, firstKey, notInLut } from './utils';

import { multiReplace } from "./str-utils";

//let re_enc_needed = /[_ \(\)]/;
//let re_dec_needed = /([_]|\\\(|\\\))/;
let re_enc_needed = /[_ ]/;
let re_dec_needed = /_/;

// Encode: 
let encode_pairs: Dict<string> = {
    "_": "__",
    " ": "_",
    //"(": "\\(",
    //")": "\\)"
};
let decode_pairs = ldInvert(encode_pairs);

function string_arg_encode(s: string) {
    if (s.match(re_enc_needed))
        s = multiReplace(s, encode_pairs);
    return s;
}

function string_arg_decode(s: string) {
    if (s.match(re_dec_needed))
        s = multiReplace(s, decode_pairs);
    return s;
}


let re_get_args = /^([a-z_A-Z]+)\(([^,]+)(,([^,]+))?\)$/;
import { all_data_types, db_column_flags, db_type_args, db_with_args, isNumeric, isString } from './db-props';

let rhs_directives:Dict<1> = {
    "*NOT": 1, 
    "*UNREF": 1
}

// Expand any nested data flattened to a string  
export function formatInternal(tables: Dict<any>): Dict<any> {
    for (let t in tables) {
        // This is a table  
        let table: Dict<any> = tables[t];
        for (let col_name in table) {
            let col: Dict<any>;
            let s: string;
            if (typeof table[col_name] == "object") {
                col = table[col_name];
                s = col?.["*"];
            } else {
                s = table[col_name];
                if( rhs_directives[s] ) continue;
                col = {};
            }
            // Have a string to expand ? 
            if (s) {
                let words = s.split(" ");
                if (words && words.length) {
                    // Have a type first ? 
                    let ix_first = 0;
                    let type = words[0];
                    let md = type.match(re_get_args);
                    if( md ) type = md[1];
                    if( all_data_types[type] ){
                        ix_first = 1;
                        if (md) {
                            if (isNumeric(type)) {
                                col.numeric_precision = Number(md[2]);
                                if (md[4]) col.numeric_scale = Number(md[4]);
                            }
                            else if (isString(type))
                                col.max_length = Number(md[2]);
                            else
                                console.warn(`formatInternal(${col_name}) - unknown type args: ${md[0]}`);
                        }
                        col.data_type = type;
                    }

                    // Iterate remaining words 
                    for (let ix = ix_first; ix < words.length; ix++) {
                        let w = words[ix];
                        // Boolean flag ?
                        let w_int = db_column_flags_rev[w];
                        if (w_int) {
                            col[w_int] = true;
                        }
                        else if (w == "not_null")
                            col.is_nullable = false;
                        else {
                            // See if keyword w args 
                            let md = w.match(re_get_args);
                            if (md) {
                                if (md[1] == "foreign_key") {
                                    if (md[2] && md[4]) {
                                        col.foreign_key = { table: md[2], column: md[4] }
                                    }
                                    else console.warn(`formatInternal(${col_name}) - foreign key syntax bad: ${w}`);
                                }
                                else {
                                    let w_rev = db_with_args_rev[md[1]];
                                    if (w_rev) {
                                        if (md[2]) col[w_rev] = string_arg_decode(md[2]);
                                        else console.warn(`formatInternal(${col_name}) - expected arg for: ${w}`);
                                    }
                                    else md = null;
                                }
                            }
                            if (!md) {
                                console.warn(`formatInternal(${col_name}) - unknown word: ${w}`);
                            }
                        }
                    }
                    table[col_name] = col;
                }
                else console.warn(`formatInternal(${col_name}) - no string value: ${s}`);
            }
        }
    }
    return tables;
}

let db_column_flags_rev = ldInvert(db_column_flags);
let db_with_args_rev = ldInvert(db_with_args);

// Flatten any nested data to strings
export function formatHrCompact(tables: Dict<any>): Dict<any> {
    //let r: Dict<any> = {};
    for (let t in tables) {
        // This is a table  
        let table: Dict<any> = tables[t];
        for (let col_name in table) {
            // !! We should maybe have a flag of what to skip here 
            if( col_name=="___branch" || col_name=="___refs" ){
                delete table[col_name];
                continue;
            }
            //if( col_name.slice(0,3)=="___" ) continue;
            
            let col: string | Dict<any> = table[col_name];
            if (typeof col == "object") {
                // We try to flatten it down to a string 
                let words: string[] = [];

                // The type of the column first 
                words.push(col.data_type);
                let done: Dict<number> = { data_type: 1 };

                // Simple boolean flags 
                for (let w in db_column_flags) {
                    if (col[w]) {
                        words.push(db_column_flags[w]);
                        done[w] = 1;
                    }
                }
                // nullable - is true by default 
                if (col.is_nullable != undefined) {
                    if (col.is_nullable == false)
                        words.push("not_null");
                    done.is_nullable = 1;
                }

                // Do any length/precision modifiers 
                let type_nums: number[] = [];
                for (let c in db_type_args) {
                    if (col[c]) {
                        type_nums.push(col[c]);
                        done[c] = 1;
                    }
                }
                if (type_nums.length) {
                    words[0] += `(${type_nums.join(",")})`;
                }

                // Do foreign key 
                let fk = col.foreign_key;
                if (fk) {
                    if (typeof fk == "object") {
                        words.push(`foreign_key(${fk.table},${fk.column})`);
                    }
                    done.foreign_key = 1;
                }

                // Handle case of <default> and <comment> values 
                for (let kw in db_with_args) {
                    let v = col[kw];
                    if (v) {
                        if (typeof v == "string") {
                            v = string_arg_encode(v);
                        }
                        words.push(`${db_with_args[kw]}(${v})`);
                        done[kw] = 1;
                    }
                }
                table[col_name] = words.join(" ");

                // ! Suppress ___refs (for now)
                done.___refs = 1;
                
                // See if we have any unhandled columns - and warn 
                //let unhandled = Object.keys(col).filter(prop => !done[prop]);
                let unhandled = notInLut(col, done);
                if (firstKey(unhandled,"___branch")) {
                    console.warn(`formatHrCompact(${col_name}) - unhandled: ${JSON.stringify(unhandled)}`);
                    // We make a subtree, but keep the default line in key "*" 
                    let small_node: Dict<string> = { };
                    if( table[col_name] ) small_node["*"] = table[col_name];
                    for (let k in unhandled)
                        small_node[k] = col[k];
                    table[col_name] = small_node;
                }
            }
        }
    }
    return tables;
}

