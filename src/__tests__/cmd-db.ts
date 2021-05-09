
import { createDb, dropDb, existsDb, parseDbSpec } from '../logic';
import { findValueOf, isDict, isString } from '../utils';
import { connect, disconnect, disconnectAll, getClientType } from '../db-utils';

import * as dotenv from 'dotenv'
import { Knex } from 'knex';
import { jestSetLogToFile } from './test-utils';
dotenv.config();

afterAll(disconnectAll);

// Need a test to be in this file 
test("DB: create, drop test", async () => {
    jestSetLogToFile("./log.log","log");
    jestSetLogToFile("./warn.log","warn");
    jestSetLogToFile("./error.log","error");

    let r: any;
    //let ci = parseDbSpec(":");
    //console.log("DB: create, dbSpec:", JSON.stringify(ci) );

    // Drop if exists 
    r = await existsDb(":", "jest_test");
    if (r == true) {
        r = await dropDb(":", "jest_test");
        expect(isDict(r)).toBe(true);
    }

    // Create it 
    r = await createDb(":", "jest_test");
    expect(isDict(r)).toBe(true);

    // Existing ? 
    r = await existsDb(":", "jest_test")
    expect(r).toBe(true);

    // And drop it 
    r = await dropDb(":", "jest_test");
    expect(isDict(r)).toBe(true);

    // Not existing ? 
    r = await existsDb(":", "jest_test")
    expect(r).toBeFalsy();
});

test("DB: multi connect", async () => {
    let conn_info = parseDbSpec(":");
    expect(isDict(conn_info)).toBe(true);

    // Sqlite does not support this 
    if( getClientType(conn_info)=="sqlite3" ) return; 

    // Make sure the DB:s exist
    let conns: Knex[] = [];
    for (let ix = 1; ix < 4; ix++) {
        let db = "___jt-" + ix;
        let r: any = await existsDb(conn_info, db);
        if (!r) {
            r = await createDb(conn_info, db);
            expect(isDict(r)).toBe(true);
        }
        else expect(r).toBe(true);

        // And connect 
        conn_info.connection.database = db;
        conns[ix] = await connect(conn_info);
    }

    // And use each connection 
    let qs: Knex.Raw[] = [];
    //let qs: Knex.QueryBuilder[] = [];
    for (let ix = 1; ix < 4; ix++) {
        let q = conns[ix].raw(`SELECT 1 + ${ix} AS the_sum`);
        //let q = conns[ix].select(`1 + ${ix}`).as("the_sum");
        qs.push(q);
    }
    let rr = await Promise.all(qs);

    // And close 
    jestSetLogToFile("./log.log","log");
    console.log("rr.length: ",rr.length);
    for (let ix = 0; ix<rr.length; ix++ ){
        console.log("rr[ix]: ", JSON.stringify(rr[ix],null,2) );
        //let _sum = rr[ix]?.rows?.[0]?.sum;
        let _sum = findValueOf("the_sum",rr[ix]);
        expect(_sum).toBe(2+ix);
        await disconnect(conns[ix+1]);
    }
});
