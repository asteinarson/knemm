
import { Dict, toLut, firstKey, tryGet, errorRv } from './utils.js';

import pkg from 'lodash';
const { invert: ldInvert } = pkg;

let re_enc_needed = /[_ \(\)]/;
let re_dec_needed = /([_]|\\\(|\\\))/;

// Encode: 
let encode_pairs: Dict<string> = {
    "_": "__",
    " ": "_",
    "(": "\\(",
    ")": "\\)"
};
let decode_pairs = ldInvert(encode_pairs);

function string_arg_encode(s: string) {
    if (s.match(re_enc_needed)) {
        for (let k in encode_pairs)
            s = s.replace(k, encode_pairs[k]);
    }
    return s;
}
''
function string_arg_decode(s: string) {
    if (s.match(re_dec_needed)) {
        for (let k in decode_pairs)
            s = s.replace(k, decode_pairs[k]);
    }
    return s;
}


let re_get_args = /^([a-z_A-Z]+)\(([^,]+)(,([^,]+))?\)$/;
import { column_words, getTypeGroup, isNumeric, isString, typeContainsLoose } from './db-props.js';


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
                s = col["*"];
            } else {
                s = table[col_name];
                col = {};
            }
            // Have a string to expand ? 
            if (s) {
                let words = s.split(" ");
                if (words && words.length) {
                    // Do the type and its args 
                    let type = words[0];
                    let md = type.match(re_get_args);
                    if (md) {
                        type = md[1];
                        if (isNumeric(type)) {
                            col.numeric_precision = Number(md[2]);
                            if (md[3]) col.numeric_scale = Number(md[3]);
                        }
                        else if (isString(type))
                            col.max_length = Number(md[2]);
                        else
                            console.warn(`formatInternal(${col_name}) - unknown type args: ${md[0]}`);
                    }
                    col.data_type = type;

                    // Iterate remaining words 
                    for (let ix = 1; ix < words.length; ix++) {
                        let w = words[ix];
                        // Boolean flag ?
                        let w_int = column_words_rev[w];
                        if (w_int) {
                            col[w_int] = true;
                        }
                        else {
                            if (w == "notnull")
                                col.is_nullable = false;
                            else if (w.indexOf("foreign_key(") == 0) {
                                let md = w.match(re_get_args);
                                if (md && md[2] && md[4]) {
                                    col.foreign_key = { table: md[2], column: md[4] }
                                } else console.warn(`formatInternal(${col_name}) - foreign key syntax bad: ${w}`);
                            }
                            else if (w.indexOf("default(") == 0) {
                                let md = w.match(re_get_args);
                                if (md && md[2] && md[4]) {
                                    col.foreign_key_table = md[2];
                                    col.foreign_key_column = md[4];
                                } else console.warn(`formatInternal(${col_name}) - foreign key syntax bad: ${w}`);
                            }
                            else {
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

let column_words_rev = ldInvert(column_words);

// These are tucked as args on the data_type 
let type_args: Array<string> = ["max_length", "numeric_precision", "numeric_scale"];

// Flatten any nested data to strings
export function formatHrCompact(tables: Dict<any>): Dict<any> {
    //let r: Dict<any> = {};
    for (let t in tables) {
        // This is a table  
        let table: Dict<any> = tables[t];
        for (let col_name in table) {
            let col: string | Dict<any> = table[col_name];
            if (typeof col == "object") {
                // We try to flatten it down to a string 
                let words: string[] = [];

                // The type of the column first 
                words.push(col.data_type);
                let done: Dict<number> = { data_type: 1 };

                // Simple boolean flags 
                for (let w in column_words) {
                    if (col[w]) {
                        words.push(column_words[w]);
                        done[w] = 1;
                    }
                }
                // nullable - is true by default 
                if (col.is_nullable != undefined) {
                    words.push("notnull");
                    done.is_nullable = 1;
                }

                // Do any length/precision modifiers 
                let type_nums: number[] = [];
                for (let c of type_args) {
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

                // Handle case of default value 
                let dv = col.default_value
                if (dv) {
                    if (typeof dv == "string") {
                        dv = string_arg_encode(dv);
                    }
                    words.push(`default(${dv})`);
                    done.default_value = 1;
                }
                table[col_name] = words.join(" ");

                // ! We have not yet done the comment 

                // See if we have any unhandled columns - and warn 
                let unhandled = Object.keys(col).filter(prop => !done[prop]);
                if (unhandled.length > 0) {
                    console.warn(`formatHrCompact(${col_name}) - unhandled: ${unhandled}`);
                    // We make a subtree, but keep the default line in key "*" 
                    let small_node: Dict<string> = { "*": table[col_name] };
                    for (let k of unhandled)
                        small_node[k] = col[k];
                    table[col_name] = small_node;
                }
            }
        }
    }
    return tables;
}

