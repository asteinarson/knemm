#! /usr/bin/env node
import cmder, { Command } from "commander";

type CmdOptionAdder = (cmd: cmder.Command) => void;

function addBaseOptions(cmd: cmder.Command) {
    cmd.option("-s --state [dir]", "Manage merged state in this dir (defaults to: ./.dbstate)");
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

let cmds: { name: string, a1: string, a2: string, desc: string, options?: CmdOptionAdder[] }[] = [
    {
        name: "join",
        desc: "Join together all input claims and print them out",
        a1: "claims...",
        a2: null,
        options: [addClaimOptions, addOutputOptions, addIncludeExcludeOptions],
    },
    {
        name: "rebuild",
        desc: "Rebuild merged state from all claim files in state directory",
        a1: null,
        a2: null,
        options: []
    },
    {
        name: "diff",
        desc: "See diff from <candidate/DB> to <target>",
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
        options: [addClaimOptions],
    },
    {
        name: "reverse",
        desc: "On this state (and connected DB), reverse this/these claim(s)",
        a1: "*claim",
        a2: null,
    },
    {
        name: "createdb",
        desc: "Create a DB (after checking for existence), and optionally connect with a state",
        a1: "db_file",
        a2: "name_of_new_db",
        options: [addCreatedbOptions]
    }
];

let cmd = new Command();
for (let c of cmds) {
    let _c: cmder.Command;
    if (c.name == "createdb") {
        _c = cmd.command(`${c.name} <${c.a1}> <${c.a2}>`)
            .action(async (db, dbname, options) => { process.exit(await handleCreateDb(db, dbname, options)) });
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
    addBaseOptions(_c);
    if (c.options) {
        for (let opt_f of c.options) {
            opt_f(_c);
        }
    }
}
cmd.parse(process.argv);

import {
    toNestedDict, matchDiff, dependencySort, mergeClaims, getStateDir, storeState,
    stateToNestedDict, rebuildState, reformatTables, connectState, createDb
} from './logic.js';
import { dump as yamlDump } from 'js-yaml';
import { append, Dict, errorRv, firstKey, isDict } from "./utils.js";
import { getDirsFromFileList, slurpFile } from "./file-utils.js";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

function logResult(r: Dict<any> | string[], options: any, rc_err?: number) {
    if (!Array.isArray(r)) {
        if (!options.internal)
            r = reformatTables(r, "hr-compact");
        let output = options.json ? JSON.stringify(r, null, 2) : yamlDump(r);
        console.log(output);
        return 0;
    } else {
        console.warn("!!! There were errors !!! ");
        r.forEach(error => {
            console.warn(error);
        });
        return rc_err || 199;
    }
}

async function handleNoArgCmd(cmd: string, options: any): Promise<number> {
    let state_dir = getStateDir(options);
    let rc = 100;
    try {
        if (cmd == "rebuild") {
            if (!state_dir) return errorRv("The rebuild option requires a state directory (-s option)", 10);
            rc = rebuildState(state_dir, options) ? 0 : 101;
        }
    } catch (e) {
        console.log("handleNoArg - exception: " + e);
    }
    return rc;
}

async function handleOneArgCmd(cmd: string, a1: string | string[], options: any): Promise<number> {
    //console.log("handleOneArg: " + cmd, files, options);
    //console.log("cwd: "+process.cwd());
    let state_dir = getStateDir(options);
    let rc = 100;

    let files: string[];
    if (cmd == "join" || cmd == "apply") {
        files = a1 as string[];
        let dirs = getDirsFromFileList(files);
        if (!options.paths) options.paths = dirs;
        else options.paths = append(options.paths, dirs);
    }

    switch (cmd) {
        case "join":
            let state_base: Dict<any>;
            if (state_dir) state_base = stateToNestedDict(state_dir, true);
            let file_dicts: Dict<Dict<any>> = {};
            for (let f of files) {
                let r = await toNestedDict(f, options);
                if (r) {
                    if (r.source == "*file") file_dicts[f] = r;
                    else {
                        if (state_dir)
                            return errorRv(`join: Cannot specify additional DB or state dirs in <join> (already using state in: ${state_dir})`, 10);
                        if (state_base)
                            return errorRv(`join: Cannot specify multiple DB or state dirs in <join> (already have one)`, 10);
                        // Accept it 
                        state_base = r;
                    }
                }
                else console.error("join: could not resolve source: " + f);
            }
            let dicts = dependencySort(file_dicts, state_base, options);
            if (dicts) {
                let state = mergeClaims(dicts, state_base, options);
                if (isDict(state)) {
                    if (state_dir && dicts.length)
                        storeState(Object.keys(file_dicts), state_dir, state, options);
                    // This is for outputting just the tables, below
                    state = state.___tables;
                }
                rc = logResult(state, options, 101);
            }
            break;

        case "connect":
            if (!state_dir) return errorRv("The <connect> command requires a state directory (via -s option)", 10);
            // Get the DB connection 
            let r = await connectState(state_dir, a1 as string, options);
            if (r == true) return 0;
            else {
                console.error(r);
                return 101;
            }
            break;

        case "apply":
            // Prepare state and DB conn 
            if (!state_dir) return errorRv("The <apply> command requires a state directory (via -s option)", 10);
            state_base = stateToNestedDict(state_dir, true);
            if( !state_base ) return errorRv("Failed reading state in: "+state_dir, 10);
            let conn_info = slurpFile(path.join(state_dir, "___db.yaml"));
            if (!conn_info) return errorRv("The <apply> command requires a connected database (see <connect>)", 10);

            // See that DB currently fulfills existing claims

            // Apply new claims on state 

            // See that DB fulfills those claims
            
            break;

        case "reverse":
            break;
    }
    return rc;
}

async function handleTwoArgCmd(cmd: string, candidate: string, target: string, options: any): Promise<number> {
    //console.log(options);
    //process.exit(1);
    //console.log("handleTwoArgs: " + cmd, target, candidate, options);
    //console.log("cwd: "+process.cwd());
    let rc = 100;
    let cand = await toNestedDict(candidate, options, "internal");
    let tgt = await toNestedDict(target, options, "internal");
    let r: Dict<any> | string[];
    switch (cmd) {
        case "diff":
            r = matchDiff(cand.___tables, tgt.___tables);
            rc = logResult(r, options);
            break;
        case "possible":
            r = matchDiff(cand.___tables, tgt.___tables);
            rc = 0;
            if (Array.isArray(r)) {
                console.log("Not possible");
                logResult(r, options);
            }
            else
                console.log("Possible");
            break;
        case "fulfills":
            r = matchDiff(cand.___tables, tgt.___tables);
            // Only generate an empty response if the diff is empty
            rc = 0;
            if (Array.isArray(r) || firstKey(r)) {
                logResult(r, options);
            }
            break;
    }
    return rc;
}

async function handleCreateDb(db_file: string, dbname: string, options: any): Promise<number> {
    let state_dir = getStateDir(options);
    let r = await createDb(db_file, dbname);
    if (typeof r == "string") {
        console.log("createdb - failed: " + r);
        return 10;
    }
    console.log(`Database <${dbname}> on client type <${r.client}> was created.`);

    if (options.outfile) {
        if (r.client == "sqlite3") {
            r.connection.filename = path.resolve(r.connection.filename);
        }
        let s: string;
        if (options.outfile.match(/.(json|JSON)/))
            s = JSON.stringify(r);
        else {
            if (!options.outfile.match(/.(yaml|YAML)/)) options.outfile += ".yaml";
            s = yamlDump(r);
        }
        writeFileSync(options.outfile, s);
        if (!existsSync(options.outfile))
            console.log("Failed storing new connection info to: " + options.outfile);
        else
            console.log("Stored new connection info to: " + options.outfile);
    }

    if (state_dir) {
        if (existsSync(path.join(state_dir, "___db.yaml")) &&
            !options.replace) {
            console.log("Not connecting new DB. There already is a connected DB in the state: " + state_dir);
            return 1;
        }
        let r1 = await connectState(state_dir, r, options);
        if (r1 != true) {
            console.log(r1);
            return 2;
        }
        console.log("The new DB was connected to state in: " + state_dir);
    }
    return 0;
}

