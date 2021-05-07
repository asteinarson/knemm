
import cmder, { Command } from "commander";

function addOutputOption(cmd: cmder.Command) {
    cmd.option("-o --outfile <new_db_file>", "Outputs a new DB file for the created database");
}

function addCreatedbOptions(cmd: cmder.Command) {
    cmd.option("--replace", "Together with a state (-s), instructs to replace the current db connection");
    addOutputOption(cmd);
}

import { CmdDesc, addBaseOptions } from './cmd-handlers';

let cmds_db: CmdDesc[] = [
    {
        name: "echo",
        desc: "Echoes back connection info that would be used",
        a1: "db_spec",
        a2: "name_of_db",
        options: [addOutputOption]
    },
    {
        name: "exists",
        desc: "Checking if a DB exists",
        a1: "db_spec",
        a2: "name_of_db",
        options: []
    },
    {
        name: "create",
        desc: "Create a DB (after checking for existence), and optionally connect with a state",
        a1: "db_spec",
        a2: "*name_of_new_db",
        options: [addBaseOptions, addCreatedbOptions]
    },
    {
        name: "drop",
        desc: "Drop a DB (after checking for existence), and optionally disconnect from a state",
        a1: "db_spec",
        a2: "*name_of_db",
        options: [addBaseOptions]
    }
];

// Read .env 
//import dotenv from "dotenv";
import * as dotenv from 'dotenv'
dotenv.config();

import { handleDbCmd } from "./cmd-handlers"

let cmd = new Command();
for (let c of cmds_db) {
    let _c: cmder.Command;
        let cmd_str = `${c.name} <${c.a1}> `;
        if (c.a2[0] == "*") cmd_str += `<${c.a2.slice(1)}>`;
        else cmd_str += `[${c.a2}]`;
        _c = cmd.command(cmd_str)
            .action(async (db, dbname, options) => { process.exit(await handleDbCmd(c.name, db, dbname, options)) });
    // Add command specific parts from decl table above
    _c.description(c.desc)
    if (c.options) {
        for (let opt_f of c.options) {
            opt_f(_c);
        }
    }
}
cmd.parse(process.argv);

