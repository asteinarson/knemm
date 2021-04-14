import { Dict, toLut, firstKey, tryGet } from './utils.js';
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

function string_arg_decode(s: string) {
    if (s.match(re_dec_needed)) {
        for (let k in decode_pairs)
            s = s.replace(k, decode_pairs[k]);
    }
    return s;
}

// short form boolean flags 
let column_words: Dict<string> = {
    is_primary_key: "pk",
    has_auto_increment: "auto",
    is_nullable: "nullable",
    is_unique: "unique",
};

// These are tucked as args on the data_type 
let type_args: Array<string> = ["max_length", "numeric_precision", "numeric_scale"];

// Flatten any nested data to strings
function formatHrCompact(content: Dict<any>): Dict<any> {
    //let r: Dict<any> = {};
    for (let t in content) {
        // This is a table  
        let table: Dict<any> = content[t];
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
    return content;
}

let re_get_args = /^([a-z_A-Z]+)\(([^,]+)(,([^,]+))?\)$/;
import { getTypeGroup, isNumeric, isString } from './db-props.js';

// Expand any nested data flattened to a string  
function formatInternal(content: Dict<any>): Dict<any> {
    for (let t in content) {
        // This is a table  
        let table: Dict<any> = content[t];
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
                            col.numeric_precision = md[2];
                            if (md[3]) col.numeric_scale = md[3];
                        }
                        else if (isString(type))
                            col.max_length = md[2];
                        else
                            console.warn(`formatInternal(${col_name}) - unknown type args: ${md[0]}`);
                    }
                    col.data_type = type;

                    // Iterate remaining words 
                    for (let ix = 1; ix < words.length; ix++) {
                        let w = words[ix];
                        // Bpoolean flag ?
                        if (column_words[w]) col[w] = true;
                        else {
                            if (w.indexOf("foreign_key(") == 0) {
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
    return content;
}

export function reformat(content: Dict<any>, format: "internal" | "hr-compact"): Dict<any> {
    return format == "internal" ? formatInternal(content) : formatHrCompact(content);
}

import { slurpFile } from "./file-utils.js";
import { connect, slurpSchema } from './db-utils.js'

export async function toNestedDict(file_or_db: string, format?: "internal" | "hr-compact"): Promise<Dict<any>> {
    if (!file_or_db) return null;
    if (!format) format = "internal";

    let conn_info: Dict<string>;
    if (file_or_db == "@") {
        // Accept it as a DB specifier / link
        let r = slurpFile("./@");
        if (typeof r == "object") conn_info = r as Dict<string>;
    }
    if (file_or_db.slice(0, 3) == "db:") {
        // Look for a connection file
        let r = slurpFile(file_or_db);
        if (typeof r == "object") conn_info = r as Dict<string>;
    }
    if (file_or_db == "-") {
        // Use ENV vars
        conn_info = {
            host: process.env.HOST,
            user: process.env.USER,
            password: process.env.PASSWORD,
            database: process.env.DATABASE,
        }
    }

    let r: Dict<any> = {};
    // Get our dict from DB conn ? 
    if (conn_info) {
        let client = conn_info.client ? conn_info.client : "pg";
        if (conn_info.connection) conn_info = conn_info.connection as any as Dict<string>;
        let connection = await connect(conn_info, client);
        let rs = await slurpSchema(connection);
        if (rs) {
            // Keep the connection object here - it allows later knowing it is attached to a DB
            r.source = connection;
            r.format = "internal";
            r.content = rs;
        }
    }

    if (!r.content) {
        // Then it should be a file 
        let rf = slurpFile(file_or_db);
        if (!rf) console.log("toNestedDict - file not found: " + file_or_db);
        else {
            if (typeof rf == "object" && !Array.isArray(rf)) {
                r.source = file_or_db;
                r.content = rf;
                r.format = "?";
            }
        }
    }
    if (r.content) {
        if (r.format != format) {
            r.content = reformat(r.content, format);
        }
        return r;
    }
}

type PropType = string | number | Dict<string | number | Dict<string | number>>;
function propCmp(v1:PropType, v2: PropType) {
    if( typeof v1=="string" || typeof v1=="number" ) return v1==v2; 
    if( !v1 ) return v1==v2;
    if( typeof v1=="object" ){
        if( typeof v2!="object" ) return false;
        // Each property of it should be equal 
        for( let k in v1 ){
            if( !propCmp(v1[k],v2[k]) ) 
                return false;
        }
        return true;
    }
}

function diffColumn(cand_col: Dict<any>, tgt_col: Dict<any>): Dict<any> | string[] {
    let r: Dict<any> = {};
    if (!firstKey(cand_col)) {
        // The column does not exist in the candidate, so duplicate all properties 
        // into the diff 
        return { ...tgt_col };
    }

    if (tgt_col.data_type != cand_col.data_type) {
        let tdt = tgt_col.data_type;
        let cdt = cand_col.data_type;
        let tgt_tg = getTypeGroup(tdt);
        let cand_tg = getTypeGroup(cdt);
        // For now, only accept type changes in same type group
        // This also maybe needs additional protection by options, 
        // in order not to easily loose precision in existing 
        // values for the column.
        if (tgt_tg != cand_tg) {
            return [`Target and candidate type group mismatch (cannot alter from ${tdt}(${tgt_tg}) to ${cdt}(${cand_tg})`];
        }
        // If target requests a more narrow (less precision) data type than candidate
        // has, we should keep it, as it is (usually) satisfied then. 
        r.data_type = tdt;
    }
    // Do the remaining target properties 
    for (let tk in tgt_col) {
        if (tk == "data_type") continue;
        if (!propCmp(tgt_col[tk], cand_col[tk])) {
            r[tk] = tgt_col[tk];
        }
    }
    // For properties that are only in candidate, we can keep those, 
    // as target does not oppose them.

    return r;
}

// Generate the DB diff that is needed to go from 'candidate' to 'target'. 
// In a sense, the output is a transition, not a state. (The two inputs are
// states).
export function diff(candidate: Dict<any>, target: Dict<any>): Dict<any> | string[] {
    let r: Dict<any> = {};
    let errors: string[] = [];
    // Iterate tables 
    for (let kt in target) {
        let tgt_table = target[kt];
        let cand_table = tryGet(kt, candidate, {});
        if (typeof tgt_table == "object") {
            // Iterate columns 
            for (let kc in tgt_table) {
                let tgt_col = tgt_table[kc];
                let cand_col = tryGet(kc, cand_table, {});
                let diff_col: Dict<any> | string;
                if (typeof tgt_col == "object") {
                    let dc = diffColumn(cand_col, tgt_col);
                    if (typeof dc == "object") {
                        if (firstKey(dc))
                            diff_col = dc;
                    }
                    else errors = [...errors, ...dc];
                }
                else {
                    if (tgt_col == "*NOT") {
                        // We only need to generate this if the table exists in the candidate
                        if (!firstKey(cand_col) && cand_col != "*NOT")
                            diff_col = "*NOT";
                    }
                }
                if (diff_col) {
                    if (!r[kt]) r[kt] = {};
                    r[kt][kc] = diff_col;
                }
            }
        } else {
            if (tgt_table == "*NOT") {
                // We only need to generate this if the table exists in the candidate
                if (cand_table && cand_table[kt] && cand_table[kt] != "*NOT")
                    r[kt] = "*NOT";
            }
        }
    }
    return errors ? errors : r;
}

