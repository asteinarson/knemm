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

function handle(cmd: string, target: string, candidate: string, options: any) {
    console.log("handle: " + cmd, target, candidate, options);
    //let 
}

