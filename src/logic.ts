import { invert as ldInvert, Dict, isArray, toLut, firstKey, tryGet, errorRv, notInLut, isDict, isArrayWithElems, isDictWithKeys, isString, dArrAt, objectMap } from './utils';
//import pkg from 'lodash';
//const { invert: ldInvert } = pkg;

import { db_column_words, db_types_with_args, db_type_args, getTypeGroup, typeContainsLoose } from './db-props';

import { fileNameOf, slurpFile } from "./file-utils";
import { connect, connectCheck, modifySchema, slurpSchema } from './db-utils'
import { existsSync, readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import path from 'path';
import { dump as yamlDump } from 'js-yaml';

import { formatInternal, formatHrCompact } from "./hrc";
import { Knex } from 'knex';
import { stringify } from 'node:querystring';
import { builtinModules } from 'node:module';

export function reformatTables(tables: Dict<any>, format: "internal" | "hr-compact"): Dict<any> {
    return format == "internal" ? formatInternal(tables) : formatHrCompact(tables);
}

export type TableInfoOrErrors = Dict<any> | string[];

export function getStateDir(options: any) {
    let state_dir: string;
    if (options.state) {
        if (options.state == true)
            state_dir = "./"; //.dbstate";
        else {
            state_dir = options.state;
            //if (state_dir.slice(-9) != "/.dbstate")
            //    state_dir += "/.dbstate";
        }
        if (!existsSync(state_dir)) {
            mkdirSync(state_dir);   // Does not give a return value (?)
            if (!existsSync(state_dir)) {
                console.error("getStateDir - Failed creating: " + state_dir);
                return;
            }
        }
    }
    return state_dir;
}

export function storeState(files: string[], state_dir: string, state: Dict<any>, options: Dict<any>) {
    if (!existsSync(state_dir)) {
        console.error("storeState - Dir does not exist: " + state_dir);
        return;
    }

    // Normalize the state
    if (!state.___tables)
        state = { ___tables: state };

    // Copy input files here     
    for (let f of files) {
        let md = f.match(re_name_oext);
        if (md) {
            let name = md[2] + "." + md[3];
            let tgt_name = path.join(state_dir, name);
            copyFileSync(f, tgt_name);
            if (!existsSync(tgt_name)) console.warn(`storeState - Failed copy file: ${f} to ${tgt_name}`);
        }
        else console.warn("storeState - failed extract filename from: " + f);
    }

    // And write the new state
    let m_yaml = path.join(state_dir, "___merge.yaml");
    if (existsSync(m_yaml)) rmSync(m_yaml);
    writeFileSync(m_yaml, yamlDump(state));

    return existsSync(m_yaml);
}

const state_excludes: Dict<1> = {
    "___merge.yaml": 1,
    "___db.yaml": 1,
    //".dbstate": 1,
    //"./.dbstate": 1,
}

function excludeFromState(file: string) {
    return state_excludes[file];
}

const re_yj = /\.(json|yaml|JSON|YAML)$/;

// Rebuild the state directory from claims that are stored in the directory
export function rebuildState(state_dir: string, options: Dict<any>): boolean {
    if (!existsSync(state_dir))
        return errorRv(`rebuildState - Directory ${state_dir} not found`);
    // Build a list of modules with last versions 
    let file_dicts: Dict<Dict<any>> = {};
    for (const f of readdirSync(state_dir)) {
        if (excludeFromState(f)) continue;
        if (f.match(re_yj)) {
            try {
                // Doing the await here (fileToNestedDict declared async without being so) 
                // causes nested function to return to the parent function (!)
                //let r = await fileToNestedDict(path.join(state_dir, f), true);
                let r = fileToNestedDict(path.join(state_dir, f), true, "internal");
                if (r?.id) file_dicts[f] = r;
                else console.warn(`rebuildState: Claim file not parsed correctly: ${f}`);
            } catch (e) {
                console.error(e);
            }
        }
    }
    let state_base = getInitialState();
    let dicts = dependencySort(file_dicts, state_base, options);
    if (!dicts) return;
    let r = mergeClaims(dicts, state_base, options);
    if (isDict(r)) {
        storeState([], state_dir, r, options);
        return true;
    }
    else {
        r.forEach(e => console.error("rebuildState: " + e));
    }
}

export function sortMergeStoreState(
    file_dicts: Dict<Dict<any>>,
    state_dir: string,
    state_base: Dict<any>,
    options: Dict<any>)
    : Dict<any> | string[] {
    let dicts = dependencySort(file_dicts, state_base, options);
    if (!dicts) return ["sortMergeStoreState - Failed dependencySort"];
    if (!dicts.length) return state_base;

    let state = mergeClaims(dicts, state_base, options);
    if (isDict(state)) {
        if (state_dir && dicts.length)
            storeState(Object.keys(file_dicts), state_dir, state, options);
    }
    return state;
}

export async function existsDb(db_file: string | Dict<any>, db_name?: string): Promise<boolean | string> {
    let conn_info: Dict<any> = normalizeConnInfo(db_file);
    if (!conn_info) return "existsDb - could not get DB connection info";
    if (!db_name) {
        db_name = conn_info.connection.database;
        if (!db_name) return "existsDb - no name given, for DB to check for";
    }

    if (conn_info.client == "sqlite3")
        return existsDbSqlite(conn_info);

    // Try to connect to the DB - with named DB - should fail 
    conn_info.connection.database = db_name;
    if (await connectCheck(conn_info)) return true;
}

function existsDbSqlite(conn_info: Dict<any>, db_name?: string) {
    if (!db_name) db_name = conn_info?.connection?.database;
    if (!db_name) return;

    for (let fn of [db_name, db_name + ".sqlite"]) {
        if (existsSync(fn)) {
            // We do not do a connectCheck here - 
            // as it would create the DB.
            return true;
        }
    }
}

export async function createDb(db: string | Dict<any>, db_name?: string): Promise<Dict<any> | string> {
    let conn_info: Dict<any> = normalizeConnInfo(db);
    if (!conn_info) return "createDb - could not connect to DB";
    if (!db_name) {
        db_name = conn_info.connection.database;
        if (!db_name) return "createDb - no name given, for DB to be created";
    }

    // Try connecting to the given DB - should fail
    if (conn_info.client == "sqlite3")
        return createDbSqlite(conn_info, db_name);

    // Try to connect to the DB - with named DB - should fail 
    conn_info.connection.database = db_name;
    if (await connectCheck(conn_info))
        return `createDb - Database ${db_name} already exists`;

    // Remove the DB name - and retry 
    delete conn_info.connection.database;
    let knex_c = await connectCheck(conn_info);
    if (!knex_c) return `createDb - Failed connect without DB name (${db_name})`;
    try {
        let r = await knex_c.raw(`CREATE DATABASE ${db_name}`);
        // Then try to connect to it
        conn_info.connection.database = db_name;
        knex_c = await connectCheck(conn_info);
        if (knex_c) return conn_info;
        return `createDb - Failed create DB: ${db_name}`;
    } catch (e) { }

    return `createDb - Failed connect to or create DB`;
}

async function createDbSqlite(conn_info: Dict<any>, db_name: string): Promise<Dict<any> | string> {
    // Try connecting to the given DB - should fail
    if (!db_name.match(/[^.]+\.[^.]+/))
        db_name += ".sqlite";

    // Try to connect to the DB - with named DB - should fail 
    // We cannot use this method with SQLite3, as it does not differentiate
    // whether the DB exists beforehand or not. 
    // Look for the DB file instead 
    if (existsSync(db_name)) {
        return `createDbSqlite - Database ${db_name} already exists`;
    }

    // Try to connect to unnamed sqlite - it should create the named DB
    try {
        conn_info.connection.filename = db_name;
        let knex_c = await connect(conn_info);
        if (knex_c) {
            let r = await knex_c.raw(`SELECT 1+1`);
            if (existsSync(db_name)) return conn_info;
        }
    } catch (e) {
        console.log("connect error", e);
    }

    return `createDbSqlite - Failed connect to or create DB`;
}

export async function dropDb(db: string | Dict<any>, db_name: string): Promise<Dict<any> | string> {
    let conn_info: Dict<any> = normalizeConnInfo(db);
    if (!conn_info) return "dropDb - could not parse DB connect info";
    if (!db_name) return "dropDb - explicit DB name required to drop ";
    conn_info.connection.database = db_name;

    if (conn_info.client == "sqlite3")
        return dropDbSqlite(conn_info, db_name);

    let knex_c = await connectCheck(conn_info);
    if (!knex_c) return "dropDb: Failed connecting to the database"

    // And drop the DB - need a new connection - w.o. specific DB for that 
    try {
        await knex_c.destroy();
        delete conn_info.connection.database;
        knex_c = await connectCheck(conn_info);
        let r = await knex_c.raw(`DROP DATABASE ${db_name}`);
        return conn_info;
    } catch (e) {
        return `dropDb - Failed executing DROP DATABASE`;
    }
}

function dropDbSqlite(db: string | Dict<any>, db_name: string): Dict<any> | string {
    let conn_info = isDict(db) ? db : parseDbFile(db);
    if (!conn_info) return "dropDb - could not parse DB connect info";
    for (let fn of [db_name, db_name + ".sqlite"]) {
        if (existsSync(fn)) {
            rmSync(fn);
            if (!existsSync(fn)) return conn_info;
        }
    }
    return "dropDbSqLite: DB not found: " + db_name;
}

export function normalizeConnInfo(conn_info: Dict<any> | string) {
    if (!conn_info) return;
    if (isString(conn_info)) {
        // Mutual recursion is OK - progress in each step
        return parseDbFile(conn_info);
    }

    if (!conn_info.connection) {
        conn_info = {
            connection: conn_info
        };
    }
    if (!conn_info.client) {
        // Some logic to get a specific DB client type
        let client = process.env.DBCLIENT || process.env.DEFAULT_DBCLIENT;
        if (!client) {
            // We could do something fancy here, as a dynamic import, 
            // looking for each client type, but no...
            client = "pg";
        }
        conn_info.client = client;
    }
    return conn_info;
}

export function parseDbFile(db_file: string): Dict<any> {
    // Look for a connection file - or use ENV vars 
    let conn_info: Dict<any>;
    if (db_file != "%" && db_file.slice(3) != "%") {
        try {
            let r = slurpFile(db_file);
            if (typeof r == "object") conn_info = r as Dict<string>;
            else return errorRv("parseDbFile - failed slurpFile: " + db_file);
        } catch (e) {
            return errorRv("parseDbFile - exception: " + e);
        }
    } else {
        // '%' means use ENV vars
        conn_info = {
            host: process.env.HOST,
            user: process.env.USER,
            password: process.env.PASSWORD,
        }
        if (process.env.DATABASE)
            conn_info.database = process.env.DATABASE;
    }
    return normalizeConnInfo(conn_info);
}

async function dbFileToKnex(db_file: string): Promise<Knex> {
    let conn_info = parseDbFile(db_file);
    // Get our dict from DB conn ? 
    if (conn_info) {
        try {
            return await connect(conn_info);
        } catch (e) {
            return errorRv(`dbFileToKnex - failed connect for <${db_file}>: ${e}`);
        }
    }
}


export async function connectState(state_dir: string, db_file: string | Dict<any>, options: Dict<any>): Promise<true | string> {
    let conn_info = (typeof db_file == "string" ? parseDbFile(db_file) : db_file);
    if (!conn_info) return `connectState - Could not parse: ${db_file}`;
    let knex_c = await connect(conn_info);
    if (!knex_c) return "connectState - Could not connect to DB";

    // Workaround for sqlite, which otherwise will not be able to resolve 
    // a relative path from the state 
    if (conn_info.client == "sqlite3") {
        conn_info.connection.filename = path.resolve(conn_info.connection.filename);
    }
    // All we have to do is to copy <db_file> int <state_dir>
    writeFileSync(path.join(state_dir, "___db.yaml"), yamlDump(conn_info));
    return true;
}

export function stateToNestedDict(dir: string, quiet?: boolean): Dict<any> {
    if (!existsSync(dir))
        return quiet ? undefined : errorRv(`stateToNestedDict - State dir does not exist: ${dir}`);
    let m_yaml = path.join(dir, "___merge.yaml");
    if (!existsSync(m_yaml))
        return quiet ? undefined : errorRv(`stateToNestedDict - Merge file does not exist: ${m_yaml}`);
    let r = slurpFile(m_yaml);
    if (!isDict(r))
        return errorRv(`stateToNestedDict - Failed reading: ${m_yaml}`);

    r.source = "*state";
    r.directory = dir;
    r.format = "internal";
    return r;
}

export type FormatType = "internal" | "hr-compact";

export function reformatTopLevel(claim: Dict<any>, format?: FormatType) {
    if (claim.___tables) {
        if (format && claim.format != format) {
            claim.___tables = reformatTables(claim.___tables, format);
            claim.format = format;
        }
    }
    else
        claim.___tables = {}
}

export function fileToNestedDict(file: string, quiet?: boolean, format?: FormatType): Dict<any> {
    // Then it should be a file 
    let rf = slurpFile(file, quiet);
    if (!rf) {
        if (!quiet)
            console.log("fileToNestedDict - file not found: " + file);
    }
    else if (isDict(rf)) {
        // Is it a claim with top level props, or just the tables? 
        let r: Dict<any> = {};
        if (rf.___tables)
            r = rf;
        else
            r.___tables = rf;
        r.source = "*file";
        r.file = file;
        r.format ||= "?";
        // ! This should use the looseNames flag
        if (!r.id)
            r.id = claimIdFromName(file);
        else if (typeof r.id == "string")
            r.id = claimIdFromName(r.id);
        reformatTopLevel(r, format);
        return r;
    }
}

// Read a file, a directory or a DB into a schema state object
export async function toNestedDict(file_or_db: string, options: Dict<any>, format?: FormatType): Promise<Dict<any>> {
    if (!file_or_db) return null;
    if (!format) format = "internal";

    let r: Dict<any> = {};
    if (file_or_db == "@" || file_or_db.slice(0, 6) == "state:") {
        // This means current/given state 
        let state_dir: string;
        if (file_or_db == "@") {
            if (options.state == false) {
                return errorRv("toNestedDict - Cannot resolve default state (@)");
            }
            state_dir = options.state || "./"; //.dbstate";
        }
        else state_dir = file_or_db.slice(6);
        r = stateToNestedDict(state_dir);
        return r;
    }
    else if (file_or_db == "%" || file_or_db.slice(0, 3) == "db:") {
        let knex_c = await dbFileToKnex(file_or_db);
        if (!knex_c) return errorRv("toNestedDict - Could not connect to DB");
        let rs = await slurpSchema(knex_c);
        if (rs) {
            // Keep the connection object here - it allows later knowing it is attached to a DB
            r.source = "*db";
            r.connection = knex_c;
            r.format = "internal";
            r.___tables = rs;
        }
        else return errorRv("toNestedDict - Failed slurpSchema");
    }
    else {
        // Try the various paths supplied 
        let paths = path.isAbsolute(file_or_db) ? [""] : options.path as string[];
        for (let p of paths) {
            let fn = p ? path.join(p, file_or_db) : file_or_db;
            if (existsSync(fn)) {
                r = fileToNestedDict(fn, false, format);
                break;
            }
        }
        if (!r) return errorRv(`fileToNestedDict - File not found: ${file_or_db}`);
    }

    reformatTopLevel(r, format);
    return r;
}

type PropType = string | number | Dict<string | number | Dict<string | number>>;
function propEqual(v1: PropType, v2: PropType) {
    if (typeof v1 == "string" || typeof v1 == "number" || typeof v1 == "boolean") return v1 == v2;
    if (!v1) return v1 == v2;
    if (typeof v1 == "object") {
        if (typeof v2 != "object") return false;
        // Each property of it should be equal 
        for (let k in v1) {
            if (!propEqual(v1[k], v2[k]))
                return false;
        }
        return true;
    }
}

// This generates the smallest diff that can adapt the candidate to fulfill 
// the target specification. Or an array of errors, if not possible. 
function matchDiffColumn(col_name: string, cand_col: Dict<any>, tgt_col: Dict<any>): TableInfoOrErrors {
    let r: Dict<any> = {};
    let errors: string[] = [];

    if (!firstKey(cand_col)) {
        // The column does not exist in the candidate, so duplicate all properties 
        // into the diff 
        return { ...tgt_col };
    }

    for (let tk in tgt_col) {
        // If property is different, we need to do something 
        let tv = tgt_col[tk], cv = cand_col[tk];
        if (!propEqual(tv, cv)) {
            switch (tk) {
                case "data_type":
                    if (!typeContainsLoose(cv, tv)) {
                        // The candidate type does not hold, see if we can expand it 
                        if (typeContainsLoose(tv, cv))
                            r.data_type = tv;
                        else
                            errors.push(`${col_name} - Types are not compatible: ${cv}, ${tv} `);
                    }
                    break;
                case "is_nullable":
                    if (tv) {
                        // We can safely go from notNullable => nullable
                        if (cv == false)
                            r.is_nullable = true;
                    }
                    else errors.push(`${col_name} - Cannot safely go from notNullable => nullable `);
                    break;
                case "is_unique":
                    if (!tv) {
                        // We can safely drop unique constraint 
                        if (cv)
                            r.is_unique = false;
                    }
                    else errors.push(`${col_name} - Cannot safely go to unique `);
                    break;
                case "is_primary_key":
                    // We can actually go both ways here - w.o data loss 
                    if (tv || cv == true) {
                        r.is_primary_key = tv;
                    }
                    break;
                case "has_auto_increment":
                    // We can actually go both ways here - w.o data loss 
                    if (tv) {
                        r.has_auto_increment = true;
                    }
                    else errors.push(`${col_name} - Not possible to remove auto_increment. Drop the primary key instead`);
                    break;
                case "default":
                    // We can always set a default 
                    r.default = tv;
                    break;
                case "foreign_key":
                    // Accept if candidate does not specify another foreign key 
                    if (tv) {
                        if (!cv) {
                            // It would be good to first check for existense of table:column
                            r.foreign_key = tv;
                        }
                        else errors.push(`${col_name} - Foreign key info mismatch: ${cv.table}:${cv.column} => ${tv.table}:${tv.column}`);
                    }
                    break;
                default:
                    errors.push(`${col_name} - Unhandled column keyword: ${tk}`);
            }
        }
    }

    // For properties that are only in candidate, we can keep those, 
    // as target does not oppose them.

    return errors.length > 0 ? errors : r;
}

// Generate the DB diff that is needed to go from 'candidate' to 'target'. 
// In a sense, the output is a transition, not a state. (The two inputs are
// states).
export function matchDiff(candidate: Dict<any>, target: Dict<any>): TableInfoOrErrors {
    let r: Dict<any> = {};
    let errors: string[] = [];
    // Iterate tables 
    for (let kt in target) {
        let tgt_table = target[kt];
        let cand_table = tryGet(kt, candidate, {});
        if (typeof tgt_table == "object") {
            // Iterate columns 
            for (let kc in tgt_table) {
                let tgt_col = tgt_table[kc];
                let cand_col = tryGet(kc, cand_table, {});
                let diff_col: Dict<any> | string;
                if (isDict(tgt_col)) {
                    let dc = matchDiffColumn(kc, cand_col, tgt_col);
                    if (typeof dc == "object") {
                        if (firstKey(dc))
                            diff_col = dc;
                    }
                    else errors = [...errors, ...dc];
                }
                else {
                    if (tgt_col == "*NOT") {
                        // We only need to generate this if the table exists in the candidate
                        if (!firstKey(cand_col) && cand_col != "*NOT")
                            diff_col = "*NOT";
                    }
                }
                if (diff_col) {
                    if (!r[kt]) r[kt] = {};
                    r[kt][kc] = diff_col;
                }
            }
        } else {
            if (tgt_table == "*NOT") {
                // We only need to generate this if the table exists in the candidate
                if (cand_table && cand_table[kt] && cand_table[kt] != "*NOT")
                    r[kt] = "*NOT";
            }
        }
    }
    return errors.length ? errors : r;
}

export async function syncDbWith(state: Dict<any>, db_conn: Dict<any> | string, options: Dict<any>): Promise<true | string[]> {
    // Prepare
    if (typeof db_conn == "string") {
        db_conn = parseDbFile(db_conn);
        if (!db_conn) return ["syncDbWith - Failed parseDbFile for: " + db_conn];
    }
    let knex_c = await connect(db_conn);
    if (!knex_c) return ["syncDbWith - Failed connect"];
    let state_db = await slurpSchema(knex_c, options.includes, options.excludes);
    if (!state_db) return ["syncDbWith - Failed slurpSchema"];

    // Do the diff 
    let diff = matchDiff(state_db, state.___tables);
    if (isArray(diff)) return diff;
    if (!firstKey(diff)) return true;

    // So we have a minimal diff to apply one the DB 
    try {
        let r = await modifySchema(knex_c, diff, state_db);
    } catch (e) {
        return ["syncDbWith: exception in modifySchema", e.toString()];
    }

    return true;
}

// Regular expression to extract claim (name,number) from a string/filename
// Matches /some/path/claim.7.json 
const re_name_num_ext = /^([^/]+\/)*(.*)\.([\d]+)(\.[a-zA-Z_-]+)?$/;

//const re_name_num_oext1 = /^([^/]+\/)*(.*)-(([\d]+)(\.[\d]+)?)(\.[a-zA-Z_-]+)?$/;

// This matches:
//   /path/to/claim-osc_14.12.yaml
//   /path/to/claim-osc_15.json
//   claim-osc_15.yaml
//   claim:abc_16
//   cust_17.1
//   cust_16.yaml
const re_name_num_oext = /([^/^_^.]*)_(([\d]+)(\.[\d]+)?)(\.[a-zA-Z_-]+)?$/;
const re_name_oext = /([^/^_^.]*)(\.[a-zA-Z_-]+)?$/;
const re_ext = /^(.*)\.([a-zA-Z_-]+)$/;

type ClaimId = { branch: string, version: number };

function claimIdFromName(name: string, allow_loose?: boolean): ClaimId {
    // Name plus version ? 
    let md = name.match(re_name_num_oext);
    if (md)
        return { branch: md[1], version: Number(md[2]) };
    if (allow_loose) {
        // Then only a name
        md = name.match(re_name_oext);
        if (md)
            return { branch: md[1], version: 0 };
    }
}

function safeClaimId(claim_id: Dict<any> | string): ClaimId {
    if (isDict(claim_id)) {
        return {
            // The ID is stored using <name> while the dep list can use <branch>
            branch: claim_id.name || claim_id.branch,
            version: Number(claim_id.version)
        };
    }
    if (!isString(claim_id))
        return errorRv(`safeClaimId: Unhandled claim ID type: ${claim_id}: ${typeof claim_id}`);
    return claimIdFromName(claim_id);
}

function getClaimId(name: string, claim_id: Dict<any> | string, allow_loose?: boolean): ClaimId {
    if (!name && isString(claim_id))
        name = claim_id;
    let file_cl_id = claimIdFromName(name, allow_loose);
    if (!allow_loose) return file_cl_id;
    if (claim_id) {
        // With loose naming, we prefer the ID given inside the claim
        let r = safeClaimId(claim_id);
        if (file_cl_id && r && !propEqual(file_cl_id, r))
            console.warn(`getClaimId - ID differes between filename <${name}> and inner value: <${r.branch}:${r.version}>`);
        return r;
    }
    return file_cl_id;
}

// Order dependencies on branch <which> up to <number>. Nest and do sub dependencies.
function orderDeps(deps: Dict<Dict<any>[]>, which: string, r: Dict<any>[], upto?: number, depth?: number) {
    if (!depth) depth = 0;
    if (depth++ > 500) return errorRv("orderDeps2 - Infinite recursion?");

    let branch = deps[which];
    if (!branch) return errorRv("orderDeps2 - branch not found: " + which);

    for (let ix = 0; ix < branch.length && (ix <= upto || upto == null); ix++) {
        let claim = branch[ix];
        if (claim && !claim["*ordered"]) {
            if (claim.depends) {
                // Get the nested dependencies 
                let nest_deps = Array.isArray(claim.depends) ? claim.depends : [claim.depends];
                for (let d of nest_deps) {
                    let claim_id = getClaimId("", d);
                    if (claim_id) {
                        if (!orderDeps(deps, claim_id.branch, r, claim_id.version, depth))
                            return;
                    }
                    else console.warn("orderDeps2 - Could not resolve claim: " + claim_id.toString());
                }
            }
            claim["*ordered"] = true;
            r.push(claim);
        }
    }
    return true;
}


// Iterate available paths, look for additional potential deps 
function findOptionalClaims(cl_by_br: Dict<Dict<any>[]>, options: Dict<any>, above?: Dict<number>) {
    let cl_opt: Dict<Dict<any>[]> = {};
    if (options.deps == false) return cl_opt;

    // Look for any dependencies in provided paths. 
    // To find the real claim ID:s we need to actually load them
    // (The filename ID is not decisive)
    let paths: string[] = options.path || ["./"];
    for (let p of paths) {
        let files = readdirSync(p);
        for (let f of files) {
            let id: ClaimId;
            let claim: Dict<any>;
            if (!options.looseNames) {
                id = claimIdFromName(f);
                if (id) {
                    // Have it already? 
                    if (cl_by_br[id.branch]?.[id.version]) continue;
                    try {
                        claim = fileToNestedDict(path.join(p, f), true);
                    } catch (e) {
                        // Do nothing 
                        let _e = e;
                    }
                }
            }
            else {
                // Have to try load, to get the claim ID - this can mean loading completely unrelated JSON / YAML
                try {
                    claim = fileToNestedDict(path.join(p, f), true);
                    if (claim) {
                        id = getClaimId(f, claim.id, true);
                        if (id && cl_by_br[id.branch]?.[id.version]) continue;
                    }
                } catch (e) {
                    // Do nothing 
                    let _e = e;
                }
            }
            if (claim) {
                // Check against the above limit
                if (!above || !above[id.branch] || id.version > above[id.branch]) {
                    cl_opt[id.branch] ||= [];
                    if (!cl_opt[id.branch][id.version])
                        cl_opt[id.branch][id.version] = claim;
                    else
                        console.warn(`findOptionalClaims - Claim with ID <${id.branch}.${id.version}> encountered more than once`);
                }
            }
        }
    }

    return cl_opt;
}

function getClaimDeps(claim: Dict<any>): Dict<number> {
    let d = claim.depends;
    if (!d) return {};
    if (isDict(d)) return d as any;
}

// Sort input trees according to dependency specification 
export function dependencySort(file_dicts: Dict<Dict<any>>, state_base: Dict<any>, options: Dict<any>): Dict<any>[] {
    // This holds all versions numbers of a given branch we will merge
    let cl_by_br: Dict<Dict<any>[]> = {};

    // To be able to see if we're given claims that are already included
    let branches: Dict<number> = state_base.modules;
    let ver_by_br: Dict<number> = {};

    let checkIncludeClaim = (claim: Dict<any>, type?: "in_range") => {
        let { branch: name, version: ver } = claim.id;
        cl_by_br[name] ||= [];

        // Already have it ? 
        if (cl_by_br[name][ver]) return;
        // Are we already past this one ? 
        if (branches[name] && branches[name] >= ver) return;
        if (type == "in_range") {
            // Is it in current range ?
            if (!ver_by_br[name] || ver_by_br[name] <= ver) return;
        }

        // So include it 
        // First time we know it's used. Make sure it is in internal format 
        reformatTopLevel(claim, "internal");
        cl_by_br[name][ver] = claim;
        // See if it is the max version ? 
        if (!ver_by_br[name] || ver_by_br[name] < ver)
            ver_by_br[name] = ver;
        return true;
    }

    // Iterate claims we were explicitely give
    let err_cnt = 0;
    for (let f in file_dicts) {
        let id = getClaimId(f, file_dicts[f].id, options.looseNames);
        let name = id.branch;
        if (name) {
            // Trying to insert claim from earlier part of history ? 
            if (branches[name] && id.version <= branches[name]) {
                console.error(`dependencySort - Branch <${name}> is already at version ${branches[name]}. Was given version ${id.version} to apply now. Rebuild?`);
                err_cnt++;
                continue;
            }
            // Register this claim - with explicit flag
            checkIncludeClaim(file_dicts[f]);
        } else {
            console.error(`dependencySort - No name found (parse failed) for claim: ${f}`);
            err_cnt++;
        }
    }
    if (err_cnt > 0) return;

    // Get additional claims, we possibly need as deps 
    let opt_dicts = findOptionalClaims(cl_by_br, options, branches);
    // We make a consumable array of keys, per module, to avoid O(2) iteration below
    let opt_keys = objectMap(opt_dicts, v => toLut(Object.keys(v), true));


    // Now we need to see what to use, from our optional claims 
    // Since claim_keys will be extended in the loop, we need 
    // a dynamic loop condition 
    let claim_keys = Object.keys(file_dicts);
    for (let ix = 0; ix < claim_keys.length; ix++) {
        let k = claim_keys[ix];
        let claim = file_dicts[k];

        // Pull in previous steps of this claim 
        let branch = claim.id.branch;
        for (let opt_ver in opt_keys[branch]) {
            if (opt_ver == undefined) continue;
            let od = opt_dicts[branch][Number(opt_ver)];
            // If we don't have it, and if the version is in the range... 
            // then include it 
            if (checkIncludeClaim(od, "in_range")) {
                // Then also scan that one for dependencies 
                file_dicts[od.file] = od;
                claim_keys.push(od.file);
                // And consume it 
                delete opt_keys[branch][opt_ver];
            }
        }

        // And pull in branch dependencies 
        let nest_deps = getClaimDeps(claim);
        let o_id = safeClaimId(claim.id);
        for (let d_branch in nest_deps) {
            let d_ver = nest_deps[d_branch];
            let dep_claim = opt_dicts[d_branch]?.[d_ver];
            if (dep_claim) {
                if (checkIncludeClaim(dep_claim)) {
                    // Then also scan that one for dependencies 
                    file_dicts[dep_claim.file] = dep_claim;
                    claim_keys.push(dep_claim.file);
                    delete opt_keys[d_branch][d_ver];
                }
                // Insert the dependee link (opposite direction of dependency link)
                dep_claim.___dependee ||= {};
                dep_claim.___dependee[o_id.branch] = o_id.version;
            }
            else {
                console.error(`dependencySort - Not found, dependent claim: <${d_branch}:${d_ver}>`);
                err_cnt++;
            }
        };
    }

    // Now that we did all strong deps, we can decide if any weak deps should be added
    /*if (claim.weak_depends) {
        // Weak depends are only looked for (and run) if that module has been previously 
        // included/installed. 
    }*/
    if (err_cnt) return;

    type BranchClaims = {
        branch: string;
        ix: number; // This is position in <sorted_versions> not the version itself 
        version_last: number;
        sorted_versions: number[];
        claims: Record<number, Dict<any>>;
    }

    // Prepare the branches 
    let branch_claims: Dict<BranchClaims> = {};
    for (let branch in cl_by_br) {
        // Since versions may be decimal - and the array non dense, we need to do this 
        let sorted_versions = Object.keys(cl_by_br[branch]).map(e => Number(e)).sort();
        branch_claims[branch] = {
            branch,
            ix: 0,
            version_last: dArrAt(sorted_versions, -1),
            sorted_versions,
            claims: cl_by_br[branch]
        };
    }


    // Collect full linear ordering here
    let deps_ordered: Dict<any>[] = [];

    let sortBranchUpTo = (bc: BranchClaims, version?: number) => {
        while (bc.ix < bc.sorted_versions.length) {
            let v = bc.sorted_versions[bc.ix];
            // Reached as high in version as we want? 
            if (version && v > version) return;
            // Increment version here, in order to avoid a dependee call to execute 
            // this once again.
            bc.ix++;
            let claim = bc.claims[v];
            if (claim) {
                // Do any dependencies first ? 
                let deps = getClaimDeps(claim);
                for (let d_branch in deps) {
                    // And run the dependence up to specific version 
                    let bc_dep = branch_claims[d_branch];
                    if (bc_dep)
                        sortBranchUpTo(bc_dep, deps[d_branch]);
                    else { console.error(`runBranchTo - dependency not found: ${d_branch}`); err_cnt++; }
                }
                // Now put us in the linear ordering 
                deps_ordered.push(claim);
                // If we are a dependence, then make sure our dependee is actually sorted now 
                if (claim.___dependee) {
                    for (let dee_branch in claim.___dependee) {
                        // This will be a direct return, if we were called as a dependence 
                        let bc_dee = branch_claims[dee_branch];
                        if (bc_dee)
                            sortBranchUpTo(bc_dee, claim.___dependee[dee_branch]);
                        else { console.error(`runBranchTo - dependendee not found: ${dee_branch}`); err_cnt++; }
                    }
                }
            }
            else {
                console.error(`dependencySort-runBranchTo: Failed locating claim: <${bc.branch}:${version}>`);
                err_cnt++;
            }
        }
    }

    for (let branch in branch_claims) {
        // Run each branch to its end, considering the dependencies 
        let bc = branch_claims[branch];
        sortBranchUpTo(bc);
    }

    if (err_cnt) return;
    return deps_ordered;
}

export function getInitialState() {
    return { modules: {}, ___tables: {} };
}

// Merge dependency ordered claims 
export function mergeClaims(claims: Dict<any>[], merge_base: Dict<any> | null, options: Dict<any>): TableInfoOrErrors {
    let errors: string[] = [];
    if (!merge_base || !merge_base.___tables) merge_base = getInitialState();
    let merge = merge_base.___tables;
    for (let claim of claims) {
        // Keep track of the current version of each module
        if (claim.format != "internal") {
            errors.push(`Claim <${claim.id.branch}:${claim.id.version}> is not in internal format`);
            continue;
        }
        merge_base.modules[claim.id.branch] = claim.id.version;
        let cl_tables: Dict<any> = claim.___tables;
        for (let t in cl_tables) {
            let cols = cl_tables[t];
            let is_dict = isDict(cols);
            if (is_dict && !firstKey(cols)) continue;
            // If the table is created by other branch, make <*refs> structure to track that
            let is_ref = false;
            if (isDict(merge[t])) {
                if (merge[t].___owner != claim.id.branch) {
                    is_ref = true;
                    merge[t].___refs ||= {};
                    merge[t].___refs[claim.id.branch] ||= [];
                    merge[t].___refs[claim.id.branch].push(claim.id.version);
                }
            }
            else merge[t] = { ___owner: claim.id.branch };
            if (is_dict) {
                let m_tbl = merge[t];
                for (let c_name in cols) {
                    let col = cols[c_name];
                    if (!m_tbl[c_name]) {
                        // A new column - accept the various properties 
                        // A known type ? 
                        if (getTypeGroup(col.data_type)) {
                            // !! we could check for  a <*ref> flag (requiring an existing column) 
                            // See if we accept all suggested column keywords 
                            let unknowns = notInLut(col, db_column_words);
                            if (!unknowns) {
                                // Accept column declaration in its fullness
                                m_tbl[c_name] = { ...col }
                                if (claim.id.branch != m_tbl.___owner)
                                    m_tbl[c_name].___owner = claim.id.branch;
                            }
                            else errors.push(`${t}:${c_name} - Unknown column keywords: ${unknowns}`);
                        }
                        else errors.push(`${t}:${c_name} - Unknown column type: ${col.data_type}`);
                    }
                    else {
                        // A ref to a previously declared column. Either a requirement 
                        // on a column in another branch/module, or a reference to one 
                        // 'of our own making' - i.e. we can modify it. 
                        let m_col = m_tbl[c_name];
                        if (m_col.___owner == claim.id.branch ||
                            (!m_col.___owner && m_tbl.___owner == claim.id.branch)) {
                            // Modifying what we declared ourselves 
                            let es = mergeOwnColumnClaim(m_col, col, options);
                            if (es) errors = [...errors, ...es];
                        } else {
                            // Make claims on a column of another branch/module
                            for (let p in col) {
                                if (p == "data_type") {
                                    // Accept same or more narrow datatype 
                                    if (!typeContainsLoose(m_col[p], col[p]))
                                        errors.push(`${t}:${c_name} - reference type <${col[p]}> does not fit in declared type <${m_col[p]}>`);
                                    else {
                                        // Make a ref in the merge tree
                                        m_col.___refs ||= {};
                                        m_col.___refs[claim.id.branch] ||= [];
                                        m_col.___refs[claim.id.branch].push(claim.id.version);
                                    }
                                } else {
                                    if (!db_column_words[p])
                                        errors.push(`${t}:${c_name} - Unknown keyword: ${p}`);
                                    else if (!propEqual(col[p], m_col[p]))
                                        errors.push(`${t}:${c_name} - Reference value of <${p}> differs from declared value: ${col[p]} vs ${m_col[p]}`);
                                }
                            }
                        }
                    }
                }
            }
            else {
                if (cols == "*NOT") {
                    if (is_ref) {
                        // We drop the refs to the table 
                        delete merge[t].___refs[claim.id.branch];
                        // !! Delete references to child props ?
                    }
                    else {
                        // A directive to drop the table 
                        if (!merge[t].___refs || !firstKey(merge[t].___refs)) {
                            // See that it is just not being declared
                            if (Object.keys(merge[t]).length > 1)
                                merge[t] = "*NOT";
                        }
                        else errors.push(`merge: Cannot drop table with references: ${merge[t].___refs}`);
                    }
                }
                else errors.push(`merge: unknown value (${cols}) for table ${t} in branch ${claim.id.branch}`);
            }
        }

    }
    return errors.length ? errors : merge_base;
}

// Merge revised claim into column declared earlier, by the same module
// The general rule is that we accept widening of data type, precision,
// but not that which would likely cause loss of data. 
// TODO: Provide a path to narrow and add constraints, by application 
// specific migration/preparation methods.
function mergeOwnColumnClaim(m_col: Dict<any>, claim: Dict<any>, options: Dict<any>): string[] {
    let r: Dict<any> = {};
    let errors: string[] = [];
    for (let k in claim) {
        if (db_column_words[k]) {
            // All other column props
            if (!propEqual(m_col[k], claim[k])) {
                let is_reffed = isDictWithKeys(m_col[k]?.___refs);
                let ref_error = false;
                let range_error = false;
                let reason: string;
                switch (k) {
                    case "data_type":
                        // We can widen the data type 
                        if (!typeContainsLoose(claim.data_type, m_col.data_type)) {
                            // ... but refuse to go to a more narrow type 
                            reason = `Cannot safely go from type: ${m_col.data_type} to ${claim.data_type}`;
                        }
                        else {
                            // If new type has no arg, need to clean those away 
                            if (!db_types_with_args[claim.data_type]) {
                                for (let ta in db_type_args)
                                    delete m_col[ta];
                            }
                            else {
                                // Even w type args, we may need to delete non used type args
                            }
                        }
                        break;
                    case "max_length":
                    case "numeric_precision":
                    case "numeric_scale":
                        // For these, we can increase the value, as long as that 
                        // is inline also with reference to this prop 
                        if (claim[k] < m_col[k])
                            reason = `Unsafe target value: ${claim[k]} should be more than: ${m_col[k]}`;
                        break;
                    case "is_primary_key":
                    case "has_auto_increment":
                        if (claim[k]) reason = `Cannot safely add/remove constraint ${k} now`;
                        break;
                    case "is_unique":
                        // We allow to go back to nullable - DB is fine w that 
                        if (is_reffed) ref_error = true;
                        else if (claim[k]) reason = "Cannot add constraint UNIQUE now";
                        break;
                    case "is_nullable":
                        // We allow to go back to nullable - DB is fine w that 
                        if (is_reffed) ref_error = true;
                        else if (!claim[k]) reason = "Cannot add constraint NOT NULLABLE now";
                        break;
                    default:
                        ref_error = is_reffed;
                        break;
                }
                if (ref_error && !reason)
                    reason = `${k} is referenced by: (${m_col[k].___refs})`;
                if (!reason)
                    r[k] = claim[k];
                else {
                    errors.push(`mergeOwnColumnClaim - Skipping modification: ${k}: ${m_col[k]} => ${claim[k]} ` +
                        `(${reason})`);
                }
            }
        }
        else errors.push(`mergeOwnColumnClaim - Unknown column keyword: ${k}`);
    }

    // Merge, even if we have errors 
    for (let k in r)
        m_col[k] = r[k];

    if (errors.length) return errors;
}

