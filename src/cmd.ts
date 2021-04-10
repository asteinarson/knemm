import { Command } from "commander";
let cmd = new Command();

cmd.command("join <claim1...>")
    .description(
        "Join together all input claims and print them out"
    )
    .action((claims, options) => {
        handle("join", claims, null, options);
    });

cmd.command("possible <claim> <target> ")
    .description(
        "See if <claim> can be applied on <target>"
    )
    .action((claim,target,  options) => {
        handle("possible", claim, target, options);
    });

cmd.command("fulfills <claim> <target>")
    .description(
        "See if <claim> fulfills <target>"
    )
    .action((claim, target, options) => {
        handle("fulfills", claim, target, options);
    });

cmd.command("diff <claim> <target> ")
    .description(
        "Show diff from <target> to <claim>"
    )
    .action((claim, target, options) => {
        handle("diff", claim, target, options);
    });

cmd.command("apply <claim> <DB>")
    .description(
        "Apply the claim on DB"
    )
    .action((target, DB, options) => {
        handle("apply", target, DB, options);
    });

cmd.command("reverse <claim> <DB>")
    .description(
        "Reverse the claim from DB"
    )
    .action((target, DB, options) => {
        handle("reverse", target, DB, options);
    });
cmd.parse(process.argv);


// This works for ES module 
import {toNestedDict, reformat} from './logic.js';
import { dump as yamlDump } from 'js-yaml';
import pkg from 'lodash';
const { merge: ldMerge } = pkg;
//import {merge as ldMerge} from 'lodash-es'; // This is slowish 

async function handle(cmd: string, target: string|string[], candidate: string, options: any) {
    //console.log("handle: " + cmd, target, candidate, options);
    //console.log("cwd: "+process.cwd());
    //console.log("tgt_o", tgt_o);
    //console.log("cand_o", cand_o);
    let rc = 0;
    if( cmd=="join" ){
        let tree:Record<string,any> = {};
        if( Array.isArray(target) ){
            // !! Here we should sort the files, according to dependencies 
            // and also look for additional dependencies. Unless a flag not 
            // to auto load deps. 
            for( let f of target ){
                let r = await toNestedDict(f);
                if( r ) {
                    r = ldMerge(tree,r);
                }
            }
        }
        let hr_content = reformat(tree.content,"hr-compact");
        console.log( yamlDump(hr_content) );
    } else {
        if( typeof target=="string" ){
            let tgt_o = await toNestedDict(target);
            let cand_o = await toNestedDict(candidate);
        } 
    }
    process.exit(0);
}

