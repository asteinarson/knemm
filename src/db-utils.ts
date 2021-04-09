
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

function remap(src: Record<string, any>, transl: Record<string, string>, tgt?: Record<string, any>) {
    if (!tgt) tgt = {};
    for (let [ks, kt] of Object.entries(transl)) {
        if (src[ks]) {
            tgt[kt ? kt : ks] = src[ks];
        }
    }
    return tgt;
}

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

import schemaInspector from 'knex-schema-inspector';
import {} from 'knex-schema-inspector';
export async function slurpSchema(conn: Knex, includes?: (string | RegExp)[], excludes?: (string | RegExp)[])
    : Promise<Record<string, any>> {
    // Workaround for ESM import 
    let sI:any;
    if( typeof schemaInspector!="function" ){
        sI = (schemaInspector as any).default(conn);        
    } else {
        sI = schemaInspector(conn);
    }
    //console.log("si-log: ", typeof sI, sI );

    if (!excludes) {
        excludes = ["directus_"];
    }

    // Do each table
    let r: Record<string, any> = {};
    let tables = await sI.tables();
    for (let tn of tables) {
        let do_exclude = false;
        for (let e of excludes) {
            if ((typeof e == "string" && tn.indexOf(e)>=0) ||
                (e instanceof RegExp && tn.match(e))) {
                do_exclude = true;
                break;
            }
        }
        if (!do_exclude) {
            // Included, so add a node for this table. 
            let t: Record<string, any> = {};
            r[tn] = t;
            // Do each column 
            let columns = await sI.columnInfo(tn);
            for (let c of columns) {
                if (c.name && c.data_type) {
                    // See if there is anything apart from type in it 
                    let cnt = Object.values(c).reduce((cnt:number, e) => (e ? cnt + 1 : cnt), 0);
                    if (cnt <= 2)
                        t[c.name] = c.data_type;
                    else
                        t[c.name] = remap(c, column_remap);
                } else
                    console.log("slurpSchema - column lacks name or datatype: ", c);
            }
        }
    }

    return r;
}


import { slurpFile } from "./file-utils.js";
export async function toNestedDict(file_or_db: string): Promise<Record<string, any>> {
    if (!file_or_db) return null;

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

    let r:Record<string,any> = {};
    // Get our dict from DB conn ? 
    if (conn_info) {
        let client = conn_info.client ? conn_info.client : "pg";
        if (conn_info.connection) conn_info = conn_info.connection as any as Record<string, string>;
        let connection = await connect(conn_info, client);
        let rs = await slurpSchema(connection);
        if (rs) {
            // Keep the connection object here - it allows later knowing it is attached to a DB
            r.source = connection;
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

