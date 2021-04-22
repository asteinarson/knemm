import { Dict, toLut, firstKey, tryGet, errorRv, notInLut, isDict, isArrayWithElems, isDictWithKeys } from './utils.js';
import pkg from 'lodash';
const { invert: ldInvert } = pkg;

import { db_column_words, db_types_with_args, db_type_args, getTypeGroup, typeContainsLoose } from './db-props.js';

import { fileNameOf, slurpFile } from "./file-utils.js";
import { connect, slurpSchema } from './db-utils.js'
import { existsSync, readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'fs';
import path from 'path';
import { dump as yamlDump } from 'js-yaml';

import { formatInternal, formatHrCompact } from "./hrc.js";

export function reformatTables(tables: Dict<any>, format: "internal" | "hr-compact"): Dict<any> {
    return format == "internal" ? formatInternal(tables) : formatHrCompact(tables);
}

export type TableInfoOrErrors = Dict<any> | string[];

export function getStateDir(options: any) {
    let state_dir: string;
    if (options.state) {
        if (options.state == true)
            state_dir = "./.dbstate";
        else {
            state_dir = options.state;
            if (state_dir.slice(-9) != "/.dbstate")
                state_dir += "/.dbstate";
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
        let md = f.match(re_name_ext);
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

// Rebuild the state directory from claims that are stored in the directory
export function rebuildState(state_dir: string, options: Dict<any>): boolean {
    if (!existsSync(state_dir))
        return errorRv(`rebuildState - Directory ${state_dir} not found`);
    // Build a list of modules with last versions 
    let file_dicts: Dict<Dict<any>> = {};
    for (const f of readdirSync(state_dir)) {
        if (f == "___merge.yaml") continue;
        if (f.match(re_yj)) {
            try {
                // Doing the await here (fileToNestedDict declared async without being so) 
                // causes nested funcyion to return to the parent function (!)
                //let r = await fileToNestedDict(path.join(state_dir, f), true);
                let r = fileToNestedDict(path.join(state_dir, f), true,"internal");
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

export function reformatTopLevel(claim:Dict<any>,format?:FormatType){
    if( claim.___tables ) {
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
        r.format = "?";
        if (!r.id)
            r.id = claimIdFromName(file);
        else if (typeof r.id == "string")
            r.id = claimIdFromName(r.id + ".yaml");
        reformatTopLevel(r,format);
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
                console.error("toNestedDict - Cannot resolve default state (@)");
                return;
            }
            state_dir = options.state || "./.dbstate";
        }
        else state_dir = file_or_db.slice(6);
        r = stateToNestedDict(state_dir);
        return r;
    }
    else if (file_or_db.slice(0, 3) == "db:") {
        // Look for a connection file - or use ENV vars 
        let conn_info: Dict<string>;
        if (file_or_db.slice(3) != "%") {
            let r = slurpFile(file_or_db);
            if (typeof r == "object") conn_info = r as Dict<string>;
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

        // Get our dict from DB conn ? 
        if (conn_info) {
            let client = conn_info.client ? conn_info.client : "pg";
            if (conn_info.connection) conn_info = conn_info.connection as any as Dict<string>;
            try {
                let connection = await connect(conn_info, client);
                let rs = await slurpSchema(connection);
                if (rs) {
                    // Keep the connection object here - it allows later knowing it is attached to a DB
                    r.source = "*db";
                    r.connection = connection;
                    r.format = "internal";
                    r.___tables = rs;
                }
            } catch( e ){
                return errorRv(`toNestedDict - failed connect/slurpSchema: ${e}`);
            }
        }
    }
    else r = fileToNestedDict(file_or_db,false,format);
    reformatTopLevel(r,format);
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

// Regular expression to extract claim (name,number) from a string/filename
let re_name_num_ext = /^([^/]+\/)*(.*)\.([\d]+)\.[a-zA-Z_-]+$/;
let re_name_ext = /^([^/]+\/)*(.*)\.([a-zA-Z_-]+)$/;

type ClaimId = { branch: string, version?: number };

function claimIdFromName(name: string): ClaimId {
    // Name plus version ? 
    let md = name.match(re_name_num_ext);
    if (md)
        return { branch: md[2], version: Number(md[3]) };
    // Then only a name
    md = name.match(re_name_ext);
    if (md)
        return { branch: md[2] };
}

function getClaimId(name: string, claim_id: Dict<any>): ClaimId {
    if (claim_id) {
        if (typeof claim_id == "object")
            return {
                // The ID is stored using <name> while the dep list can use <branch>
                branch: claim_id.name || claim_id.branch,
                version: Number(claim_id.version)
            };
        else {
            if (typeof claim_id != "string")
                return errorRv(`getClaimId: Unhandled claim ID type: ${name}:${typeof claim_id}`);
            // Assume it is a string like: invoice.14
            // Let the code below do the work 
            name = claim_id + ".yaml";
        }
    }
    return claimIdFromName(name);
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

const re_yj = /\.(json|yaml|JSON|YAML)$/;

// Sort input trees according to dependency specification 
export function dependencySort(file_dicts: Dict<Dict<any>>, state_base: Dict<any>, options: Dict<any>): Dict<any>[] {
    // Do initial registration based on branch name and version 
    let cl_by_br: Dict<Dict<any>[]> = {};
    let ver_by_br: Dict<number> = {};
    let branches: Dict<number> = state_base ? state_base.modules : {};
    let err_cnt = 0;
    let claims_by_name: Dict<1> = {};
    for (let f in file_dicts) {
        claims_by_name[fileNameOf(f)] = 1;
        let claim = file_dicts[f].id;
        let claim_id = getClaimId(f, claim);
        let name = claim_id.branch;
        if (name) {
            // Trying to insert claim from earlier part of history ? 
            if (branches[name] && claim_id.version <= branches[name]) {
                console.error(`dependencySort - Branch <${name}> is already at version ${branches[name]}. Was given version ${claim_id.version} to apply now. Rebuild?`);
                err_cnt++;
            }
            // Register this claim 
            let ver = claim_id.version || 0;
            if (!cl_by_br[name]) cl_by_br[name] = [];
            cl_by_br[name][ver] = file_dicts[f];
            // See if it is highest version of its branch 
            if (!ver_by_br[name] || ver > ver_by_br[name])
                ver_by_br[name] = ver;
            // Record highest versions of the dependencies we need 
            if (claim.depends) {
                let nest_deps: (ClaimId | string)[] = Array.isArray(claim.depends) ? claim.depends : [claim.depends];
                nest_deps.forEach((d, ix) => {
                    if (typeof d == "string") d = claimIdFromName(d + ".yaml");
                    nest_deps[ix] = d;
                    if (!ver_by_br[d.branch] || d.version > ver_by_br[d.branch])
                        ver_by_br[d.branch] = d.version;
                });
            }
            if (claim.weak_depends) {
                // Weak depends are only looked for (and run) if that module has been previously 
                // included/installed. 
            }
        } else {
            err_cnt++;
        }
    }
    if (err_cnt > 0) return;

    // Find additional dependencies, in given path (same branch names but lower versions)
    if (options.deps != false) {
        // Look for any dependencies in provided paths. 
        // To find the real claim ID:s we need to actually load them
        // (The filename ID is not decisive)
        let paths: string[] = options.paths || ["./"];
        for (let p of paths) {
            let files = readdirSync(p);
            for (let f of files) {
                if (f.match(re_yj)) {
                    try {
                        // Do not read file by same name twice 
                        if (claims_by_name[fileNameOf(f)]) continue;
                        // It is wasteful to try parsing each file here. We could have
                        // a flag that makes us trust the filenames for claim ID. 
                        let r = fileToNestedDict(path.join(p, f), true);
                        if (r?.id) {
                            // We are only interested in our list of claims and their deps
                            if (ver_by_br[r.id.branch] &&
                                typeof r.id.version == "number" && r.id.version <= ver_by_br[r.id.branch] &&
                                !cl_by_br[r.id.branch][r.id.version]) {
                                reformatTopLevel(r,"internal");
                                cl_by_br[r.id.branch][r.id.version] = r;
                            }
                        }
                    } catch (e) {
                        // Do nothing 
                        let _e = e;
                    }
                }
            }
        }
    }

    // And now do full linear ordering
    let deps_ordered: Dict<any>[] = [];
    for (let branch in cl_by_br) {
        let dep = cl_by_br[branch];
        if (!dep[dep.length - 1]["*ordered"]) {
            if (!orderDeps(cl_by_br, branch, deps_ordered, ver_by_br[branch]))
                return errorRv("dependencySort - orderDeps2 - failed");
        }
    }

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
        if( claim.format!="internal" ){
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
                            for (let p of col) {
                                if (p == "data_type") {
                                    // Accept same or more narrow datatype 
                                    if (!typeContainsLoose(m_col[p], col[p]))
                                        errors.push(`${t}:${c_name} - reference type ${col[p]} does not fit in declared type ${m_col[p]}`);
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
