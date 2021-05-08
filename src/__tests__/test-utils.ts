import { Dict, firstKey, isArray, isDict } from '../utils';

import { dump as yamlDump } from 'js-yaml';

import { join as pJoin } from 'path';
//import os from 'os';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { isString } from 'lodash';
import { appendFileSync } from 'fs';

// Need a test to be in this file 
test("test-utils dummy test", () => {
    expect(1).toBe(1);
});

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


// Capturing console.log - 
// This works without Jest 
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


// Capturing console.log - 
// Under Jest 
let s_log = "";
export function jestLogCaptureStart() {
    return jest.spyOn(console, "log").mockImplementation(
        v => { s_log += v.toString() + "\n" }
    );
}

export function jestLogGet() {
    let s = s_log;
    s_log = "";
    return s;
}

// Capturing console.warn - 
// Under Jest 
let s_warn = "";
export function jestWarnCaptureStart() {
    return jest.spyOn(console, "warn").mockImplementation(
        v => { s_warn += v.toString() + "\n" }
    );
}

export function jestWarnGet() {
    let s = s_warn;
    s_warn = "";
    return s;
}

let log_file: string;
let log_parts: string[] = [];

type LogWarnErrType = "log" | "warn" | "error";

// Write console.log/warn/error to file
// Under Jest 
export function jestLogToFile(path: string, method: LogWarnErrType | LogWarnErrType[]) {
    // See if path works 
    appendFileSync(path, "\n");
    if (!existsSync(path)) return;

    if (isString(method)) method = [method];
    let spies: jest.SpyInstance[] = [];
    method.forEach(m => {
        spies.push(jest.spyOn(console, m).mockImplementation((...args) => {
            let s = "";
            args.forEach(a => {
                if (a != undefined) {
                    let s = isDict(a) || isArray(a) ? JSON.stringify(a) : a.toString();
                    appendFileSync(path, s + "\n");
                }
            });
        }));
    });
    return spies;
}
