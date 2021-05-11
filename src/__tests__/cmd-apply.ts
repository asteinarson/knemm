import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isArray, isDict } from '../utils';

import { join as pJoin } from 'path';
import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { connectState, createDb, dropDb, existsDb, getStateDir, matchDiff, normalizeConnInfo, slurpXti, toState } from '../logic';
import { connect, disconnectAll, slurpSchema } from '../db-utils';
import { jestLogCaptureStart, jestLogGet, claimsToFile, fileOf, jestWarnCaptureStart, jestWarnGet } from './test-utils';

import { claim_p1, claim_apply_simple_types as claim_ast } from './claims';
import { tmpdir } from 'os';
import { existsSync, rmSync } from 'fs';

import * as dotenv from 'dotenv'
import * as rimraf from 'rimraf';
dotenv.config();

afterAll( disconnectAll );

claimsToFile([claim_ast]);

// Need a test to be in this file 
test("cmd apply test - 1 ", async () => {
    // Make sure we have an empty test dir - for our state
    let state_dir = pJoin(tmpdir(), "state_ast");
    let options = {
        internal: true,
        state: state_dir,
    };
    let rm = await rimraf.sync(state_dir);
    let sd = getStateDir(options);
    expect(sd).toBe(state_dir);

    // The DB conn  
    let db_conn = normalizeConnInfo(":");
    db_conn.connection.database = "claim_ast";
    // Drop test DB if exists
    let r:any = await existsDb(db_conn);
    if( r==true ){
        r = await dropDb(db_conn,"claim_ast");
        expect(isDict(r)).toBe(true);
    }

    let db = await createDb(db_conn);
    if( isDict(db) ){
        // Connect it 
        let r:any = await connectState(state_dir,db_conn,options);
        if( r== true ){
            // And apply 
            r = await handleOneArgCmd("apply", [fileOf(claim_ast)], options);
            expect(r).toBe(0);
            if( !r ){
                let schema = await slurpSchema(await connect(db_conn), slurpXti(state_dir,db_conn) );
                expect(isDict(schema)).toBeTruthy();
                if( schema ){
                    expect(schema.person).toBeTruthy();
                    for( let col in claim_ast.___tables.person ){
                        let v = (claim_ast.___tables.person as any)[col];
                        expect(schema.person[col]?.data_type).toBe(v);
                    }
                }
            }
        }
    }
    else{ 
        // Sort of console.log 
        expect("isDict(db)").toBe(0);
    }
});

test("cmd apply test - 2 ", async () => {
});

