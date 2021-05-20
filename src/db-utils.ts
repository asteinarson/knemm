
// This works for ES module 
import knex, { Knex } from 'knex';

let knex_conns: Dict<Knex> = {};

export async function connect(conn: Record<string, string>) {
    // Make a key to avoid creating several connections for same DB
    let key_parts: string[] = [conn.client];
    for (let w of ["host", "user", "database"]) {
        let v = (conn as any).connection[w];
        if (v) key_parts.push(v);
    }
    let key = key_parts.join(" | ");
    if (knex_conns[key]) return knex_conns[key];

    try {
        let knex_conn = knex(conn);
        if (knex_conn) {
            knex_conns[key] = knex_conn;
            return knex_conn;
        }
    }
    catch (e) {
        console.warn("connect - exception - db key: " + key);
        let x = 1;
    }
}

export async function disconnect(knex_conn: Knex) {
    for (let k in knex_conns) {
        if (knex_conns[k] == knex_conn) {
            try {
                delete knex_conns[k];
                await knex_conn.destroy();
                return true;
            } catch (e) {
                console.warn("connect - exception - key: " + k);
            }
        }
    }
}

let re_extract_quoted = /from([^;]+);?/i;
export function quoteIdentifier(knex_conn: Knex, what: string) {
    // This is roundabout, but I don't find direct way to do it in Knex
    // TODO! We can extract the quote char, store it in a cache, together w connection (or its type)
    let sql = knex_conn.select("*").from(what).toString();
    let md = sql.match(re_extract_quoted);
    return md ? md[1] : "";
}

export function formatValue(v: string | number | boolean | null) {
    if (isString(v)) return `'${v}'`;
    if (isNumber(v)) return `${v}`;
    if (typeof v == "boolean") return v ? "TRUE" : "FALSE";
    return "NULL";
}

export async function disconnectAll() {
    for (let k in knex_conns) {
        await knex_conns[k].destroy();
    }
    knex_conns = {};
}

export async function connectCheck(connection: Record<string, string>) {
    let knex_c = await connect(connection);
    if (!knex_c) return;
    try {
        let conn = connection?.connection as any;
        let r = await knex_c.raw("SELECT 1+1");
        return knex_c;
    }
    catch (e) {
        //console.warn("connectCheck - exception - connection: " + JSON.stringify(connection) );
        let brk = 0;
    }
}

let re_client = /([\w]+)|/;
export function getClientType(ci: Record<string, string> | Knex) {
    for (let k in knex_conns) {
        let conn = knex_conns[k];
        if (conn == ci) {
            // Client type is the first part of the key
            let md = k.match(re_client);
            return md?.[1];
        }
    }
    if (isDict(ci) && ci.client) {
        return ci.client;
    }
}

import { Dict, isDict, isNumber, preferGet } from "./utils";

// column props that are by default true 
const default_true_props: Dict<boolean> = {
    is_nullable: true,
};

// data type translations 
const data_type_remap: Dict<string> = {
    "timestamp with time zone": "timestamp_tz",
    "timestamp without time zone": "timestamp",
    "character varying": "varchar",
    "integer": "int",
    "double precision": "double",
    "numeric": "decimal",
}

// Some datatypes reported by KnexSchemaInspector mean different things,
// for different clients 
const data_type_remap_by_client: Dict<Dict<string>> = {
    pg: {
        real: "float",
    },
    sqlite3: {
        real: "double",
    }
}


// Default values for types, which can be dropped in output 
const default_type_vals: Dict<Dict<string | number>> = {
    varchar: {
        max_length: 255
    },
    text: {
        max_length: 65535
    },
    boolean: {
        numeric_precision: "*"
    },
    int: {
        numeric_precision: "*"
    },
    bigint: {
        numeric_precision: "*"
    },
    decimal: {
        numeric_precision: 8,
        numeric_scale: 2
    },
    float: {
        numeric_precision: "*",
        numeric_scale: "*"
    },
    double: {
        numeric_precision: "*",
        numeric_scale: "*"
    }
}

import schemaInspector from 'knex-schema-inspector';
import { writeFileSync } from 'fs';
import { isString } from 'lodash';
export async function slurpSchema(conn: Knex, xti?: Dict<any>, includes?: (string | RegExp)[], excludes?: (string | RegExp)[])
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
    let client = getClientType(conn);
    let client_type_remap = data_type_remap_by_client[client] || {};
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
                let c_name = c.name;
                delete c.name;
                if (c_name && c.data_type) {
                    // Simplifications 
                    let type = c.data_type;
                    // Map data type ?
                    // Priority to client specific, then general
                    if (client_type_remap[type])
                        type = client_type_remap[type]
                    else if (data_type_remap[type]) {
                        type = data_type_remap[type];
                    }
                    c.data_type = type;    // If mapped above

                    // Do xti replacement ? 
                    let xti_c = xti?.[tn]?.[c_name];
                    if (xti_c?.expect_type == type) {
                        // Add in column properties reported in XTI
                        for (let k in xti_c) {
                            if (k == "expect_type") continue;
                            c[k] = xti_c[k];
                            // Update local var
                            if (k == "data_type") type = c[k];
                        }
                    }

                    // Can drop some default value for datatype ? 
                    if (default_type_vals[type]) {
                        for (let [k, v] of Object.entries(default_type_vals[type])) {
                            if (c[k] == v || v == "*")
                                delete c[k];
                        }
                    }
                    // Primary keys are always unique
                    if (c.is_primary_key) {
                        // For primary keys, these two are implied
                        delete c.is_unique;
                        delete c.is_nullable;
                    }
                    // Delete properties set to null or false (or unnecessarily to true)
                    for (let k in c) {
                        if (c[k] == null || (c[k] == false && !default_true_props[k]))
                            delete c[k];
                        else if (c[k] == true && default_true_props[k])
                            delete c[k];
                    }
                    // Delete the schema property ? 
                    if (client == "pg" && c.schema == "public") {
                        delete c.schema;
                        if (c.foreign_key_schema == "public")
                            delete c.foreign_key_schema;
                    }
                    if (c.default_value) {
                        c.default = c.default_value;
                        delete c.default_value;
                        if (client == "mysql") {
                            // !!BUG!! This is most likely a bug in SchemaInspector 
                            let dv = c.default;
                            if (dv[0] == dv.slice(-1) && dv[0] == "'") {
                                dv = dv.slice(1, -1);
                                c.default = dv;
                            }
                        }
                    }
                    // Make the two foreign key entries a sub table 
                    if (c.foreign_key_table || c.foreign_key_column) {
                        c.foreign_key = { table: c.foreign_key_table, column: c.c.foreign_key_column }
                        delete c.foreign_key_table;
                        delete c.foreign_key_column;
                    }
                    // It is a child node, prune these too
                    delete c.table;
                    t[c_name] = c;
                } else
                    console.warn("slurpSchema - column lacks name or datatype: ", c);
            }
        }
    }

    return r;
}

let double_lut: Dict<string> = {
    pg: "DOUBLE PRECISION",
    mysql: "DOUBLE",
    sqlite3: "REAL"
};

let no_datetime_lut: Dict<1> = {
    pg: 1
};

let xti_lut: Dict<Dict<string | Dict<string>>> = {
    mysql: {
        boolean: "tinyint",
    },
    pg: { datetime: "timestamp_tz" },
    sqlite3: {
        decimal: {
            expect_type: "float",
            numeric_precision: "",
            numeric_scale: "",
        },
        timestamp: "datetime",
    },
};


const invalid_table_names: Dict<1> = {
    ___refs: 1,
}

const invalid_column_names: Dict<1> = {
    ___refs: 1,
}


// Apply schema changes on DB. 
// It is assumed here that any changes passed in the 'tables' arg 
// can be applied, i.e. that we have verified before that these are
// valid changes that can be applied, without collisions. 
// Apart from table names, everything passed down here is assumed to 
// be a change.
export async function modifySchema(conn: Knex, delta: Dict<any>, state: Dict<any>, xtra_type_info?: Dict<any>, to_sql?: boolean | "debug"): Promise<Dict<any> | string> {

    xtra_type_info ||= { ___cnt: 0 };
    let xtra_sql: string[] = [];

    let client = getClientType(conn);
    for (let t in delta) {
        if (invalid_table_names[t]) continue;
        let t_delta = delta[t];
        if (t_delta !== "*NOT") {
            //let tbl_met = state[t] ? conn.schema.alterTable : conn.schema.createTable;
            let qb = conn.schema[state[t] ? "alterTable" : "createTable"](t, (table) => {
                for (let col in delta[t]) {
                    if (invalid_column_names[col]) continue;
                    let col_delta = delta[t][col];
                    const setXtraTypeInfo = (data_type: string, xti: string | Dict<any>) => {
                        xtra_type_info[t] ||= {};
                        let xti_r = (xtra_type_info[t][col] ||= { data_type });
                        if (isDict(xti)) {
                            // Long form, multiple properties are put in XTI
                            for (let k in xti) {
                                let v = xti[k];
                                // "" means store from whatever comes from the diff/claim
                                if (v == "") v = col_delta[k];
                                if (v) {
                                    xti_r[k] = v;
                                    // Keep track of number of changes in it 
                                    xtra_type_info.___cnt++;
                                }
                            }
                        }
                        else {
                            // Just the expect_type is put in XTI
                            xti_r.expect_type = xti;
                            xtra_type_info.___cnt++;
                        }
                    }

                    // Generate an ALTER TABLE ALTER <column>... 
                    const affectColumnSql = (method: "ALTER" | "MODIFY" | "CHANGE", lead: string, value?: any, tail?: string) => {
                        let sql = `ALTER TABLE ${quoteIdentifier(conn, t)} ${method} ${quoteIdentifier(conn, col)} `
                        sql += lead;
                        if (value !== undefined)
                            sql += " " + formatValue(value);
                        if (tail) sql += " " + tail;
                        return sql;
                    }
                    const alterTableSql = (lead: string, ident?: string, tail?: string) => {
                        let sql = `ALTER TABLE ${quoteIdentifier(conn, t)} `;
                        sql += lead;
                        if (ident) sql += ` "${ident}"`;
                        if (tail) sql += " " + tail;
                        return sql;
                    }
                    const alterColumnSql = (lead: string, value?: any, tail?: string) => {
                        return affectColumnSql("ALTER", lead, value, tail);
                    }
                    const modifyColumnSql = (lead: string, value?: any, tail?: string) => {
                        return affectColumnSql("MODIFY", lead, value, tail);
                    }

                    if (col_delta != "*NOT") {
                        const is_new_column = !state[t]?.[col];
                        let col_base: Dict<any> = is_new_column ? {} : state[t][col];
                        let column: Knex.ColumnBuilder = null;
                        // Knex needs to be given the type of the column (also when it already exists)
                        const data_type = col_delta.data_type ?? col_base.data_type;
                        switch (data_type) {
                            case "boolean":
                            case "bool":
                                column = table.boolean(col);
                                break;
                            case "text":
                                column = table.text(col);
                                break;
                            case "varchar":
                                column = table.string(col, col_delta.max_length);
                                break;
                            case "int":
                            case "integer":
                                // !! This is round about, but necessary to work around how Knex generates SQL
                                if (preferGet("has_auto_increment", col_base, col_delta) ||
                                    preferGet("is_primary_key", col_base, col_delta))
                                    column = table.increments(col);
                                else
                                    column = table.integer(col);
                                break;
                            case "bigint":
                                if (preferGet("has_auto_increment", col_delta, col_base))
                                    column = table.bigIncrements(col);
                                else
                                    column = table.bigInteger(col);
                                break;
                            case "float":
                                // For now, assume Knex creates a 32 bit float on all DB:s with these
                                column = table.float(col);
                                break;
                            case "double":
                                // There are some variations between DB clients 
                                let double_type = double_lut[client];
                                double_type ||= "DOUBLE PRECISION";
                                column = table.specificType(col, double_type);
                                break;
                            case "decimal":
                                column = table.decimal(col, col_delta.numeric_precision, col_delta.numeric_scale);
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
                                column = table.timestamp(col, { useTz: false });
                                break;
                            case "timestamp_tz":
                                column = table.timestamp(col, { useTz: true });
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
                        if (column) {
                            // If client does not fully support type, store in XTI 
                            let xti = xti_lut[client]?.[data_type];
                            if (xti)
                                setXtraTypeInfo(data_type, xti);

                            if (!is_new_column) column.alter();

                            // Add other properties 
                            if (col_delta.is_primary_key != undefined) {
                                if (col_delta.is_primary_key) column.primary();
                                else {
                                    // !!BUG!! Knex approach fails for PG
                                    //table.dropPrimary();
                                    let sql: string;
                                    if (client == "pg") xtra_sql.push(alterTableSql("DROP CONSTRAINT ", t + "_pkey"));
                                    else if (client == "mysql") {
                                        let sql = modifyColumnSql(preferGet("data_type", col_delta, col_base));
                                        sql += " NULL, DROP PRIMARY KEY"
                                        xtra_sql.push(sql);
                                    }
                                }
                            }
                            if (col_delta.comment != undefined) {
                                column.comment(col_delta.comment);
                            }
                            if (col_delta.is_unique != undefined) {
                                if (col_delta.is_unique) column.unique();
                                else table.dropUnique([col]);
                            }

                            if (col_delta.is_nullable != undefined) {
                                if (col_delta.is_nullable) column.nullable();
                                else column.notNullable();
                            }
                            else if (!is_new_column && col_base.is_nullable == false)
                                // Have to recreate 
                                column.notNullable();

                            // Since there is an issue w Knex and MySQL, we do this property separately 
                            if (!is_new_column) {
                                let default_v = preferGet("default", col_delta, col_base);
                                if (default_v !== undefined) {
                                    let sql: string;
                                    if (default_v != null) sql = alterColumnSql("SET DEFAULT", default_v);
                                    else sql = alterColumnSql("DROP DEFAULT");
                                    xtra_sql.push(sql);
                                }
                            }
                            else {
                                if (col_delta.default !== undefined)
                                    column.defaultTo(col_delta.default);
                                else if (!is_new_column && col_base.default)
                                    // Have to recreate 
                                    column.defaultTo(col_base.default);
                            }

                            const fk = col_delta.foreign_key;
                            if (fk) {
                                if (typeof fk == "object") {
                                    column.references(fk.column).inTable(fk.table);
                                } else if (fk == "*NOT")
                                    table.dropForeign(col);
                            }
                        }
                    } else {
                        table.dropColumn(col);
                        delete xtra_type_info[t][col];
                    }
                }
            });
            if (to_sql) {
                let sql = qb.toString();
                if (xtra_sql.length)
                    sql += ";\n" + xtra_sql.join(";\n");
                if (to_sql == "debug")
                    writeFileSync("./modifySchema_" + (debug_sql_cnt++) + ".sql", sql);
                else
                    return sql;
            }
            try {
                let r = await qb;
                if (xtra_sql.length) {
                    r = await conn.raw(xtra_sql.join(";\n"));
                }
            } catch (e) {
                console.error("modifySchema - SQL exec exc: " + e.toString());
            }
        }
        else {
            let r = await conn.schema.dropTable(t);
            delete xtra_type_info[t];
        }
    }
    return xtra_type_info;
}

let debug_sql_cnt = 1;