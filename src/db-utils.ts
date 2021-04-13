
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


import { Dict } from "./utils.js";

// column props that are by default true 
const default_true_props: Dict<boolean> = {};

// data type translations 
const data_type_remap: Dict<string> = {
    "timestamp with time zone": "timestamp_tz",
    "timestamp without time zone": "timestamp",
    "character varying": "varchar",
    "integer": "int"
}

// Default values for types, which can be dropped in output 
const default_type_vals: Dict<Dict<string | number>> = {
    varchar: {
        max_length: 255
    },
    int: {
        numeric_precision: 32
    },
    real: {
        numeric_precision: 24
    }
}

import schemaInspector from 'knex-schema-inspector';
export async function slurpSchema(conn: Knex, includes?: (string | RegExp)[], excludes?: (string | RegExp)[])
    : Promise<Record<string, any>> {
    // Workaround for ESM import 
    let sI: any;
    if (typeof schemaInspector != "function") {
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
            if ((typeof e == "string" && tn.indexOf(e) >= 0) ||
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
                    // Simplifications 
                    let type = c.data_type;
                    // Rename some data type ?
                    if (data_type_remap[type]) {
                        c.data_type = data_type_remap[type];
                        type = c.data_type;
                    }
                    // Can drop some default value for datatype ? 
                    if (default_type_vals[type]) {
                        for (let [k, v] of Object.entries(default_type_vals[type])) {
                            if (c[k] == v)
                                delete c[k];
                        }
                    }
                    // Primary keys are always unique
                    if (c.is_primary_key && c.is_unique)
                        delete c.is_unique;
                    // Delete properties set to null or false 
                    for (let k in c) {
                        if (c[k] == null || (c[k] == false && !default_true_props[k]))
                            delete c[k];
                    }
                    // Delete the schema property ? 
                    if (conn.client.config.client == "pg" && c.schema == "public") {
                        delete c.schema;
                        if (c.foreign_key_schema == "public")
                            delete c.foreign_key_schema;
                    }
                    // It is a child node, prune these too
                    delete c.table;
                    t[c.name] = c;
                    delete c.name;
                } else
                    console.log("slurpSchema - column lacks name or datatype: ", c);
            }
        }
    }

    return r;
}

// Apply schema changes on DB. 
// It is assumed here that any changes passed in the 'tables' arg 
// can be applied, i.e. that we have verified before that these are
// valid changes that can be applied, without collisions. 
async function modifySchema(conn: Knex, delta: Dict<any>, state:Dict<any>) {
    for (let t in delta) {
        let tbl_met = state[t] ? conn.schema.alterTable : conn.schema.createTable;
        await tbl_met(t, (table) => {
            for (let col in delta[t]) {
                let col_delta = delta[t][col];
                let col_base:Dict<any> = state[t] ? state[t][col] : {};
                let column: Knex.ColumnBuilder = null;
                switch (col_delta.data_type) {
                    case "boolean":
                    case "bool":
                        column = table.boolean(col);
                        break;
                    case "text":
                        column = table.text(col);
                        break;
                    case "varchar":
                        column = table.string(col, col_delta.max_length ?? 255);
                        break;
                    case "int":
                    case "integer":
                        if( col_delta.has_auto_increment )
                            column = table.increments(col);
                        else 
                            column = table.integer(col);
                        break;
                    case "bigint":
                        if( col_delta.has_auto_increment )
                            column = table.bigIncrements(col);
                        else 
                            column = table.bigInteger(col);
                        break;
                    case "real":
                    case "float":
                        // !! size/precision/bytes not handled here! 
                        column = table.float(col);
                        break;
                    case "decimal":
                        column = table.decimal(col, col_delta.numeric_precision, col_delta.numeric_scale);
                        break;
                    case "text":
                        column = table.text(col);
                        break;
                    case "date":
                        column = table.date(col);
                        break;
                    case "time":
                        column = table.time(col);
                        break;
                    case "datetime":
                        column = table.dateTime(col);
                        break;
                    case "timestamp":
                        column = table.timestamp(col,{useTz:false});
                        break;
                    case "timestamp_tz":
                        column = table.timestamp(col,{useTz:false});
                        break;
                    case "uuid":
                        column = table.uuid(col);
                        break;
                    case "json":
                        column = table.json(col);
                        break;
                    case "jsonb":
                        column = table.jsonb(col);
                        break;
                    default:
                        console.warn(`modifySchema - unhandled datatype - ${col}:${col_delta.data_type}`);
                }
                if( column ){
                    // Add other properties 
                    if( col_delta.is_primary_key ) column.primary();
                    if( col_delta.comment ) column.comment(col_delta.comment);
                    if( col_delta.is_nullable ) column.nullable();
                    if( col_delta.is_unique ) column.unique();
                    if( col_delta.default ) column.defaultTo(col_delta.default);
                }
            }
        });
    }
}

