import cmder, { Command } from "commander";

let cmds: { name: string, a1: string, a2: string, desc: string }[] = [
    {
        name: "join",
        desc: "Join together all input claims and print them out",
        a1: "files...",
        a2: null
    },
    {
        name: "possible",
        desc: "See if <target> can be applied on <candidate>",
        a1: "target",
        a2: "candidate"
    },
    {
        name: "fulfills",
        desc: "See if <candidate> fulfills <target>",
        a1: "candidate",
        a2: "target"
    },
    {
        name: "diff",
        desc: "See diff from <candidate> to <target>",
        a1: "candidate",
        a2: "target"
    },
    {
        name: "apply",
        desc: "Apply the claim/target on the DB",
        a1: "target",
        a2: "DB"
    },
    {
        name: "reverse",
        desc: "Reverse the claim/target from the DB",
        a1: "target",
        a2: "DB"
    },
];

function addCommandOptions(cmd: cmder.Command) {
    cmd.option("-i --internal", "Set outputs formating to internal - (instead of hrc - human readable compact)");
    cmd.option("-j --json", "Generate output in JSON - not in YAML");
    cmd.option("-N --no-deps", "Do not read any dependencies - (not recommended, for debug)");
}

let cmd = new Command();
for (let c of cmds) {
    if (c.a2) {
        // A two arg command
        let _c = cmd.command(`${c.name} <${c.a1}> <${c.a2}>`)
            .description(c.desc)
            .action((a1, a2, options) => { handle(c.name, a1, a2, options) })
        addCommandOptions(_c);
    } else {
        // A one arg command
        let _c = cmd.command(`${c.name} <${c.a1}>`)
            .description(c.desc)
            .action((a1, options) => { handleList(c.name, a1, options) })
        addCommandOptions(_c);
    }
}

cmd.parse(process.argv);

// This works for ES module 
import { toNestedDict, reformat } from './logic.js';
import { dump as yamlDump } from 'js-yaml';
import pkg from 'lodash';
const { merge: ldMerge } = pkg;
//import {merge as ldMerge} from 'lodash-es'; // This is slowish 

async function handleList(cmd: string, files: string[], options: any) {
    //console.log("handleList: " + cmd, files, options);
    //console.log("cwd: "+process.cwd());
    let rc = 1000;
    if (cmd == "join") {
        let tree: Record<string, any> = {};
        // !! Here we should sort the files, according to dependencies 
        // and also look for additional dependencies. Unless a flag not 
        // to auto load deps. 
        for (let f of files) {
            let r = await toNestedDict(f);
            if (r) {
                r = ldMerge(tree, r);
            }
        }
        let content = reformat(tree.content, options.internal ? "internal" : "hr-compact");
        let output = options.json ? JSON.stringify(content,null,2) : yamlDump(content);
        console.log(output);
        rc = 0;
    }
    process.exit(rc);
}

async function handle(cmd: string, target: string, candidate: string, options: any) {
    //console.log("handle: " + cmd, target, candidate, options);
    //console.log("cwd: "+process.cwd());
    let rc = 1000;
    switch (cmd) {
        case "possible":
            break;
        case "fulfills":
            break;
        case "diff":
            break;
        case "apply":
            break;
        case "reverse":
            break;
    }
    process.exit(rc);
}
