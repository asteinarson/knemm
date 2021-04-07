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
import {toNestedDict} from './db-utils.js';

async function handle(cmd: string, target: string, candidate: string, options: any) {
    console.log("handle: " + cmd, target, candidate, options);
    let tgt_o = await toNestedDict(target);
    let cand_o = await toNestedDict(candidate);
    console.log("tgt_o", tgt_o);
    console.log("cand_o", cand_o);
}

