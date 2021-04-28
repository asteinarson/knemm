import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict } from '../utils';

import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import path from 'path';
import os from 'os';
import { existsSync, readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import rimraf from 'rimraf';

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
        id: {
            data_type: "int",
            is_primary_key: true,
            has_auto_increment: true
        },
        name: {
            data_type: "varchar",
            max_length: 32,
        }
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

test('join w simple claim', async () => {
    console.log("ordinar log");
    capture_start();
    console.log("captured log?");
    let r = handleOneArgCmd("join",[fileOf(claim_s1)],{});
    let log = capture_stop();
    console.log("ordinary log - again");
    expect(r).toBe(0);
    expect(typeof log).toBe("string");
    console.log(log);
});
