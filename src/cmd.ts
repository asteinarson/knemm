import cmder, { Command } from "commander";

type CmdOptionAdder = (cmd: cmder.Command) => void;

function addBaseOptions(cmd: cmder.Command) {
    cmd.option("-i --internal", "Set outputs formating to internal - (instead of hrc - human readable compact)");
    cmd.option("-j --json", "Generate output in JSON - not in YAML");
    cmd.option("-p --path <paths...>", "Search path for input files and dependencies");
    cmd.option("-s --state [dir]", "Manage merged state in this dir (defaults to: ./.dbstate)");
    //cmd.option("--no-state", "Do not use a state dir, even if found");
    cmd.option("-X --exclude <patterns...>", "Exclude tables/columns according to this pattern");
    cmd.option("-I --include <patterns...>", "Include tables/columns according to this pattern");
}

function addJoinOptions(cmd: cmder.Command) {
    cmd.option("-N --no-deps", "Do not read any dependencies - (not recommended, for debug)");
}

function addPruneOptions(cmd: cmder.Command) {
}

let cmds: { name: string, a1: string, a2: string, desc: string, options?: CmdOptionAdder[] }[] = [
    {
        name: "join",
        desc: "Join together all input claims and print them out",
        a1: "claims...",
        a2: null,
        options: [addJoinOptions],
    },
    {
        name: "rebuild",
        desc: "Rebuild merged state from all claim files in state directory",
        a1: null,
        a2: null,
        options: []
    },
    {
        name: "possible",
        desc: "On this <candidate/DB>, see if <target> can be applied",
        a1: "candidate",
        a2: "target",
    },
    {
        name: "fulfills",
        desc: "See if <candidate/DB> fulfills <target>",
        a1: "candidate",
        a2: "target"
    },
    {
        name: "diff",
        desc: "See diff from <candidate/DB> to <target>",
        a1: "candidate",
        a2: "target"
    },
    {
        name: "info",
        desc: "Show info about this <state>",
        a1: "state",
        a2: null,
    },
    {
        name: "connect",
        desc: "Connect this <DB> to the given <state>",
        a1: "db",
        a2: "state",
    },
    {
        name: "apply",
        desc: "On this DB (or state), apply this claim",
        a1: "DB",
        a2: "target",
    },
    {
        name: "reverse",
        desc: "On this DB (or state), reverse this claim ",
        a1: "DB",
        a2: "target",
    },
];

let cmd = new Command();
for (let c of cmds) {
    let _c: cmder.Command;
    if (c.a2) {
        // A two arg command
        _c = cmd.command(`${c.name} <${c.a1}> <${c.a2}>`)
            .action((a1, a2, options) => { handleTwoArg(c.name, a1, a2, options) });
    } else if (c.a1) {
        // A one arg command
        _c = cmd.command(`${c.name} <${c.a1}>`)
            .action((a1, options) => { handleOneArg(c.name, a1, options) });
    } else {
        // A no arg command
        _c = cmd.command(`${c.name}`)
            .action((options) => { handleNoArg(c.name, options) });
    }
    _c.description(c.desc)
    addBaseOptions(_c);
    if (c.options) {
        for (let opt_f of c.options) {
            opt_f(_c);
        }
    }
}

cmd.parse(process.argv);

import { toNestedDict, reformat, matchDiff, dependencySort, mergeClaims, getStateDir, storeState, fileToNestedDict, stateToNestedDict, getInitialState, rebuildState } from './logic.js';
// This works for ES module 
import { dump as yamlDump } from 'js-yaml';
import pkg from 'lodash';
import { append, Dict, errorRv, firstKey, isDict } from "./utils.js";
import { getDirsFromFileList } from "./file-utils.js";
const { merge: ldMerge } = pkg;
//import {merge as ldMerge} from 'lodash-es'; // This adds load time

function logResult(r: Dict<any> | string[], options: any) {
    if (!Array.isArray(r)) {
        let output = options.json ? JSON.stringify(r, null, 2) : yamlDump(r);
        console.log(output);
    } else {
        console.warn("!!! There were errors !!! ");
        r.forEach(error => {
            console.warn(error);
        });
    }
}

async function handleNoArg(cmd: string, options: any) {
    let state_dir = getStateDir(options);
    let rc = 100;
    try {
        if (cmd == "rebuild") {
            if (!state_dir) {
                console.error("The rebuild option requires a state directory (-s option)");
                process.exit(rc);
            }
            rc = rebuildState(state_dir, options) ? 0 : 101;
        }
    } catch(e){
        console.log("handleNoArg - exception: " + e);
    }
    process.exit(rc);
}

async function handleOneArg(cmd: string, files: string[], options: any) {
    //console.log("handleOneArg: " + cmd, files, options);
    //console.log("cwd: "+process.cwd());
    let state_dir = getStateDir(options);
    let rc = 100;

    if (cmd == "join") {
        let dirs = getDirsFromFileList(files);
        if (!options.paths) options.paths = dirs;
        else options.paths = append(options.paths, dirs);

        let state_base: Dict<any>;
        if (state_dir) state_base = stateToNestedDict(state_dir, true);
        let file_dicts: Dict<Dict<any>> = {};
        for (let f of files) {
            let r = await toNestedDict(f, options);
            if (r) {
                if (r.source == "*file") file_dicts[f] = r;
                else {
                    if (state_dir)
                        return errorRv(`join: Cannot specify additional DB or state dirs in <join> (already using state in: ${state_dir})`);
                    if (state_base)
                        return errorRv(`join: Cannot specify multiple DB or state dirs in <join> (already have one)`);
                    // Accept it 
                    state_base = r;
                }
            }
            else console.error("join: could not resolve source: " + f);
        }
        let dicts = dependencySort(file_dicts, state_base, options);
        if (dicts) {
            let state_tree = mergeClaims(dicts, state_base, options);
            if (isDict(state_tree)) {
                if (state_dir && dicts.length)
                    storeState(files, state_dir, state_tree, options);
                if (!options.internal)
                    state_tree.___tables = reformat(state_tree.___tables, "hr-compact");
                // This is for outputting just the tables, below
                state_tree = state_tree.___tables;
                rc = 0;
            }
            else rc = 101;
            logResult(state_tree, options);
        }
    }
    process.exit(rc);
}

async function handleTwoArg(cmd: string, candidate: string, target: string, options: any) {
    //console.log(options);
    //process.exit(1);
    //console.log("handleTwoArgs: " + cmd, target, candidate, options);
    //console.log("cwd: "+process.cwd());
    let rc = 100;
    let cand = await toNestedDict(candidate, options, "internal");
    let tgt = await toNestedDict(target, options, "internal");
    let r: Dict<any> | string[];
    switch (cmd) {
        case "possible":
            r = matchDiff(cand.___tables, tgt.___tables);
            if (Array.isArray(r)) {
                console.log("Not possible");
                logResult(r, options);
            }
            else console.log("Possible");
            break;
        case "fulfills":
            r = matchDiff(cand.___tables, tgt.___tables);
            // Only generate an empty response if the diff is empty
            if (Array.isArray(r) || firstKey(r))
                logResult(r, options);
            break;
        case "diff":
            r = matchDiff(cand.___tables, tgt.___tables);
            logResult(r, options);
            break;
        case "apply":
            break;
        case "reverse":
            break;
    }
    process.exit(rc);
}
