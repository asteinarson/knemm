import {
    toStateClaim, matchDiff, dependencySort, mergeClaims, getStateDir, storeState,
    toState, rebuildState, reformatTables, connectState, createDb, syncDbWith, fileToClaim, 
    sortMergeStoreState, dropDb, existsDb, parseDbSpec, getInitialState, parseDbFile, SyncResult
} from './logic';

import { Claim, State, TableProps, isClaim, isClaimState } from "./types";

import { dump as yamlDump } from 'js-yaml';
import { append, Dict, errorRv, firstKey, isDict, isArray, isString, toLut } from "./utils";
import { getDirsFromFileList, slurpFile } from "./file-utils";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import * as path from "path";

import cmder, { Command } from "commander";
import { connectCheck, slurpSchema } from './db-utils';

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
        else options.path = Object.keys(toLut(append(options.path, dirs),1));
        // Trim paths 
        for (let ix in options.path)
            options.path[ix] = options.path[ix].trim();
    }

    if (options.xti) {
        let xti = slurpFile(options.xti);
        if (!xti) return errorRv(`${cmd} - failed reading extra type info in: ${options.xti}`);
        options.xti = xti;
    }

    switch (cmd) {
        case "join":
            {
                let state_base: State;
                if (state_dir) state_base = toState(state_dir, true);
                let file_dicts: Dict<Claim> = {};
                for (let f of files) {
                    let r = await toStateClaim(f, options);
                    if (r) {
                        if (isClaim(r)) file_dicts[r.file] = r;
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
                if (!state_base) state_base = getInitialState();
                let state = sortMergeStoreState(file_dicts, state_dir, state_base, options);
                let r = isClaimState(state) ? state_base.___tables : state;
                rc = logResult(r, options, 101);
                break;
            }

        case "connect":
            {
                if (!state_dir) return errorRv("The <connect> command requires a state directory (via -s option)", 10);
                // Get the DB connection 
                let r = await connectState(state_dir, a1 as string, options);
                if (r == true) {
                    console.log(`State in <${state_dir}> was connected to DB info in <${a1}>`);
                    return 0;
                }
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
                //if (!state_base) return errorRv("Failed reading state in: " + state_dir, 10);
                if (!state_base) state_base = getInitialState();
                // Check for an explicit DB conn here first 
                let conn_info = options.database ?
                    parseDbSpec(options.database) :
                    parseDbFile(path.join(state_dir, "___db.yaml"));
                if (!isDict(conn_info)) return errorRv("The <apply> command requires a connected (or specified) database (see <connect>)", 10);
                // Query logging implies dry running
                if (options.showQueries==true) options.dry = true;

                function handleSyncResult(rs:SyncResult){
                    if (rs.type == "queries") {
                        console.log("### Query log");
                        rs.r.forEach(q => console.log(q));
                    }
                    else return logResult(rs.r, options, -1);
                }

                if (!options.dry || !files.length) {
                    // See that DB currently fulfills existing claims
                    // We skip this in query printing mode - as the same queries would be 
                    // repeated twice (with modifying code below).
                    let rs = await syncDbWith(state_base, conn_info, options);
                    if (rs == true) console.log("apply - DB synced with existing state");
                    else if( handleSyncResult(rs) ) return 100;
                }

                // Apply new claims on state 
                if (files.length) {
                    let file_dicts: Dict<Claim> = {};
                    let es: string[] = [];
                    for (let f of files) {
                        let r = await toStateClaim(f, options);
                        if (r){
                            if( isClaim(r) )
                                file_dicts[f] = r;
                            else 
                                es.push("apply - only accepts claim: " + f + " found: "+r.source);
                        }
                        else es.push("apply - failed parsing claim: " + f);
                    }
                    if (es.length) return logResult(es, options, 101);
                    let state = sortMergeStoreState(file_dicts, state_dir, state_base, options);
                    if (isArray(state)) return logResult(state, options, 102);
                    console.log("apply - New claims merged into state");

                    // See that DB fulfills those claims
                    let rs = await syncDbWith(state_base, conn_info, options);
                    if (rs == true) console.log("apply - DB synced with new claims merged into state");
                    else if( handleSyncResult(rs) ) return 103;
                }
                rc = 0;
                break;
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
    let cand = await toStateClaim(candidate, options);
    let tgt = await toStateClaim(target, options);
    let r: Dict<any> | string[];

    if (options.xti) {
        let xti = slurpFile(options.xti);
        if (!xti) return errorRv(`${cmd} - failed reading extra type info in: ${options.xti}`);
        options.xti = xti;
    }

    switch (cmd) {
        case "diff":
            r = matchDiff(cand.___tables, tgt.___tables);
            options.internal = true;
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

export async function handleDbCmd(cmd: string, db_spec: string, dbname: string, options: any): Promise<number> {
    let state_dir = getStateDir(options);
    let rc = 0;
    let conn_info = parseDbSpec(db_spec);
    if (!conn_info) return errorRv(`${cmd} - Could not parse: ${db_spec}`, 100);
    if (dbname == ":" && conn_info.connection?.database)
        dbname = conn_info.connection?.database;
    let out_opt = false;
    switch (cmd) {
        case "echo":
            {
                if (dbname) conn_info.connection.database = dbname;
                if (options.test) {
                    let r = await connectCheck(conn_info);
                    console.log("test: " + (r ? "success" : "failure"));
                }
                let output = options.json ? JSON.stringify(conn_info, null, 2) : yamlDump(conn_info);
                console.log(output);
                out_opt = true;
                break;
            }
        case "exists":
            {
                let r = await existsDb(conn_info, dbname);
                if (r == true) console.log("yes");
                else if (!r) console.log("no");
                else console.log("error: " + r);
                break;
            }
        case "create":
            {
                let r = await createDb(conn_info, dbname);
                if (typeof r == "string") {
                    console.log("knedb - failed: " + r);
                    rc = 10;
                    break;
                }
                console.log(`Database <${dbname}> on client type <${r.client}> was created.`);

                out_opt = true;
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
                let r = await dropDb(conn_info, dbname);
                if (!isDict(r)) {
                    console.log("knedb - failed: " + r);
                    rc = 10;
                    break;
                }
                console.log(`Database <${dbname}> on client type <${r.client}> was dropped.`);

                // Remove ___db.yaml in state, if it matches the DB just dropped.
                if (state_dir) {
                    let state_db = path.join(state_dir, "___db.yaml");
                    let conn_info = parseDbFile(state_db);
                    if (conn_info) {
                        if (conn_info.client == r.client &&
                            conn_info.connection.database == dbname) {
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

    if (out_opt && options.outfile) {
        if (conn_info.client == "sqlite3") {
            conn_info.connection.filename = path.resolve(conn_info.connection.filename);
        }
        let s: string;
        if (options.outfile.match(/.(json|JSON)/) || options.json)
            s = JSON.stringify(conn_info, null, 2);
        else {
            if (!options.outfile.match(/.(yaml|YAML)/)) options.outfile += ".yaml";
            s = yamlDump(conn_info);
        }
        writeFileSync(options.outfile, s);
        if (!existsSync(options.outfile))
            console.log("Failed storing new connection info to: " + options.outfile);
        else
            console.log("Stored new connection info to: " + options.outfile);
    }

    return rc;
}

