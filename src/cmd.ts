import { Command } from "commander";
let cmd = new Command();

cmd.command("join <claim1...>")
    .description(
        "Join together all input claims and print them out"
    )
    .action((claims, options) => {
        console.log("join");
        handle("join", claims, null, options);
    });

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

cmd.command("apply <claim> <DB>")
    .description(
        "Apply the claim on DB"
    )
    .action((target, DB, options) => {
        console.log("apply");
        handle("apply", target, DB, options);
    });

cmd.command("reverse <claim> <DB>")
    .description(
        "Reverse the claim from DB"
    )
    .action((target, DB, options) => {
        console.log("reverse");
        handle("reverse", target, DB, options);
    });
cmd.parse(process.argv);


// This works for ES module 
import {toNestedDict} from './db-utils.js';
import { dump as yamlDump } from 'js-yaml';
import pkg from 'lodash';
const { merge: ldMerge } = pkg;
//import {merge as ldMerge} from 'lodash-es'; // This is slowish 

async function handle(cmd: string, target: string|string[], candidate: string, options: any) {
    console.log("handle: " + cmd, target, candidate, options);
    //console.log("cwd: "+process.cwd());
    //console.log("tgt_o", tgt_o);
    //console.log("cand_o", cand_o);
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
        console.log( yamlDump(tree.content) );
    } else {
        if( typeof target=="string" ){
            let tgt_o = await toNestedDict(target);
            let cand_o = await toNestedDict(candidate);
        } 
    }
}

