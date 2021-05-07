
import { createDb, dropDb, existsDb, parseDbSpec } from '../logic';
import { isDict, isString } from '../utils';
import { connect, disconnect, disconnectAll } from '../db-utils';

import * as dotenv from 'dotenv'
import { Knex } from 'knex';
dotenv.config();

afterAll(disconnectAll);

// Need a test to be in this file 
test("DB: create, drop test", async () => {
    let r: any;

    // Drop if exists 
    r = await existsDb("%", "jest_test");
    if (r == true) {
        r = await dropDb("%", "jest_test");
        expect(isDict(r)).toBe(true);
    }

    // Create it 
    r = await createDb("%", "jest_test");
    expect(isDict(r)).toBe(true);

    // Existing ? 
    r = await existsDb("%", "jest_test")
    expect(r).toBe(true);

    // And drop it 
    r = await dropDb("%", "jest_test");
    expect(isDict(r)).toBe(true);

    // Not existing ? 
    r = await existsDb("%", "jest_test")
    expect(r).toBeFalsy();
});

test("DB: multi connect", async () => {
    let conn_info = parseDbSpec("%");
    expect(isDict(conn_info)).toBe(true);

    // Make sure the DB:s exist
    let conns: Promise<Knex>[] = [];
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
        conns.push(connect(conn_info));
    }
    let r = await Promise.all(conns);
    expect(r.length).toBe(3);

    // And use each connection 
    let qs: Knex.Raw[] = [];
    for (let ix = 1; ix < 4; ix++) {
        let q = r[ix].raw(`SELECT 1 + ${ix}`);
        qs.push(q);
    }
    let rr = await Promise.all(qs);

    // And close 
    for (let ix = 1; ix < 4; ix++) 
        await disconnect(r[ix]);

    expect(1).toBe(1);
});
