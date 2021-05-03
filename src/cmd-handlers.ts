import {
    toStateClaim, matchDiff, dependencySort, mergeClaims, getStateDir, storeState,
    toState, rebuildState, reformatTables, connectState, createDb, syncDbWith, fileToClaim, sortMergeStoreState, dropDb, existsDb, parseDbFile, getInitialState
} from './logic';
import { dump as yamlDump } from 'js-yaml';
import { append, Dict, errorRv, firstKey, isDict, isArray } from "./utils";
import { getDirsFromFileList, slurpFile } from "./file-utils";
import { existsSync, rmSync, writeFileSync } from "fs";
import path from "path";

import cmder, { Command } from "commander";
export type CmdOptionAdder = (cmd: cmder.Command) => void;
export type CmdDesc = { name: string, a1: string, a2: string, desc: string, options?: CmdOptionAdder[] };

export function addBaseOptions(cmd: cmder.Command) {
    cmd.option("-s --state <dir>", "Manage merged state in this dir ");
}


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

export async function handleNoArgCmd(cmd: string, options: any): Promise<number> {
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

export async function handleOneArgCmd(cmd: string, a1: string | string[], options: any): Promise<number> {
    //console.log("handleOneArg: " + cmd, files, options);
    //console.log("cwd: "+process.cwd());
    let state_dir = getStateDir(options);
    let rc = 100;

    let files: string[];
    if (cmd == "join" || cmd == "apply") {
        files = a1 as string[];
        let dirs = getDirsFromFileList(files);
        if (!options.path) options.path = dirs;
        else options.path = append(options.path, dirs);
        // Trim paths 
        for( let ix in options.path )
            options.path[ix] = options.path[ix].trim();
    }

    switch (cmd) {
        case "join":
            {
                let state_base: Dict<any>;
                if (state_dir) state_base = toState(state_dir, true);
                if( !state_base ) state_base = getInitialState();
                let file_dicts: Dict<Dict<any>> = {};
                for (let f of files) {
                    let r = await toStateClaim(f, options);
                    if (r) {
                        if (r.source == "*file") file_dicts[r.file] = r;
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
                let state = sortMergeStoreState(file_dicts, state_dir, state_base, options);
                if (isDict(state)) state = state_base.___tables;
                rc = logResult(state, options, 101);
                break;
            }

        case "connect":
            {
                if (!state_dir) return errorRv("The <connect> command requires a state directory (via -s option)", 10);
                // Get the DB connection 
                let r = await connectState(state_dir, a1 as string, options);
                if (r == true) return 0;
                else {
                    console.error(r);
                    return 101;
                }
                break;
            }

        case "apply":
            {
                // Prepare state and DB conn 
                if (!state_dir) return errorRv("The <apply> command requires a state directory (via -s option)", 10);
                let state_base = toState(state_dir, true);
                if (!state_base) return errorRv("Failed reading state in: " + state_dir, 10);
                // Check for an explicit DB conn here first 
                let db_file = options.database ? options.database : path.join(state_dir, "___db.yaml");
                let conn_info = slurpFile(db_file);
                if (!isDict(conn_info)) return errorRv("The <apply> command requires a connected database (see <connect>)", 10);

                // See that DB currently fulfills existing claims
                let rs = await syncDbWith(state_base, conn_info, options);
                if (rs != true) return logResult(rs, options, 101);
                console.log("apply - DB synced with existing state");

                // Apply new claims on state 
                if (files.length) {
                    let file_dicts: Dict<Dict<any>> = {};
                    let es: string[] = [];
                    for (let f of files) {
                        let r = await fileToClaim(f, options);
                        if (r) file_dicts[f] = r;
                        else es.push("apply - failed parsing claim: " + f);
                    }
                    if (es.length) return logResult(es, options, 101);
                    let state = sortMergeStoreState(file_dicts, state_dir, state_base, options);
                    if (isArray(state)) return logResult(state, options, 102);
                    console.log("apply - New claims merged into state state");

                    // See that DB fulfills those claims
                    let rs = await syncDbWith(state_base, conn_info, options);
                    if (rs != true) return logResult(rs, options, 103);
                    console.log("apply - DB synced with new claims merged into state");

                    rc = 0;
                    break;
                }

            }

        case "reverse":
            break;
    }
    return rc;
}

export async function handleTwoArgCmd(cmd: string, candidate: string, target: string, options: any): Promise<number> {
    //console.log(options);
    //process.exit(1);
    //console.log("handleTwoArgs: " + cmd, target, candidate, options);
    //console.log("cwd: "+process.cwd());
    let rc = 100;
    let cand = await toStateClaim(candidate, options, "internal");
    let tgt = await toStateClaim(target, options, "internal");
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

export async function handleDbCmd(cmd: string, db_file: string, dbname: string, options: any): Promise<number> {
    let state_dir = getStateDir(options);
    let rc = 0;
    switch (cmd) {
        case "exists":
            {
                let r = await existsDb(db_file, dbname);
                if( r==true ) console.log("yes");
                else if (!r ) console.log("no");
                else console.log("error: "+r);
                break;
            }
        case "create":
            {
                let r = await createDb(db_file, dbname);
                if (typeof r == "string") {
                    console.log("createdb - failed: " + r);
                    rc = 10;
                    break;
                }
                console.log(`Database <${dbname}> on client type <${r.client}> was created.`);

                if (options.outfile) {
                    if (r.client == "sqlite3") {
                        r.connection.filename = path.resolve(r.connection.filename);
                    }
                    let s: string;
                    if (options.outfile.match(/.(json|JSON)/))
                        s = JSON.stringify(r, null, 2);
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
                        rc = 1;
                        break;
                    }
                    let r1 = await connectState(state_dir, r, options);
                    if (r1 != true) {
                        console.log(r1);
                        rc = 2;
                        break;
                    }
                    console.log("The new DB was connected to state in: " + state_dir);
                }
                break;
            }
        case "drop":
            {
                let r = await dropDb(db_file, dbname);
                if (!isDict(r)) {
                    console.log("createdb - failed: " + r);
                    rc = 10;
                    break;
                }
                console.log(`Database <${dbname}> on client type <${r.client}> was dropped.`);

                // Remove ___db.yaml in state, if it matches the DB just dropped.
                if( state_dir ){
                    let state_db = path.join(state_dir,"___db.yaml");
                    let conn_info = parseDbFile(state_db);
                    if( conn_info ){
                        if( conn_info.client==r.client && 
                            conn_info.connection.database==dbname ){
                                rmSync(state_db);
                                console.log(`The DB connection was removed from <${state_dir}>`);
                            }
                            else console.warn(`drop: Client or DB in ${state_db} does not match`);
                    }
                    else console.warn(`drop: failed parsing ${state_db}`);
                }
                break;
            }
    }
    return rc;
}

