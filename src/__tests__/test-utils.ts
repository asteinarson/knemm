import { Dict, firstKey, isDict } from '../utils';

import { dump as yamlDump } from 'js-yaml';

import { join as pJoin } from 'path';
//import os from 'os';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

// Get somewhere to store temporary claims 
let temp_claim_dir = pJoin(tmpdir(), "claims");
if (!existsSync(temp_claim_dir))
    mkdirSync(temp_claim_dir);

export function getClaimDir() {
    return temp_claim_dir;
}

export function fileOf(cl: Dict<any>) {
    return pJoin(temp_claim_dir, `${cl.id.branch}_${cl.id.version}.yaml`);
}

export function claimsToFile(claims: Dict<any>[]) {
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

let capture = "";
let old_log: typeof console.log;

export function captureStart() {
    if (old_log) process.exit(-1);
    capture = "";
    old_log = console.log;
    console.log = function (msg: any) {
        capture += msg.toString();
        capture += "\n";
    }
}

export function captureStop() {
    if (!old_log) process.exit(-1);
    console.log = old_log;
    old_log = null;
    return capture;
}

