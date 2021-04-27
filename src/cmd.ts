#! /usr/bin/env node
import cmder, { Command } from "commander";

type CmdOptionAdder = (cmd: cmder.Command) => void;

function addBaseOptions(cmd: cmder.Command) {
    cmd.option("-s --state <dir>", "Manage merged state in this dir ");
}

function addCreatedbOptions(cmd: cmder.Command) {
    cmd.option("--replace", "Together with a state (-s), instructs to replace the current db connection");
    cmd.option("-o --outfile <new_db_file>", "Outputs a new DB file for the created database");
}

function addIncludeExcludeOptions(cmd: cmder.Command) {
    cmd.option("-X --exclude <patterns...>", "Exclude tables/columns according to this pattern");
    cmd.option("-I --include <patterns...>", "Include tables/columns according to this pattern");
}

function addOutputOptions(cmd: cmder.Command) {
    cmd.option("-i --internal", "Set outputs formating to internal - (instead of hrc - human readable compact)");
    cmd.option("-j --json", "Generate output in JSON - not in YAML");
}

function addClaimOptions(cmd: cmder.Command) {
    cmd.option("-p --path <paths...>", "Search path for input files and dependencies");
    cmd.option("-N --no-deps", "Do not read any dependencies - (not recommended, for debug)");
}

function addDbOption(cmd: cmder.Command) {
    cmd.option("-d --database <db_file>", "Use this DB connection - instead of default");
}

export type CmdDesc = { name: string, a1: string, a2: string, desc: string, options?: CmdOptionAdder[] };

let cmds_mm: CmdDesc[] = [
    {
        name: "join",
        desc: "Join together all input claims and print them out. Optionally create a state dir (-s)",
        a1: "claims...",
        a2: null,
        options: [addClaimOptions, addOutputOptions, addIncludeExcludeOptions],
    },
    {
        name: "rebuild",
        desc: "Rebuild merged state from all claim files in state dir",
        a1: null,
        a2: null,
        options: []
    },
    {
        name: "diff",
        desc: "See if diff from <candidate/DB> to <target> is possible, and print it if so",
        a1: "candidate",
        a2: "target",
        options: [addClaimOptions, addOutputOptions, addIncludeExcludeOptions],
    },
    {
        name: "possible",
        desc: "On this <candidate/DB>, see if <target> can be applied",
        a1: "candidate",
        a2: "target",
        options: [addClaimOptions, addIncludeExcludeOptions],
    },
    {
        name: "fulfills",
        desc: "See if <candidate/DB> fulfills <target>",
        a1: "candidate",
        a2: "target",
        options: [addClaimOptions, addIncludeExcludeOptions],
    },
    {
        name: "info",
        desc: "Show info about this <state>",
        a1: null,
        a2: null,
    },
    {
        name: "connect",
        desc: "Connect this <DB> to the specified state",
        a1: "*db_file",
        a2: null,
    },
    {
        name: "apply",
        desc: "On this state (and connected DB), apply this/these claim(s)",
        a1: "claims...",
        a2: null,
        options: [addClaimOptions, addDbOption],
    },
    {
        name: "reverse",
        desc: "On this state (and connected DB), reverse this/these claim(s)",
        a1: "*claim",
        a2: null,
    },
];

let cmds_db: CmdDesc[] = [
    {
        name: "exists",
        desc: "Checking if a DB exists",
        a1: "db_file",
        a2: "name_of_db",
        options: []
    },
    {
        name: "create",
        desc: "Create a DB (after checking for existence), and optionally connect with a state",
        a1: "db_file",
        a2: "*name_of_new_db",
        options: [addBaseOptions,addCreatedbOptions]
    },
    {
        name: "drop",
        desc: "Drop a DB (after checking for existence), and optionally disconnect from a state",
        a1: "db_file",
        a2: "*name_of_db",
        options: [addBaseOptions]
    }
];

// Read .env 
//import dotenv from "dotenv";
import * as dotenv from 'dotenv'
dotenv.config();

import {handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd} from "./cmd-handlers.js"

// The CLI command name is in process.argv[1]
// differentiate <knemm> and <knedb> 
let re_db = /knedb$/;
let cmds = cmds_mm;
if( process.argv[0].match(re_db) || process.argv[1].match(re_db) )
    cmds = cmds_db;

let cmd = new Command();
for (let c of cmds) {
    let _c: cmder.Command;
    if (cmds == cmds_db) {
        let cmd_str = `${c.name} <${c.a1}> `;
        if (c.a2[0] == "*") cmd_str += `<${c.a2.slice(1)}>`;
        else cmd_str += `[${c.a2}]`;
        _c = cmd.command(cmd_str)
            .action(async (db, dbname, options) => { process.exit(await handleDbCmd(c.name, db, dbname, options)) });
    } else if (c.a2) {
        // A two arg command
        _c = cmd.command(`${c.name} <${c.a1}> <${c.a2}>`)
            .action(async (a1, a2, options) => { process.exit(await handleTwoArgCmd(c.name, a1, a2, options)) });
    } else if (c.a1) {
        // A one arg command
        let cmd_str = c.name + " ";
        if (c.a1[0] == "*") cmd_str += `<${c.a1.slice(1)}>`;
        else cmd_str += `[${c.a1}]`;
        _c = cmd.command(cmd_str)
            .action(async (a1, options) => { process.exit(await handleOneArgCmd(c.name, a1, options)) });
    } else {
        // A no arg command
        _c = cmd.command(`${c.name}`)
            .action(async (options) => { process.exit(await handleNoArgCmd(c.name, options)) });
    }
    // Add command specific parts from decl table above
    _c.description(c.desc)
    if( cmds!=cmds_db)
        addBaseOptions(_c);
    if (c.options) {
        for (let opt_f of c.options) {
            opt_f(_c);
        }
    }
}
cmd.parse(process.argv);

