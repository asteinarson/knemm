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
async function connect(connection: Record<string, string>, client = "pg") {
    let conn = {
        client,
        connection
    }
    knex_conn = knex(conn);
    return knex_conn;
}

let connection = {
    host: 'localhost',
    user: 'directus',
    password: 'psql1234',
    database: 'dir_acct'
};

function slurpSchema(conn: Knex): object {
    return null;
}

function slurpFile(file: string): string | number | object {
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
        } catch (e) {
            console.log("slurpFile, exception: " + e.toString());
        }
    }
    return null;
}


import { existsSync, readFileSync } from 'fs';
import { load } from 'js-yaml';
async function toNestedDict(file_or_db: string): Promise<string | number | object> {
    let conn_info: Record<string, string>;
    if (file_or_db.slice(0, 3) == "db:") {
        // Look for a connection file
        let path = file_or_db.slice(3);
        let r = slurpFile(path);
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
    if (file_or_db == "@") {
        conn_info = connection;
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

