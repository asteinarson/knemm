import { Dict, toLut } from './utils.js';
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
                let fkt = col.foreign_key_table, fkc = col.foreign_key_column;
                if (fkt || fkc) {
                    words.push(`foreign_key(${fkt},${fkc})`);
                    done.foreign_key_table = done.foreign_key_column = 1;
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
import { isNumeric, isString } from './db-props.js';

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
                                    col.foreign_key_table = md[2];
                                    col.foreign_key_column = md[4];
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

