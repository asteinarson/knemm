import {
    invert as ldInvert, Dict, isArray, toLut, firstKey, tryGet, errorRv,
    notInLut, isDict, isArrayWithElems, isDictWithKeys, isString, dArrAt,
    objectMap, append, objectPrune, deepCopy, findValueOf, isNumber
} from './utils';

import { db_column_flags, db_column_words, db_ref_lockable, db_types_with_args, db_type_args, getTypeGroup, typeContainsLoose } from './db-props';

import { BTDict3, ClaimId, ClaimState, Claim, State, TableProps, ColumnProps, ForeignKey, isClaimState, isState, isTableProps, Tables, BTDict2, BTDict1, RefColumnProps, BaseColumnProps, versionOf } from "./types";

import { fileNameOf, getStoreStdin, isDir, pathOf, slurpFile } from "./file-utils";
import { connect, connectCheck, disconnect, getClientType, modifySchema, quoteIdentifier, slurpSchema } from './db-utils'
import { existsSync, readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';

import { formatInternal, formatHrCompact } from "./hrc";
import { Knex } from 'knex';
import { fstat, readFileSync } from 'fs';

export type TableInfoOrErrors = Dict<any> | string[];

export function getStateDir(options: any) {
    let state_dir: string;
    if (options.state) {
        if (options.state == true)
            state_dir = "./";
        else {
            state_dir = options.state;
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

export function storeState(state: State | Dict<TableProps>, new_claims?: Dict<Claim>, state_loc?: string, options?: Dict<any>) {
    if (options?.dry) return true;
    // Have somewhere to store state ? 
    let dir = state_loc;
    if (!dir && isClaimState(state)) dir = state.file;
    if (!dir) return errorRv("storeState - No storage path/location provided ");

    let state_file: string;
    if (dir.slice(5) == ".yaml") {
        state_file = dir;
        dir = pathOf(state_file);
    }
    else
        state_file = path.join(dir, "___merge.yaml");
    if (!existsSync(dir))
        return errorRv("storeState - Dir does not exist: " + dir);

    // Normalize the state
    if (!isState(state))
        state = getInitialState(state);
    else
        reformatTopLevel(state);

    // Write input claims to state dir
    for (let f in new_claims || {}) {
        let claim = new_claims[f];
        let fname = claim.id.branch + "_" + claim.id.version + ".yaml";
        let tgt_name = path.join(dir, fname);
        writeFileSync(tgt_name, yamlDump(claim));
        if (!existsSync(tgt_name)) console.warn(`storeState - Failed copy file: ${f} to ${tgt_name}`);
    }

    // And write the new state
    if (existsSync(state_file)) rmSync(state_file);
    writeFileSync(state_file, yamlDump(state));
    if (!existsSync(state_file)) return false;

    // Now it is a state
    state.source = "*state";
    state.file = state_file;
    return true;
}

const state_excludes: Dict<1> = {
    "___merge.yaml": 1,
    "___db.yaml": 1,
}

function excludeFromState(file: string) {
    if (state_excludes[file]) return true;
    if (file.slice(0, 7) == "___xti." && file.slice(-5) == ".yaml") return true;
}

const re_yj = /\.(json|yaml|JSON|YAML)$/;

// Rebuild the state directory from claims that are stored in the directory
export function rebuildState(state_dir: string, options: Dict<any>): boolean {
    if (!existsSync(state_dir))
        return errorRv(`rebuildState - Directory ${state_dir} not found`);

    // Build a list of modules with last versions 
    let file_dicts: Dict<Claim> = {};
    for (const f of readdirSync(state_dir)) {
        if (excludeFromState(f)) continue;
        if (f.match(re_yj)) {
            try {
                // Doing the await here (fileToClaim declared async without being so) 
                // causes nested function to return to the parent function (!)
                //let r = await fileToClaim(path.join(state_dir, f), true);
                let r = fileToClaim(path.join(state_dir, f), true, "internal");
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
    if (isState(r)) {
        storeState(r, {}, state_dir, options);
        return true;
    }
    else {
        r.forEach(e => console.error("rebuildState: " + e));
    }
}

export function sortMergeStoreState(
    file_dicts: Dict<Claim>,
    state_dir: string,
    state_base: State,
    options: Dict<any>)
    : State | string[] {
    let dicts = dependencySort(file_dicts, state_base, options);
    if (!dicts) return ["sortMergeStoreState - Failed dependencySort"];
    if (!dicts.length) return state_base;

    let state = mergeClaims(dicts, state_base, options);
    if (isState(state)) {
        if (state_dir && dicts.length)
            storeState(state, file_dicts, state_dir, options);
    }
    return state;
}

export function slurpDbFile(db_file: string): Dict<any> {
    // Look for a connection file - or use ENV vars 
    let file = "%";
    if (db_file == "" || db_file == "%") {
        // With '%', first look for a default DB conn file
        let f = path.join("./", "%") + ".json";
        if (existsSync(f)) file = f;
        else {
            f = path.join("./", "%") + ".yaml";
            if (existsSync(f)) file = f;
        }
    }
    else file = db_file;
    if (file) {
        try {
            let r = slurpFile(file);
            if (isDict(r)) return r;
            else return errorRv("slurpDbFile - failed slurpFile: " + file);
        } catch (e) {
            return errorRv("slurpDbFile - exception: " + e);
        }
    }
    return errorRv("slurpDbFile - could not locate: " + file);
}

export function normalizeConnInfo(conn_info: Dict<any> | string) {
    if (!conn_info) return;
    if (isString(conn_info)) {
        // Mutual recursion is OK - progress in each step
        return parseDbSpec(conn_info);
    }

    if (!conn_info.connection) {
        let connection = ["host", "user", "password", "database", "filename"].reduce<Dict<any>>((r, v) => {
            if (conn_info[v]) {
                r[v] = conn_info[v];
                delete conn_info[v];
            }
            return r;
        }, {});
        conn_info.connection = connection;
    }
    if (!conn_info.connection.host) conn_info.connection.host = "localhost";

    if (!conn_info.client) {
        // Some logic to get a specific DB client type
        let client = process.env.DBCLIENT || process.env.DEFAULT_DBCLIENT;
        if (!client) {
            // Possible to do something more fancy here ? 
            client = "pg";
        }
        conn_info.client = client;
    }

    // This is a way to point Sqlite at a DB file, if we don't have it yet
    if (conn_info.client == "sqlite3" && !conn_info.connection.filename) {
        let db_name = conn_info.connection.database;
        if (db_name) {
            let fn = sqliteDbToFilename(db_name);
            if (fn) conn_info.connection.filename = fn;
        }
    }

    return conn_info;
}

const re_is_db_spec = /[@%:=\?]/;
const re_file = /(%([\w.-]*))([:@=].*)?$/;
const re_db = /(:([\w.-/]+))([%@=].*)?$/;
const re_user_pass = /^([\w.-]+)?(\?([\w.-]+))?([@%:=].*)?$/;
const re_client = /(@([\w]+))([%:=].*)?$/;
const re_host = /(=([\w.-]+))([@%:].*)?$/;

export function isDbScpec(s: string) {
    return !!s.match(re_is_db_spec);
}

// According to reg exprs above, it can parse strings like: 
//   %              // Read conn info from %.json or %.yaml 
//   %db_file.json          // Read conn info from this file 
//   %db_file.json:my_db    // As above, but modify DB to <my_db>
//   bob?some_pass%   // Give user creds
//   bob?some_pass@pg:this_db   // Give user creds, db client type and DB
//   bob?some_pass@pg:this_db=192.10.2.10 // As above, but specify a host
export function parseDbSpec(db_spec: string): Dict<any> {
    // Extract out DB connection info from <db_spec> string 

    // These are the specified ones 
    let md_db = db_spec.match(re_db) || [];
    let md_user_pass = db_spec.match(re_user_pass) || [];
    let md_client = db_spec.match(re_client) || [];
    let md_host = db_spec.match(re_host) || [];
    let spec_vals = {
        user: md_user_pass[1],
        password: md_user_pass[3],
        client: md_client[2],
        database: md_db[2],
        host: md_host[2],
    }
    //console.log(spec_vals,"spec_vals");

    // And these come from connection file, if any 

    // Order of use is:
    // 1 - db_spec string
    // 2 - db_file
    // 3 - default_keys 
    let md_file = db_spec.match(re_file) || [];
    let db_file = md_file[2];
    let r = md_file[1] ? parseDbFile(db_file, true) : getDefaultDbVals();
    if (!r) return;
    //console.log(r,"after_file vals");

    objectPrune(spec_vals, e => !e);
    //console.log(spec_vals,"spec_vals");
    r = { ...r, ...spec_vals };

    //console.log(r,"...");
    return normalizeConnInfo(r);
}

function getDefaultDbVals() {
    // Default vals, or from env 
    let default_vals: Dict<string | undefined | boolean> = {
        host: process.env.DBHOST || process.env.HOST || "localhost",
        user: process.env.DBUSER || process.env.USER,
        password: process.env.DBPASSWORD || process.env.PASSWORD,
        database: process.env.DATABASE || process.env.DEFAULT_DATABASE,
        client: process.env.DBCLIENT || process.env.DEFAULT_DBCLIENT || "pg",
    };
    if (process.env.USE_NULL_AS_DEFAULT)
        default_vals.useNullAsDefault = true;
    return default_vals;
}

export function parseDbFile(db_file: string, flat?: boolean): Dict<any> {
    // Extract out DB connection info from <db_spec> string 

    // And these come from connection file, if any 
    let file_vals = slurpDbFile(db_file);
    if (!file_vals) return errorRv(`parseDbFile - Failed parsing: ${db_file}`);

    // Order of use is:
    // (1 - db_spec string) - not here
    // 2 - db_file
    // 3 - default_keys 
    let r = getDefaultDbVals();
    objectPrune(file_vals, e => !e);
    r = { ...r, ...file_vals };

    if (!flat) return normalizeConnInfo(r);
    else {
        // Flatten out, for now 
        if (r.connection) {
            let rc = r.connection as any as Dict<any>;
            r = { ...r, ...rc };
            delete r.connection;
        }
        return r;
    }
}

async function dbSpecToKnex(db_spec: string): Promise<Knex> {
    let conn_info = parseDbSpec(db_spec);
    // Get our dict from DB conn ? 
    if (conn_info) {
        try {
            return await connect(conn_info);
        } catch (e) {
            return errorRv(`dbFileToKnex - failed connect for <${db_spec}>: ${e}`);
        }
    }
}

export async function existsDb(db_file: string | Dict<any>, db_name?: string): Promise<boolean | string> {
    let conn_info: Dict<any> = normalizeConnInfo(db_file);
    if (!conn_info) return "existsDb - could not get DB connection info";
    if (!db_name) {
        db_name = conn_info.connection.database;
        if (!db_name) return "existsDb - no name given, for DB to check for";
    }

    // We modify conn_info below. Do not affect incoming object.
    if (conn_info == db_file) conn_info = deepCopy(conn_info);

    if (conn_info.client == "sqlite3")
        return existsDbSqlite(conn_info, db_name);

    // Try to connect to the DB - with named DB - should fail 
    conn_info.connection.database = db_name;
    let r = await connectCheck(conn_info);

    if (r) return true;
}

function sqliteDbToFilename(db_name: string) {
    for (let fn of [db_name, db_name + ".sqlite"]) {
        if (existsSync(fn)) {
            return fn;
        }
    }
}

function existsDbSqlite(conn_info: Dict<any>, db_name?: string) {
    if (!db_name) db_name = conn_info?.connection?.database;
    if (!db_name) return;
    // We do not do a connectCheck here - 
    // as it would create the DB.
    return sqliteDbToFilename(db_name) != undefined;
}

export async function createDb(db: string | Dict<any>, db_name?: string): Promise<Dict<any> | string> {
    let conn_info: Dict<any> = normalizeConnInfo(db);
    if (!conn_info) return "createDb - could not connect to DB";
    if (!db_name) {
        db_name = conn_info.connection.database;
        if (!db_name) return "createDb - no name given, for DB to be created";
    }

    // We modify conn_info below. Do not affect incoming object.
    if (conn_info == db) conn_info = deepCopy(conn_info);

    // Try connecting to the given DB - should fail
    if (conn_info.client == "sqlite3")
        return createDbSqlite(conn_info, db_name);

    // Try to connect to the DB - with named DB - should fail 
    conn_info.connection.database = db_name;
    let knex_c = await connectCheck(conn_info);
    if (knex_c)
        return `createDb - Database ${db_name} already exists`;

    // Remove the DB name - and retry 
    delete conn_info.connection.database;
    knex_c = await connectCheck(conn_info);
    if (!knex_c) return `createDb - Failed connect without DB name (${db_name})`;

    // And then create it
    try {
        let sql = "CREATE DATABASE " + quoteIdentifier(knex_c, db_name) + ";";
        let r = await knex_c.raw(sql);
        // Then try to connect to it
        conn_info.connection.database = db_name;
        knex_c = await connectCheck(conn_info);
        if (knex_c) return conn_info;
        return `createDb - Failed create DB: ${db_name}`;
    } catch (e) {
        console.warn("createDb - exception: " + db_name);
        let x = 1;
    }

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

export async function dropDb(db_spec: string | Dict<any>, db_name: string): Promise<Dict<any> | string> {
    let conn_info: Dict<any> = normalizeConnInfo(db_spec);
    if (!conn_info) return "dropDb - could not parse DB connect info";
    if (!db_name) return "dropDb - explicit DB name required to drop ";

    // We modify conn_info below. Do not affect incoming object.
    if (conn_info == db_spec) conn_info = deepCopy(conn_info);

    if (conn_info.client == "sqlite3")
        return dropDbSqlite(conn_info, db_name);

    // Check connect - wo overwriting old database property
    conn_info.connection.database = db_name;
    let knex_c = await connectCheck(conn_info);
    if (!knex_c) return "dropDb: Failed connecting to the database"

    // And drop the DB - need a new connection - w.o. specific DB for that 
    try {
        // Since we want to drop this DB, on a connection with no DB specified
        // we must close it ion order to do so
        await disconnect(knex_c);
        delete conn_info.connection.database;
        knex_c = await connectCheck(conn_info);
        let sql = "DROP DATABASE " + quoteIdentifier(knex_c, db_name) + ";";
        let r = await knex_c.raw(sql);
        return conn_info;
    } catch (e) {
        return `dropDb - Failed executing DROP DATABASE: ${db_name}`;
    }
}

function dropDbSqlite(conn_info: Dict<any>, db_name: string): Dict<any> | string {
    if (!conn_info) return "dropDb - could not parse DB connect info";
    for (let fn of [db_name, db_name + ".sqlite"]) {
        if (existsSync(fn)) {
            rmSync(fn);
            if (!existsSync(fn)) return conn_info;
        }
    }
    return "dropDbSqLite: DB not found: " + db_name;
}

export async function connectState(state_dir: string, db_spec: string | Dict<any>, options: Dict<any>): Promise<true | string> {
    let conn_info = normalizeConnInfo(db_spec);
    if (!conn_info) return `connectState - Could not parse: ${db_spec}`;
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

export function toState(dir_file: string, quiet?: boolean): State {
    if (!existsSync(dir_file))
        return quiet ? undefined : errorRv(`toState - State dir/file does not exist: ${dir_file}`);
    let m_yaml: string;
    if (isDir(dir_file))
        m_yaml = path.join(dir_file, "___merge.yaml");
    else m_yaml = dir_file;
    if (!existsSync(m_yaml))
        return quiet ? undefined : errorRv(`toState - Merge file does not exist: ${m_yaml}`);

    let r = slurpFile(m_yaml);
    if (!isDict(r))
        return errorRv(`toState - Failed reading: ${m_yaml}`);
    // Is it actually a state ? 
    if (!r.___tables || !r.modules || r.id)
        return errorRv(`toState - Internal structure is not a state: ${m_yaml}`);

    r.source = "*state";
    r.file = m_yaml;
    r.format = "internal";
    r.modules ||= {};
    return r as State;
}

export type FormatType = "internal" | "hr-compact";

export function reformatTables(tables: Dict<any>, format?: FormatType): Dict<any> {
    return format == "hr-compact" ? formatHrCompact(tables) : formatInternal(tables);
}

export function reformatTopLevel(claim: ClaimState, format?: FormatType) {
    if (claim.___tables) {
        if (!format) format = "internal";
        if (claim.format != format) {
            claim.___tables = reformatTables(claim.___tables, format);
            claim.format = format;
        }
    }
    else
        claim.___tables = {}
}

export function normalizeClaim(
    claim: Claim | Dict<TableProps>,
    file: string,
    format?: FormatType,
    allow_loose?: boolean): Claim {

    // Is it a claim with top level props, or just the tables? 
    let r: Claim;
    if (isClaimState(claim))
        r = claim;
    else
        r = { ___tables: claim, format: "?", id: undefined }

    r.source = "*file";
    r.file = file;
    r.format ||= "?";

    // Make the ID in ClaimId format 
    let id = claimIdFromName(file);
    if (!r.id) {
        if (!id) return;
        r.id = id;
    }
    else {
        let r_id = safeClaimId(r.id);
        if (id && (r_id.branch != id.branch || r_id.version != id.version)) {
            if (file != "-") {
                let msg = `normalizeClaim: ID declared in claim <${r.id.branch}:${r.id.version}> does not match that in filename: <${file}>`;
                if (!allow_loose)
                    return errorRv(msg);
                else
                    console.warn(msg);
            }
        }
        r.id = r_id;
    }

    // Normalize the depends node - if any 
    let deps = r.depends;
    if (deps) {
        if (!isDict(deps))
            return errorRv(`normalizeClaim: Unknown format for dependency: ${deps}`);

        for (let module in deps) {
            let dep = deps[module];
            if (!dep.___version)
                return errorRv(`normalizeClaim: No version for dependency: ${module}`);
            let ver = versionOf(dep);
            if (!ver) return errorRv(`normalizeClaim: Cannot parse version for dependency: ${module} - ${dep.___version}`);
            dep.___version = ver as any;
        }
    }
    else r.depends = {};

    reformatTopLevel(r, format);
    return r;
}

export function fileToClaim(file: string, quiet?: boolean, format?: FormatType, options?: Dict<any>) {
    // Then it should be a file 
    let rf = slurpFile(file, quiet);
    if (isDict(rf))
        return normalizeClaim(rf, file, format, options?.looseNames);

    if (!quiet) {
        if (!rf)
            console.warn("fileToClaim - file not found: " + file);
        else
            console.warn("fileToClaim - file is not a claim: " + file);
    }
}

let re_m_yaml = /___merge.yaml$/;

// Read a file, a directory or a DB into a schema state object
export async function toStateClaim(file_or_db: string, options: Dict<any>): Promise<Claim | State> {
    if (!file_or_db) return null;

    let r: Claim | State;
    if (isDbScpec(file_or_db)) {
        let knex_c = await dbSpecToKnex(file_or_db);
        if (!knex_c) return errorRv("toStateClaim - Could not connect to DB");
        let rs = await slurpSchema(knex_c, options.xti, options.include, options.exclude);
        if (rs) {
            // Keep the connection object here - it allows later knowing it is attached to a DB
            r = {
                source: "*db",
                connection: knex_c,
                format: "internal",
                ___tables: rs
            } as State;
        }
        else return errorRv("toStateClaim - Failed slurpSchema");
    }
    else if (file_or_db == "-") {
        // stdin - as a claim 
        let s_in = getStoreStdin();
        if (!s_in) return errorRv(`toStateClaim - File not found: ${file_or_db}`);
        // Undefined if YAML / JSON, try both 
        let r_y: any;
        try {
            let r_y = yamlLoad(s_in);
        } catch (e) {
            try {
                let r_y = JSON.parse(s_in);
            } catch (e) {
                return errorRv("toStateClaim - Failed parsing stdin, exception: " + e.toString());
            }
        }
        if (isDict(r_y)) return errorRv("toStateClaim - Input on stdin does not form a valid claim");
        r = normalizeClaim(r_y, "-", "internal", true);
    }
    else if (isDir(file_or_db) || file_or_db.match(re_m_yaml) ||
        (!options.looseNames && !claimIdFromName(file_or_db))) {
        r = toState(file_or_db);
    }
    else {
        // Try the various paths supplied 
        let paths = getPaths(options, file_or_db);
        for (let p of paths) {
            let fn = p ? path.join(p, file_or_db) : file_or_db;
            if (existsSync(fn)) {
                r = fileToClaim(fn, false, "internal", options);
                // See if it was actually a state, if failed
                if (!r && options.looseNames)
                    r = toState(file_or_db);
                if (r) break;
            }
        }
        if (!r) {
            return errorRv(`toStateClaim - File not found: ${file_or_db}`);
        }
    }

    return r;
}

// This does an exact comparison of properties 
function propEqual(v1: BTDict3, v2: BTDict3) {
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

// Helper functions for generic comparison of candidate and target properties 
function fitsDataType(cand: BaseColumnProps, tgt: BaseColumnProps, prop: string) {
    return typeContainsLoose(cand.data_type, tgt.data_type);
}

function fitsSmallerEqual(cand: BaseColumnProps, tgt: BaseColumnProps, prop: string) {
    let c_val = cand[prop];
    let t_val = tgt[prop];
    if (t_val != null) {
        if (!c_val) return;
        return t_val <= c_val;
    }
    //return c_val==null;
}

function fitsEqual(cand: BaseColumnProps, tgt: BaseColumnProps, prop: string) {
    return propEqual(cand[prop], tgt[prop]);
}

type PropCmpFn = (cand: BaseColumnProps, tgt: BaseColumnProps, prop: string) => boolean;
let prop_fit_fn: Dict<PropCmpFn> = {
    data_type: fitsDataType
};
// Insert those existing props which satisfy SmallerEqual 
for (let prop in db_type_args)
    prop_fit_fn[prop] = fitsSmallerEqual;

// Generic property fit test - depending on property
function propFits(cand: BaseColumnProps, tgt: BaseColumnProps, prop: string) {
    let fit_fn = prop_fit_fn[prop];
    if (!fit_fn) fit_fn = fitsEqual;
    return fit_fn(cand, tgt, prop);
}

// This generates the smallest diff that can adapt the candidate to fulfill 
// the target specification. Or an array of errors, if not possible. 
function matchDiffColumn(col_name: string, cand_col: ColumnProps, tgt_col: ColumnProps, candidate: Tables, r_delta: Dict<any>): TableInfoOrErrors {
    let r: Dict<any> = {};
    let errors: string[] = [];

    for (let tk in tgt_col) {
        // If property is different, we need to do something 
        let tv = tgt_col[tk], cv = cand_col[tk];
        if (!propEqual(tv, cv)) {
            switch (tk) {
                case "___refs":
                case "___branch":
                    break;
                case "data_type":
                    if (isString(cv) && isString(tv)) {
                        if (!typeContainsLoose(cv, tv)) {
                            // The candidate type does not hold, see if we can expand it 
                            if (typeContainsLoose(tv, cv))
                                r.data_type = tv;
                            else
                                errors.push(`${col_name} - Types are not compatible: ${cv}, ${tv} `);
                        }
                    }
                    else if (!cv && isString(tv) && getTypeGroup(tv))
                        r.data_type = tv;
                    else
                        errors.push(`${col_name} - data_type - cannot parse: ${cv}, ${tv} `);
                    break;
                case "is_nullable":
                    if (tv) {
                        // We can safely go from notNullable => nullable
                        if (cv == false)
                            r.is_nullable = true;
                    }
                    else {
                        if (candidate[col_name]) {
                            // Only an issue if column existed
                            // If the column is a primary key, it is automatically not nullable
                            if (!tgt_col.is_primary_key)
                                errors.push(`${col_name} - Cannot safely go from nullable => notNullable `);
                        }
                        else r.is_nullable = false;
                    }
                    break;
                case "is_unique":
                    if (!tv) {
                        // We can safely drop unique constraint 
                        if (cv)
                            r.is_unique = false;
                    }
                    else if (candidate[col_name])
                        errors.push(`${col_name} - Cannot safely go to unique `);
                    else r.is_unique = true;
                    break;
                case "is_primary_key":
                    // We can actually go both ways here - w.o data loss 
                    // For primary key - and an integer type - we must upgrade 
                    // the type to unsigned (for possibility of MySQL).
                    // Or do via XTI (?)
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
                    let fk = tgt_col.foreign_key;
                    let fk_c = cand_col.foreign_key;
                    // Accept if candidate does not specify another foreign key 
                    if (fk && fk != "*NOT") {
                        if (!fk_c || fk_c == "*NOT") {
                            if (fk.table && fk.column) {
                                // Check for the existence of this table and column
                                let fk_ref_col = (candidate[fk.table] as any)?.[fk.column];
                                if (!fk_ref_col)
                                    fk_ref_col = r_delta[fk.table]?.[fk.column];
                                if (fk_ref_col) {
                                    // And that the type matches
                                    if (fk_ref_col.data_type == tgt_col.data_type)
                                        r.foreign_key = tv;
                                    else errors.push(`${col_name} - Foreign key referenced column type differs: ${fk_ref_col.data_type} vs ${tgt_col.data_type}`);
                                }
                                else errors.push(`${col_name} - Foreign key referenced table/column is missing: ${JSON.stringify(tv)}`);
                            }
                            else errors.push(`${col_name} - Foreign key lacks table/column: ${JSON.stringify(fk)}`);;
                        }
                        else {
                            if (fk.table != fk_c.table || fk.column != fk_c.column)
                                errors.push(`${col_name} - Foreign key info mismatch: ${fk.table}:${fk.column} => ${fk_c.table}:${fk_c.column}`);
                        }
                    }
                    else if (fk == "*NOT" || fk === null) {
                        if (fk_c && fk_c != "*NOT") {
                            r.foreign_key = "*NOT";
                        }
                    }
                    else errors.push(`${col_name} - Foreign key - unable to parse: ${tv}`);
                    break;
                case "numeric_precision":
                case "numeric_scale":
                case "max_length":
                    // Forward if we have a data type change
                    // !! Also forward if the value itself changes - a bit tricky
                    if (tgt_col.data_type) {
                        if (tgt_col.data_type != cand_col?.data_type)
                            r[tk] = tv;
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
export function matchDiff(candidate: Tables, target: Tables): TableInfoOrErrors {
    let r: Dict<any> = {};
    let errors: string[] = [];
    // Iterate tables 
    for (let kt in target) {
        let tgt_table = target[kt];
        let cand_table = tryGet(kt, candidate, {});
        if (isDict(tgt_table)) {
            if (cand_table == "*NOT") cand_table = {};
            // Iterate columns 
            for (let kc in tgt_table) {
                if (kc == "___branch") continue;
                let tgt_col = tgt_table[kc];
                let cand_col = tryGet(kc, cand_table, {});
                let diff_col: Dict<any> | string;
                if (isDict(tgt_col)) {
                    // We can safely replace *NOT here 
                    if (isString(cand_col)) cand_col = {};
                    let dc = matchDiffColumn(kc, cand_col, tgt_col, candidate, r);
                    if (isDict(dc)) {
                        if (firstKey(dc))
                            diff_col = dc;
                    }
                    else errors = [...errors, ...dc];
                }
                else {
                    if (tgt_col == "*NOT") {
                        // We only need to generate this if the table exists in the candidate
                        if (isDict(cand_col) && firstKey(cand_col)) {
                            // !! Check for refs
                            diff_col = "*NOT";
                        }
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
                if (cand_table && cand_table != "*NOT")
                    r[kt] = "*NOT";
            }
        }
    }
    return errors.length ? errors : r;
}


function getXtiFile(dir: string, db_conn: Knex | Dict<any>) {
    if (!dir || !db_conn) return;
    let xti_file = path.join(dir, "___xti." + getClientType(db_conn) + ".yaml");
    return xti_file;
}

export function slurpXti(dir: string, db_conn: Knex | Dict<any>): Dict<any> {
    if (!dir || !db_conn) return;
    let xti_file = getXtiFile(dir, db_conn);
    let r = slurpFile(xti_file, true, isDict);
    return r as any as Dict<any>;
}

export type SyncResult = {
    type: "errors" | "queries";
    r: string[];
};

export async function syncDbWith(state: State, db_conn: Dict<any> | string, options: Dict<any>): Promise<true | SyncResult> {
    let SyncError = (msg: string | string[]) => {
        let rv: SyncResult = { type: "errors", r: isArray(msg) ? msg : [msg] };
        return rv;
    }

    // Prepare
    db_conn = normalizeConnInfo(db_conn);
    if (!db_conn) return SyncError("syncDbWith - Failed normalizeConnInfo for: " + db_conn);

    let knex_c = await connect(db_conn);
    if (!knex_c) return SyncError("syncDbWith - Failed connect");
    let xti = slurpXti(options.state, db_conn);
    let state_db = await slurpSchema(knex_c, xti, options.include, options.exclude);
    if (!state_db) return SyncError("syncDbWith - Failed slurpSchema");

    // Do the diff 
    let diff = matchDiff(state_db, state.___tables);
    let query_log = options.showQueries;
    if (isArray(diff)) return SyncError(diff);
    if (!firstKey(diff)) {
        return !query_log ? true : { type: "queries", r: [] };
    }

    // So we have a minimal diff to apply one the DB 
    try {
        let ___cnt = xti?.___cnt;
        let xti_new = await modifySchema(knex_c, diff, state_db, xti, query_log);
        // If XTI was modified, rewrite this file 
        // Should this really be done in storeState ?!
        if (isDict(xti_new)) {
            if (xti_new?.___cnt != ___cnt)
                writeFileSync(getXtiFile(options.state, db_conn), yamlDump(xti_new));
        }
        else return { type: "queries", r: [xti_new] };
    } catch (e) {
        return SyncError(["syncDbWith: exception in modifySchema: ", e.toString()]);
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

function claimIdFromName(name: string, allow_loose?: boolean): ClaimId {
    // Special case for STDIN
    if (name == "-") return { branch: "STDIN", version: 1 };

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
    if (name != "-" && !allow_loose) return file_cl_id;
    if (claim_id) {
        // With loose naming, we prefer the ID given inside the claim
        let r = safeClaimId(claim_id);
        if (file_cl_id && r && !propEqual(file_cl_id, r) && name != "-")
            console.warn(`getClaimId - ID differs between filename <${name}> and inner value: <${r.branch}:${r.version}>`);
        return r;
    }
    return file_cl_id;
}

// Get suitable paths, optionally for one specific file  
function getPaths(options: Dict<any>, file?: string) {
    if (file && path.isAbsolute(file)) return [""];
    else {
        let paths = ["./"];
        if (options.path) append(paths, options.path);
        return paths;
    }
}

// Iterate available paths, look for additional potential deps 
function findOptionalClaims(cl_by_br: Dict<Claim[]>, options: Dict<any>, above?: Dict<number>) {
    let cl_opt: Dict<Claim[]> = {};
    if (options.deps == false) return cl_opt;

    // Look for any dependencies in provided paths. 
    // To find the real claim ID:s we need to actually load them
    // (The filename ID is not decisive)
    let paths = getPaths(options);
    for (let p of paths) {
        let files: string[];
        try {
            files = readdirSync(p);
        } catch (e) {
            console.warn(`findOptionalClaims - no such directory: ${p}`);
            continue;
        }
        for (let f of files) {
            let id: ClaimId;
            let claim: Claim;
            if (!options.looseNames) {
                id = claimIdFromName(f);
                if (id) {
                    // Have it already? 
                    if (cl_by_br[id.branch]?.[id.version]) continue;
                    try {
                        claim = fileToClaim(path.join(p, f), true);
                    } catch (e) {
                        // Do nothing 
                        let _e = e;
                    }
                }
            }
            else {
                // Have to try load, to get the claim ID - this can mean loading completely unrelated JSON / YAML
                try {
                    claim = fileToClaim(path.join(p, f), true);
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
                if (!above?.[id.branch] || id.version > above[id.branch]) {
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

// Sort input trees according to dependency specification 
export function dependencySort(file_dicts: Dict<Claim>, state_base: State, options: Dict<any>): Claim[] {
    // This holds all versions numbers of a given branch we will merge
    let cl_by_br: Dict<Claim[]> = {};

    // To be able to see if we're given claims that are already included
    let branches: Dict<number> = state_base.modules;
    let ver_by_br: Dict<number> = {};

    let checkIncludeClaim = (claim: Claim, type?: "in_range") => {
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

    // Iterate claims we were explicitly given
    let err_cnt = 0;
    for (let f in file_dicts) {
        let id = getClaimId(f, file_dicts[f].id, options.looseNames);
        let name = id.branch;
        if (name) {
            // Trying to insert claim from earlier part of history ? 
            if (branches[name] && id.version <= branches[name]) {
                if (f != "-" || name != "STDIN") {
                    console.error(`dependencySort - Branch <${name}> is already at version ${branches[name]}. Was given version ${id.version} to apply now. Rebuild?`);
                    err_cnt++;
                    continue;
                }
                else {
                    // Increment the version of STDIN branch
                    let stdin_v = branches.STDIN || 0;
                    file_dicts[f].id.version = stdin_v + 1;
                }
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

    // Helper include function, to update local state
    let checkIncludeDep = (d: Claim, type?: "in_range") => {
        if (!checkIncludeClaim(d, type)) return;
        // Then also scan the new one for dependencies 
        file_dicts[d.file] = d;
        claim_keys.push(d.file);
        // And consume it 
        delete opt_keys[d.id.branch][d.id.version];
        return true;
    }

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
            checkIncludeDep(od, "in_range");
        }

        // And pull in branch dependencies 
        let o_id = safeClaimId(claim.id);
        for (let d_branch in claim.depends) {
            let d_ver = versionOf(claim.depends[d_branch]);
            let dep_claim = opt_dicts[d_branch]?.[d_ver];
            if (dep_claim)
                checkIncludeDep(dep_claim);
            else {
                // Could have been included already
                dep_claim = cl_by_br[d_branch]?.[d_ver];
            }
            if (dep_claim) {
                // Insert the dependee link (opposite direction of dependency link)
                // It can be that several claims in this branch refers to the same claim in another branch. 
                // Then store the highest number of those
                dep_claim.___dependee ||= {};
                let o_id_prv_version = dep_claim.___dependee[o_id.branch];
                if (o_id_prv_version == undefined || o_id.version > o_id_prv_version)
                    dep_claim.___dependee[o_id.branch] = o_id.version;
            }
            else {
                // Is it a dependency already in the state ? 
                if (!branches[d_branch] || branches[d_branch] < d_ver) {
                    console.error(`dependencySort - Not found, dependent claim: <${d_branch}:${d_ver}>`);
                    err_cnt++;
                }
                else if (branches[d_branch] > d_ver) {
                    console.warn(`dependencySort - dependent claim gap to: <${d_branch}:${d_ver}> (from: <${o_id.branch}:${o_id.version}>)`);
                }
            }
        };
    }

    // !! TODO Weak dependencies are such that they are only enforced if the dependent 
    // module is actually pulled in already. A weak dep is not pulled in, by the the
    // weak dep declaration. 
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
        claims: Record<number, Claim>;
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
    let deps_ordered: Claim[] = [];

    // It could be we should detect when dependencies are "unhealthy" like: 
    // customer_2 depends on cart_2
    // cart_1 depends on customer_3 
    // there are other "bad possibilities" as well. 
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
                for (let d_branch in claim.depends) {
                    // And run the dependence up to specific version 
                    let bc_dep = branch_claims[d_branch];
                    let d_ver = versionOf(claim.depends[d_branch]);
                    if (bc_dep)
                        sortBranchUpTo(bc_dep, d_ver);
                    else {
                        if (!branches[d_branch] || branches[d_branch] < d_ver) {
                            console.error(`runBranchTo - dependency not found: ${d_branch}`); err_cnt++;
                            err_cnt++;
                        }
                        else if (branches[d_branch] > d_ver) {
                            console.warn(`runBranchTo - dependent claim gap to: <${d_branch}:${d_ver}> (from: <${claim.id.branch}:${claim.id.version}>)`);
                        }
                    }
                }
                // Now put us in the linear ordering 
                deps_ordered.push(claim);
                // If we are a dependence, then make sure our dependee is actually sorted now 
                if (claim.___dependee) {
                    for (let dee_branch in claim.___dependee) {
                        // This will be a direct return, if we were called as a dependence 
                        let bc_dee = branch_claims[dee_branch];
                        if (bc_dee) {
                            sortBranchUpTo(bc_dee, claim.___dependee[dee_branch]);
                        }
                        else {
                            console.error(`runBranchTo - dependee not found: ${dee_branch}`);
                            err_cnt++;
                        }
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

export function getInitialState(tables?: Dict<TableProps>): State {
    return {
        modules: {},
        format: "internal",
        ___tables: tables || {}
    };
}

function getNestedDeps(branch: string, version: number, state: State) {
    if (!state.depends_acc)
        return { [branch]: version };
    let deps = [{ branch, version }];
    let r: Dict<number> = {};
    for (let ix = 0; ix < deps.length; ix++) {
        let id = deps[ix];
        r[id.branch] = id.version;
        let nest_deps = state.depends_acc[id.branch]?.[id.version];
        if (nest_deps) {
            for (let m in nest_deps)
                deps.push({ branch: m, version: nest_deps[m] });
        }
    }
    return r;
}

// Merge dependency ordered claims 
export function mergeClaims(claims: Claim[], merge_base: State | null, options: Dict<any>):
    State | string[] {
    let errors: string[] = [];
    if (!merge_base || !merge_base.___tables) merge_base = getInitialState();
    let merge = merge_base.___tables;
    for (let claim of claims) {
        // Keep track of the current version of each module
        if (claim.format != "internal") {
            errors.push(`Claim <${claim.id.branch}:${claim.id.version}> is not in internal format`);
            continue;
        }

        let depends_acc: Dict<number>;
        if (firstKey(claim.depends)) {
            merge_base.depends_acc ||= {};
            merge_base.depends_acc[claim.id.branch] ||= {};
            merge_base.depends_acc[claim.id.branch][claim.id.version] ||= {};
            depends_acc = merge_base.depends_acc[claim.id.branch][claim.id.version];
        }

        let claim_id_s = `${claim.id.branch}:${claim.id.version}`;
        // First check the dependencies - against the current state 
        // Since the claims are sorted, this should always be OK.
        for (let module in claim.depends || {}) {
            // Accumulate nested dependencies in the state 
            depends_acc[module] = versionOf(claim.depends[module]);

            let tables = claim.depends[module];
            let version = versionOf(tables);
            let e_cnt = errors.length;
            // ___version is not easily expressed in TS as we want. 
            if (version == undefined)
                errors.push(`mergeClaims - verify deps - ${claim_id_s} - Ref to <${module}> lacks ___version`);
            else {
                let version_state = merge_base.modules[module];
                if (!version_state)
                    errors.push(`mergeClaims - verify deps - ${claim_id_s} - Ref to <${module}> - which is not in state`);
                else if (version > version_state)
                    errors.push(`mergeClaims - verify deps - ${claim_id_s} - Ref to <${module}:${version}> - but is already at <${version_state}>`);
            }
            if (errors.length > e_cnt) continue;

            // Get LUT of modules we can refer to as deps 
            let nested_deps = getNestedDeps(module, version, merge_base);

            // Iterate the tables in this module we depend on
            for (let t in tables) {
                let table = tables[t];
                let m_tbl = merge[t];
                if (isDict(table)) {
                    if (!m_tbl || m_tbl == "*NOT") {
                        if (firstKey(table))
                            errors.push(`mergeClaims - verify deps - ${claim_id_s} - Ref to table <${t}> - does not exist in merge`);
                        continue;
                    }
                    for (let c in table) {
                        let col = table[c];
                        let m_col = m_tbl[c];
                        if (col != "*UNREF") {
                            if (m_col && !isString(m_col)) {
                                let col_owner = m_col?.___branch || m_tbl?.___branch;
                                // ! This test can be better in allowing references to nested owners 
                                if (nested_deps[col_owner]) {
                                    // Under the ___refs[branch] section, store all the requirements 
                                    // of this particular module. Then that can be used when deciding 
                                    // what the module itself can / cannot modify.
                                    // Make a copy of ref_col, as we manipulate and maybe discard
                                    let ref_col = m_col.___refs[module] || {};
                                    ref_col = { ...ref_col, ...col, ___version: claim.id.version };
                                    let e_cnt = errors.length;
                                    for (let p in col) {
                                        if (col[p] != "*UNREF") {
                                            if (!db_column_words[p])
                                                errors.push(`mergeClaims - verify deps - ${claim_id_s} - unknown prop: <${t}:${c}:${p}>`);
                                            else if (!propFits(m_col, col, p))
                                                errors.push(`mergeClaims - verify deps - ${claim_id_s} - not fulfilled: <${t}:${c}:${p}> - wanted: ${JSON.stringify(col)}, got: ${JSON.stringify(m_col)}`);
                                        }
                                        else delete ref_col[p];
                                    }
                                    if (errors.length == e_cnt && firstKey(col)) {
                                        if (firstKey(ref_col, "___version")) {
                                            m_col.___refs ||= {};
                                            m_col.___refs[claim.id.branch] = ref_col;
                                        }
                                        else {
                                            // Nothing left in ref, delete it 
                                            delete m_col.___refs[claim.id.branch];
                                        }
                                    }
                                }
                                else errors.push(`mergeClaims - verify deps - ${claim_id_s} - not fulfilled: <${t}:${c}> - column owner wrong: <${col_owner}>, wanted: <${module}>`);
                            }
                            else errors.push(`mergeClaims - verify deps - ${claim_id_s} - not fulfilled: <${t}:${c}> - want: ${JSON.stringify(col)}, got: <nothing>`);
                        }
                        else {
                            // *UNREF on the column 
                            if (!isString(m_col) && m_col.___refs) {
                                delete m_col.___refs[module];
                            }
                        }
                    }
                }
                else {
                    // *UNREF for whole table
                    if (m_tbl != "*NOT") {
                        for (let c in m_tbl) {
                            let m_col = m_tbl[c];
                            if (!isString(m_col) && m_col.___refs) {
                                delete m_col.___refs[module];
                            }
                        }
                    }
                }
            }
        }

        // And do the merge 
        merge_base.modules[claim.id.branch] = claim.id.version;
        let cl_tables = claim.___tables;
        for (let t in cl_tables) {
            let cols = cl_tables[t];
            let m_tbl = merge[t];
            let is_table_ref = false;
            if (isTableProps(m_tbl)) {
                if (m_tbl.___branch != claim.id.branch) {
                    is_table_ref = true;
                }
            }

            if (isDict(cols)) {
                if (!firstKey(cols)) continue;
                if (!isTableProps(m_tbl))
                    merge[t] = m_tbl = { ___branch: claim.id.branch };

                for (let c_name in cols) {
                    let col = cols[c_name];
                    let m_col = m_tbl[c_name];
                    if (isDict(col)) {
                        if (!m_col || isString(m_col)) {
                            // A new column - accept the various properties 
                            // Check that not an invalid ref 
                            if (col.ref_data_type || !col.data_type) {
                                errors.push(`${t}:${c_name} - Declaring a reference but column does not exist`);
                            }
                            // A known type ? 
                            else if (getTypeGroup(col.data_type)) {
                                // !! we could check for  a <*ref> flag (requiring an existing column) 
                                // See if we accept all suggested column keywords 
                                // ! There should be a stronger syntax check here ! 
                                // ! Or in normalizeClaim
                                let unknowns = notInLut(col, db_column_words);
                                if (!unknowns) {
                                    // ! foreign_key checks 
                                    let fk = col.foreign_key;
                                    if (fk && !isString(fk)) {
                                        let tgt: ColumnProps;
                                        let err: string;
                                        if (isDict(merge[fk.table]))
                                            tgt = (merge[fk.table] as Dict<ColumnProps>)[fk.column];
                                        if (!tgt)
                                            err = `${t}:${c_name} - Foreign key ref - target not found: ${fk.table}:${fk.column}`;
                                        else if (tgt.data_type != col.data_type)
                                            err = `${t}:${c_name} - Foreign key ref - type mismatch: ${col.data_type} != ${tgt.data_type}`;
                                        if (err) {
                                            errors.push(err);
                                            continue;
                                        }
                                    }
                                    // Accept column declaration in its fullness
                                    let col_props: ColumnProps = { ...col };
                                    if (is_table_ref) {
                                        // ! Should an explicit dependency be made, to module 
                                        // declaring the table ?
                                        col_props.___branch = claim.id.branch;
                                    }
                                    m_tbl[c_name] = col_props;
                                }
                                else errors.push(`${t}:${c_name} - Unknown column keywords: ${JSON.stringify(unknowns)}`);
                            }
                            else errors.push(`${t}:${c_name} - Unknown column type: ${col.data_type}`);
                        }
                        else {
                            // A ref to a previously declared column. Either a requirement 
                            // on a column in another branch/module, or a reference to one 
                            // 'of our own making'- i.e. we can modify it. 
                            if ((!m_col.___branch && !is_table_ref) ||
                                m_col.___branch == claim.id.branch) {
                                // Modifying what we declared ourselves 
                                if (!col.ref_data_type) {
                                    let es = mergeOwnColumnClaim(m_col, col, options);
                                    if (es) append(errors, es);
                                }
                                else errors.push(`${t}:${c_name} - Column is owned by the claim but ref is being declared`);
                            }
                            else {
                                // So this is a ref to an existing column, by another module
                                // We cannot do that here
                                let col_owner = m_col?.___branch || m_tbl?.___branch;
                                errors.push(`${t}:${c_name} - This column is owned by module: ${col_owner}`);
                            }
                        }
                    }
                    else {
                        if (col == "*NOT") {
                            if (isString(m_col)) {
                                // "*NOT" is not owned by any module 
                                if (m_col != "*NOT")
                                    errors.push(`${t}:${c_name} - *NOT - unexpected state: ${m_col}`);
                                continue;
                            }
                            // Check we can really drop the column 
                            // One can also mark an undeclared column as *NOT 
                            let col_owner = m_col?.___branch || m_tbl?.___branch;
                            let err_len = errors.length;
                            if (col_owner) {
                                if (col_owner != claim.id.branch)
                                    errors.push(`${t}:${c_name} - Cannot drop column in other module: ${col_owner}, ${claim.id.branch}}`);
                                else if (firstKey(m_col.___refs))
                                    errors.push(`${t}:${c_name} - Cannot drop column, it is referenced: ${JSON.stringify(m_col.___refs)}`);
                            }
                            if (errors.length == err_len) {
                                m_tbl[c_name] = "*NOT";
                            }
                        }
                        else if (col == "*UNREF") {
                            let did_unref = false;
                            if (isDict(m_col)) {
                                if (m_col.___refs?.[claim.id.branch]) {
                                    did_unref = true;
                                    delete m_col.___refs[claim.id.branch];
                                }
                            }
                            if (!did_unref)
                                errors.push(`${t}:${c_name} - *UNREF - column is not referenced`);
                        }
                        else {
                            errors.push(`${t}:${c_name} - Unknown directive: ${col}`);
                        }
                    }
                }
            }
            else {
                if (cols == "*NOT") {
                    if (m_tbl == "*NOT") continue;
                    if (!is_table_ref) {
                        // A directive to drop the table 
                        // Do we have refs to its columns ? 
                        let has_refs = false;
                        for (let col in m_tbl || {}) {
                            let c = m_tbl[col];
                            if (isDict(c) && firstKey(c.___refs as any)) {
                                has_refs = true;
                                break;
                            }
                        }
                        if (!has_refs) {
                            // The table doesn't have to exist to go into *NOT state
                            merge[t] = "*NOT";
                        }
                        else errors.push(`merge: Cannot drop table with references: ${t}`);
                    }
                    else errors.push(`merge: only owner module can do *NOT (table ${t} in branch ${claim.id.branch})`);
                }
                else errors.push(`merge: unknown value (${cols}) for table ${t} in branch ${claim.id.branch}`);
            }
        }

    }
    return errors.length ? errors : merge_base;
}

// Merge revised claim into column declared earlier, by the same module.
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
                let reason: string;
                // If it is a referred property we cannot change it 
                if (m_col.___refs && db_ref_lockable[k]) {
                    let path: string[] = [];
                    let ref_val = findValueOf(k, m_col.___refs, path);
                    if (ref_val !== undefined) {
                        reason = `The value of ${k} is locked by a reference from: ${dArrAt(path, -1)} with value: ${ref_val}`;
                        errors.push(reason);
                        continue;
                    }
                }
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
                    case "is_unique":
                        if (claim[k]) reason = `Cannot safely add constraint ${k} now`;
                        break;
                    case "is_nullable":
                        // We allow to go back to nullable - DB is fine w that 
                        if (!claim[k]) reason = "Cannot add constraint NOT NULLABLE now";
                        break;
                    default:
                        break;
                }
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

