
import cmder, { Command } from "commander";


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
    cmd.option("-L --loose-names", "Allow loose naming of claim files (with version inside)");
    cmd.option("-T --xti <xti_file>", "Read extra type info from this file (yaml/json)");
    cmd.option("-D --dry", "Dry run. Do not modify the state (or DB)");
}

function addDbOption(cmd: cmder.Command) {
    cmd.option("-d --database <db_file>", "Use this DB connection - instead of default");
}

function addApplyOptions(cmd: cmder.Command) {
    addDbOption(cmd);
    cmd.option("-Q --show-queries ", "Show the generated SQL - instead of executing them");
}


import { CmdDesc, addBaseOptions } from './cmd-handlers';

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
        desc: "On this state (and connected DB), apply this claim(s)",
        a1: "claims...",
        a2: null,
        options: [addClaimOptions, addDbOption, addApplyOptions],
    },
    /*{
        name: "reverse",
        desc: "On this state (and connected DB), reverse this claim(s)",
        a1: "*claim",
        a2: null,
    },*/
];

// Read .env 
//import dotenv from "dotenv";
import * as dotenv from 'dotenv'
dotenv.config();

import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from "./cmd-handlers"

let cmd = new Command();
for (let c of cmds_mm) {
    let _c: cmder.Command;
    if (c.a2) {
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
    addBaseOptions(_c);
    if (c.options) {
        for (let opt_f of c.options) {
            opt_f(_c);
        }
    }
}
cmd.parse(process.argv);

