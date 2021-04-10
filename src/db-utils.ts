
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


// column props that are by default true 
import {Dict} from "./utils.js";
const default_true_props:Dict<boolean> = {}; 

import schemaInspector from 'knex-schema-inspector';
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
                    // Simplifications 
                    if( c.data_type=='integer' && c.numeric_precision==32 ) 
                        delete c.numeric_precision; 
                    if( c.is_primary_key && c.is_unique )
                        delete c.is_unique;
                    // Delete properties set to null or false 
                    for( let k in c ){
                        if( c[k]==null || (c[k]==false && !default_true_props[k]) )
                            delete c[k];
                    }
                    // Delete the schema property ? 
                    if( conn.client.config.client=="pg" && c.schema=="public" )
                        delete c.schema;
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


