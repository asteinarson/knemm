
// This works for ES module 
import knex, { Knex } from 'knex';

let knex_conn: Knex;
export async function connect(connection: Record<string, string>, client = "pg") {
    let conn = {
        client,
        connection
    }
    knex_conn = knex(conn);
    return knex_conn;
}


export async function slurpSchema(conn: Knex): Promise<Record<string, any>> {
    return null;
}

import { slurpFile } from "./file-utils.js";
export async function toNestedDict(file_or_db: string): Promise<Record<string, any>> {
    if( !file_or_db ) return null;

    let conn_info: Record<string, string>;
    if (file_or_db == "@") {
        // Accept it as a DB specifier / link
        let r = slurpFile("./@");
        if (typeof r == "object") conn_info = r as Record<string, string>;
    }
    if (file_or_db.slice(0, 3) == "db:") {
        // Look for a connection file
        let r = slurpFile(file_or_db);
        if (typeof r == "object") conn_info = r as Record<string, string>;
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
    if (conn_info) {
        let client = conn_info.client ? conn_info.client : "pg";
        if (conn_info.connection) conn_info = conn_info.connection as any as Record<string, string>;
        let connection = await connect(conn_info, client);
        let r = await slurpSchema(connection);
        if (r) {
            // Keep the connection object here - it allows later knowing it is attached to a DB
            r["*connection"] = connection;
            return r;
        }
    }

    // See if it is a file
    let r = slurpFile(file_or_db);
    if (!r) console.log("toNestedDict - file not found: " + file_or_db);
    else {
        if (typeof r == "object" && !Array.isArray(r)) {
            return r;
        }
    }
}

