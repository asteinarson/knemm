import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isDict } from '../utils';

import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import path from 'path';
import os from 'os';
import { existsSync, readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import rimraf from 'rimraf';
import { matchDiff } from '../logic';

// Get somewhere to store temporary claims 
let temp_claim_dir = path.join(os.tmpdir(), "claims");
if (!existsSync(temp_claim_dir))
    mkdirSync(temp_claim_dir);

function fileOf(cl: Dict<any>) {
    return path.join(temp_claim_dir, `${cl.id.branch}.${cl.id.version}.yaml`);
}

function claimsToFile(claims: Dict<any>[]) {
    let r: string[] = [];
    for (let cl of claims) {
        let fn = fileOf(cl);
        if (existsSync(fn))
            rmSync(fn);
        writeFileSync(fn, yamlDump(cl));
        r.push(fn);
    }
    return r;
}

let claim_s1 = {
    format: "internal",
    id: {
        branch: "cmd-join",
        version: 1
    },
    ___tables: {
        person: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "varchar",
                max_length: 32,
            },
        },
    }
};

// Make sure claims are in file formats 
claimsToFile([claim_s1]);

let capture = "";
let old_log:typeof console.log;

function capture_start(){
    if( old_log ) process.exit(-1);
    capture = "";
    old_log = console.log; 
    console.log = function(msg:any){
        capture += msg.toString();
        capture += "\n";
    }
}

function capture_stop(){
    if( !old_log ) process.exit(-1);
    console.log = old_log;
    old_log = null; 
    return capture;
}

capture_start();
let r = await handleOneArgCmd("join",[fileOf(claim_s1)],{internal:true});
let y_s = capture_stop();
console.log( "test return code: " + r );

try {
    let o = yamlLoad(y_s);
    if( isDict(o)){
        // The merge should be identical with the one claim 
        let d1 = matchDiff(claim_s1.___tables,o);
        if( firstKey(d1) ) console.log("Expected empty diff1");
        let d2 = matchDiff(o,claim_s1.___tables);
        if( firstKey(d2) ) console.log("Expected empty diff2");
    }
}catch(e){
    console.error("Failed yamlLoad");
}


