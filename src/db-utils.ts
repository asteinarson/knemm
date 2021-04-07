
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


export function slurpSchema(conn: Knex): object {
    return null;
}

import {slurpFile} from "./file-utils";
export async function toNestedDict(file_or_db: string): Promise<string | number | object> {
    let conn_info: Record<string, string>;
    if (file_or_db == "@") {
        // Accept it as a file / link
        let r = slurpFile("./@");
        if (typeof r == "object") conn_info = r as Record<string, string>;
    }
    if (file_or_db.slice(0, 3) == "db:") {
        // Look for a connection file
        let r = slurpFile(file_or_db.slice(3));
        if (typeof r == "object") conn_info = r as Record<string, string>;
    }
    if (file_or_db == "-") {
        // Use ENV vars
        let conn_info = {
            host: process.env.HOST,
            user: process.env.USER,
            password: process.env.PASSWORD,
            database: process.env.DATABASE,
        }
    }
    if (conn_info) {
        let client = conn_info.client ? conn_info.client : "pg";
        let connection = conn_info.connection ? conn_info.connection as any as Record<string, string> : conn_info;
        return slurpSchema(await connect(connection, client));
    }

    // See if it is a file
    let r = slurpFile(file_or_db);
    if (!r) console.log("toNestedDict - file not found: " + file_or_db);
    return r;
}

