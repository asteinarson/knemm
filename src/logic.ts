
// Remap of column info given by schemaInspector 
let column_remap = {
    data_type: "type",
    default_value: "default",
    foreign_key_table: "fk_table",
    foreign_key_column: "fk_column",
    is_nullable: "nullable",
    is_primary_key: "pk",
    is_unique: "unique",
    has_auto_increment: "auto_inc",
    max_length: "",
    numeric_precision: "precision",
    numeric_scale: "scale",
};

import { Dict, remap } from './utils';
import { slurpFile } from "./file-utils.js";
import { connect, slurpSchema } from './db-utils.js'

export async function toNestedDict(file_or_db: string): Promise<Dict<any>> {
    if (!file_or_db) return null;

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
            return r;
        }
    }

    // Then it should be a file 
    let rf = slurpFile(file_or_db);
    if (!rf) console.log("toNestedDict - file not found: " + file_or_db);
    else {
        if (typeof rf == "object" && !Array.isArray(rf)) {
            r.source = file_or_db;
            r.content = rf;
            return r;
        }
    }
}

