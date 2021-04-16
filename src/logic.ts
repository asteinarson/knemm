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
''
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
    is_unique: "unique",
};

let column_words_rev = ldInvert(column_words);

// These are tucked as args on the data_type 
let type_args: Array<string> = ["max_length", "numeric_precision", "numeric_scale"];

// Flatten any nested data to strings
function formatHrCompact(tables: Dict<any>): Dict<any> {
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

let re_get_args = /^([a-z_A-Z]+)\(([^,]+)(,([^,]+))?\)$/;
import { getTypeGroup, isNumeric, isString, typeContainsLoose } from './db-props.js';

// Expand any nested data flattened to a string  
function formatInternal(tables: Dict<any>): Dict<any> {
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

export function reformat(tables: Dict<any>, format: "internal" | "hr-compact"): Dict<any> {
    return format == "internal" ? formatInternal(tables) : formatHrCompact(tables);
}

import { slurpFile } from "./file-utils.js";
import { connect, slurpSchema } from './db-utils.js'
import { existsSync } from 'fs';

// Read a file, a directory or a DB into a schema state object
export async function toNestedDict(file_or_db: string, options: Dict<any>, format?: "internal" | "hr-compact"): Promise<Dict<any>> {
    if (!file_or_db) return null;
    if (!format) format = "internal";

    let conn_info: Dict<string>;
    if (file_or_db == "@" || file_or_db.slice(0, 2) == "s:") {
        // This means current/given state 
        let state_dir: string;
        if (file_or_db == "@") {
            if (options.state == false) {
                console.error("toNestedDict - Cannot resolve default state (@)");
                return;
            }
            state_dir = options.state || "./.dbstate";
        }
        else state_dir = file_or_db.slice(2);
        if (!existsSync(state_dir)) {
            console.error(`toNestedDict - State dir does not exist: ${state_dir}`);
            return;
        }
    }
    else if (file_or_db.slice(0, 3) == "db:") {
        // Look for a connection file - or use ENV vars 
        if (file_or_db.slice(3) != "%") {
            let r = slurpFile(file_or_db);
            if (typeof r == "object") conn_info = r as Dict<string>;
        } else {
            // '%' means use ENV vars
            conn_info = {
                host: process.env.HOST,
                user: process.env.USER,
                password: process.env.PASSWORD,
            }
            if (process.env.DATABASE)
                conn_info.database = process.env.DATABASE;
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
            r["*tables"] = rs;
        }
    }

    if (!r["*tables"]) {
        // Then it should be a file 
        let rf = slurpFile(file_or_db);
        if (!rf) console.log("toNestedDict - file not found: " + file_or_db);
        else {
            if (typeof rf == "object" && !Array.isArray(rf)) {
                r.source = file_or_db;
                r["*tables"] = rf;
                r.format = "?";
            }
        }
    }
    if (r["*tables"]) {
        if (r.format != format) {
            r["*tables"] = reformat(r["*tables"], format);
        }
        return r;
    }
}

type PropType = string | number | Dict<string | number | Dict<string | number>>;
function propEqual(v1: PropType, v2: PropType) {
    if (typeof v1 == "string" || typeof v1 == "number" || typeof v1 == "boolean") return v1 == v2;
    if (!v1) return v1 == v2;
    if (typeof v1 == "object") {
        if (typeof v2 != "object") return false;
        // Each property of it should be equal 
        for (let k in v1) {
            if (!propEqual(v1[k], v2[k]))
                return false;
        }
        return true;
    }
}

// This generates the smallest diff that can adapt the candidate to fulfill 
// the target specification. Or an array of errors, if not possible. 
function matchDiffColumn(col_name: string, cand_col: Dict<any>, tgt_col: Dict<any>): Dict<any> | string[] {
    let r: Dict<any> = {};
    let errors: string[] = [];

    if (!firstKey(cand_col)) {
        // The column does not exist in the candidate, so duplicate all properties 
        // into the diff 
        return { ...tgt_col };
    }

    for (let tk in tgt_col) {
        // If property is different, we need to do something 
        let tv = tgt_col[tk], cv = cand_col[tk];
        if (!propEqual(tv, cv)) {
            switch (tk) {
                case "data_type":
                    if (!typeContainsLoose(cv, tv)) {
                        // The candidate type does not hold, see if we can expand it 
                        if (typeContainsLoose(tv, cv))
                            r.data_type = tv;
                        else
                            errors.push(`${col_name} - Types are not compatible: ${cv}, ${tv} `);
                    }
                    break;
                case "is_nullable":
                    if (tv) {
                        // We can safely go from notNullable => nullable
                        if (cv == false)
                            r.is_nullable = true;
                    }
                    else errors.push(`${col_name} - Cannot safely go from notNullable => nullable `);
                    break;
                case "is_unique":
                    if (!tv) {
                        // We can safely drop unique constraint 
                        if (cv)
                            r.is_unique = false;
                    }
                    else errors.push(`${col_name} - Cannot safely go to unique `);
                    break;
                case "is_primary_key":
                    // We can actually go both ways here - w.o data loss 
                    if (tv || cv == true) {
                        r.is_primary_key = tv;
                    }
                    break;
                case "has_auto_increment":
                    // We can actually go both ways here - w.o data loss 
                    if (tv) {
                        r.has_auto_increment = true;
                    }
                    else errors.push(`${col_name} - Not possible to remove auto_increment. Drop the primary key instead`);
                    break;
                case "default":
                    // We can always set a default 
                    r.default = tv;
                    break;
                case "foreign_key":
                    // Accept if candidate does not specify another foreign key 
                    if (tv) {
                        if (!cv) {
                            // It would be good to first check for existense of table:column
                            r.foreign_key = tv;
                        }
                        else errors.push(`${col_name} - Foreign key info mismatch: ${cv.table}:${cv.column} => ${tv.table}:${tv.column}`);
                    }
                    break;
                default:
                    errors.push(`${col_name} - Unhandled column keyword: ${tk}`);
            }
        }
    }

    // For properties that are only in candidate, we can keep those, 
    // as target does not oppose them.

    return errors.length > 0 ? errors : r;
}

// Generate the DB diff that is needed to go from 'candidate' to 'target'. 
// In a sense, the output is a transition, not a state. (The two inputs are
// states).
export function matchDiff(candidate: Dict<any>, target: Dict<any>): Dict<any> | string[] {
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
                    let dc = matchDiffColumn(kc, cand_col, tgt_col);
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
    return errors.length ? errors : r;
}

let re_name_num_ext = /^(.*)\.([\d]+)\.[a-zA-Z_-]+$/;
let re_name_ext = /^(.*)\.[a-zA-Z_-]+$/;

function getClaimId(name: string, claim: Dict<any>): [string, (number | undefined)?] {
    if (claim.id) {
        if (typeof claim.id == "object")
            return [claim.id.name.toString(), Number(claim.id.version)];
        else {
            if (typeof claim.id != "string") {
                console.error(`getClaimId: Unhandled claim ID type: ${name}:${typeof claim.id}`);
                return;
            }
            // Assume it is a string like: invoice.14
            // Let the code below do the work 
            name = claim.id + ".yaml";
        }
    }
    // Name plus version ? 
    let md = name.match(re_name_num_ext);
    if (md)
        return [md[1], Number(md[2])];
    // Then only a name
    md = name.match(re_name_ext);
    if (md)
        return [md[1]];
}

// Sort input trees according to dependency specification 
export function dependencySort(file_dicts: Dict<Dict<any>>, options: Dict<any>) {
    let deps: Dict<Dict<any>[]> = {};
    for (let f in file_dicts) {
        let claim = file_dicts[f];

    }
}


export function merge(): Dict<any> | string[] {

    return null;
}
