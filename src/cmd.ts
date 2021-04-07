import { Command } from "commander";
let cmd = new Command();

cmd.command("fulfills <target> <candidate>")
    .description(
        "See if <candidate> fulfills <target>"
    )
    .action((target, candidate, options) => {
        console.log("fulfills");
        handle("fulfills", target, candidate, options);
    });

cmd.command("diff <target> <candidate>")
    .description(
        "Show diff beteen <candidate> and <target>"
    )
    .action((target, candidate, options) => {
        console.log("apply");
        handle("apply", target, candidate, options);
    });

cmd.command("apply <target> <DB>")
    .description(
        "Apply target on DB"
    )
    .action((target, DB, options) => {
        console.log("apply");
        handle("apply", target, DB, options);
    });

cmd.command("reverse <target> <DB>")
    .description(
        "Apply target on DB"
    )
    .action((target, DB, options) => {
        console.log("reverse");
        handle("reverse", target, DB, options);
    });
cmd.parse(process.argv);


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

import { existsSync, readFileSync } from 'fs';
import { load } from 'js-yaml';

export function slurpFile(file: string): string | number | object {
    if (existsSync(file)) {
        let s = readFileSync(file);
        let ejs = file.slice(-5);
        try {
            if (ejs == ".json" || ejs == ".JSON") {
                return JSON.parse(s.toString());
            }
            if (ejs == ".yaml" || ejs == ".YAML") {
                return load(s.toString());
            }
            // No extension match, try the two formats 
            let r = JSON.parse(s.toString());
            if(r) return r;
            r = load(s.toString());
            if(r) return r;
        } catch (e) {
            console.log(`slurpFile ${file}, exception: ${e.toString()}`);
        }
    }
    return null;
}


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

function handle(cmd: string, target: string, candidate: string, options: any) {
    console.log("handle: " + cmd, target, candidate, options);
    //let 
}

