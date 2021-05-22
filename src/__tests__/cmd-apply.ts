import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isArray, isDict } from '../utils';

import { join as pJoin } from 'path';
import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { connectState, createDb, dropDb, existsDb, getStateDir, matchDiff, normalizeConnInfo, reformatTopLevel, slurpXti, toState } from '../logic';
import { connect, disconnectAll, getClientType, slurpSchema } from '../db-utils';
import { jestLogCaptureStart, jestLogGet, claimsToFile, fileOf, jestWarnCaptureStart, jestWarnGet } from './test-utils';

import { claim_p1, claim_apply_simple_types as claim_ast, claim_author_1, claim_author_2, claim_author_3, claim_customer_1, claim_customer_2, claim_book_1, claim_book_2 } from './claims';
import { tmpdir } from 'os';
import { existsSync, rmSync } from 'fs';

import * as dotenv from 'dotenv'
import * as rimraf from 'rimraf';
dotenv.config();

afterAll(disconnectAll);


async function getCleanStateDir(name: string) {
    // Make sure we have an empty test dir - for our state
    let state_dir = pJoin(tmpdir(), name);
    let options = {
        internal: true,
        state: state_dir,
    };
    let rm = await rimraf.sync(state_dir);
    let sd = getStateDir(options);
    return options;
}

async function getConnectedDb(db_name: string) {
    let db_conn = normalizeConnInfo(":");
    db_conn.connection.database = db_name;
    // Drop test DB if exists
    let r: any = await existsDb(db_conn);
    if (r == true) {
        r = await dropDb(db_conn, db_name);
        expect(isDict(r)).toBe(true);
    }

    let db = await createDb(db_conn);
    return db;
}


// Need a test to be in this file 
test("cmd apply test - 1 - Single claim, multiple data types", async () => {
    //if( "abc".length>2 ) return;

    claimsToFile([claim_ast]);

    let options = await getCleanStateDir("state_ast");
    let state_dir = options.state;
    let sd = getStateDir(options);
    expect(sd).toBe(state_dir);

    //options.showQueries = "debug";

    // The DB conn  
    let db = await getConnectedDb("state_ast");
    if (isDict(db)) {
        // Connect it 
        let r: any = await connectState(state_dir, db, options);
        if (r == true) {
            // And apply   
            r = await handleOneArgCmd("apply", [fileOf(claim_ast)], options);
            expect(r).toBe(0);
            if (!r) {
                let schema = await slurpSchema(await connect(db), slurpXti(state_dir, db));
                expect(isDict(schema)).toBeTruthy();
                if (schema) {
                    expect(schema.person).toBeTruthy();
                    // Must transform claim_ast to internal before testing 
                    reformatTopLevel(claim_ast);
                    for (let col in claim_ast.___tables.person) {
                        let v = (claim_ast.___tables.person as any)[col];
                        expect(schema.person[col]?.data_type).toBe(v.data_type);
                    }
                }
            }
        }
    }
    else {
        // Sort of console.log 
        expect("isDict(db)").toBe(0);
    }
});

test("cmd apply test - 2 - widen types, keep NOT NULL, DEFAULT", async () => {
    // Expand (widen) the type of some columns.
    // See that NOT NULL, DEFAULT are kept through that.  

    claimsToFile([claim_author_1, claim_author_2, claim_author_3]);

    let name = "state_author";
    let options = (await getCleanStateDir(name)) as Dict<any>;
    //options.showQueries = "debug";

    // The DB conn  
    let db = await getConnectedDb(name);
    if (isDict(db)) {
        let client = getClientType(db);

        // Connect it 
        let r: any = await connectState(options.state, db, options);
        if (r == true) {
            // And apply 1st step    
            r = await handleOneArgCmd("apply", [fileOf(claim_author_1)], options);
            expect(r).toBe(0);
            if (!r) {
                let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                expect(isDict(schema)).toBeTruthy();
                if (schema) {
                    expect(schema.author).toBeTruthy();
                    expect(schema.author.id?.data_type).toBe("int");
                    expect(schema.author.id?.is_primary_key).toBe(true);
                    expect(schema.author.name?.data_type).toBe("varchar");
                    expect(schema.author.name?.max_length).toBe(32);
                    expect(schema.author.name?.default).toBe("James");
                    expect(schema.author.age?.data_type).toBe("int");
                    expect(schema.author.age?.is_nullable).toBe(false);

                    // sqlite does not natively support ALTER TABLE beyond rename
                    if (client == "sqlite3") return;

                    // And apply 2nd step    
                    r = await handleOneArgCmd("apply", [fileOf(claim_author_2)], options);
                    expect(r).toBe(0);
                    if (!r) {
                        let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                        expect(isDict(schema)).toBeTruthy();
                        if (schema) {
                            //expect(schema.author.id?.data_type).toBe("bigint");
                            expect(schema.author.name?.data_type).toBe("text");
                            expect(schema.author.name?.max_length).toBeFalsy();
                            expect(schema.author.name?.default).toBe("James");
                            expect(schema.author.age?.data_type).toBe("bigint");
                            expect(schema.author.age?.is_nullable).toBe(false);

                            // And apply 3rd step    
                            r = await handleOneArgCmd("apply", [fileOf(claim_author_3)], options);
                            expect(r).toBe(0);
                            if (!r) {
                                let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                                expect(isDict(schema)).toBeTruthy();
                                if (schema) {
                                    expect(schema.author.name?.default).toBeFalsy();
                                    expect(schema.author.age?.is_nullable).toBe(undefined);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    else {
        // Sort of console.log 
        expect("isDict(db)").toBe(0);
    }

});

test("cmd apply test - 3 - drop NOT NULL, UNIQUE, PRIMARY KEY", async () => {
    // Start w NOT NULL and UNIQUE. Drop those, verify

    claimsToFile([claim_customer_1, claim_customer_2]);

    let name = "state_customer";
    let options = (await getCleanStateDir(name)) as Dict<any>;
    options.showQueries = "debug";

    // The DB conn  
    let db = await getConnectedDb(name);
    if (isDict(db)) {
        let client = getClientType(db);

        // Connect it 
        let r: any = await connectState(options.state, db, options);
        if (r == true) {
            // And apply 1st step    
            r = await handleOneArgCmd("apply", [fileOf(claim_customer_1)], options);
            expect(r).toBe(0);
            if (!r) {
                let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                expect(isDict(schema)).toBeTruthy();
                if (schema) {
                    expect(schema.customer).toBeTruthy();
                    expect(schema.customer.id?.is_primary_key).toBe(true);
                    // !!ISSUE!! Currentl Knex suppresses generation of DEFAULT values for TEXT fields
                    if( client!="mysql")
                        expect(schema.customer.name?.default).toBe("Dolly");
                    expect(schema.customer.email?.is_unique).toBe(true);
                    expect(schema.customer.age?.is_nullable).toBe(false);

                    // sqlite does not natively support ALTER TABLE beyond rename
                    if (client == "sqlite3") return;

                    // Apply the 2nd step 
                    r = await handleOneArgCmd("apply", [fileOf(claim_customer_2)], options);
                    expect(r).toBe(0);
                    if (!r) {
                        let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                        expect(isDict(schema)).toBeTruthy();
                        if (schema) {
                            // ! Knex cannot drop primary keys correctly as of now (PG)
                            //expect(schema.customer.id?.is_primary_key).toBeFalsy();
                            expect(schema.customer.name?.default).toBe(undefined);
                            expect(schema.customer.email?.is_unique).toBeFalsy();
                            expect(schema.customer.age?.is_nullable).toBe(undefined);
                        }
                    }
                }
            }
        }
    }
});

test("cmd apply test - 4 - foreign key", async () => {
    // Start w NOT NULL and UNIQUE. Drop those, verify.

    claimsToFile([claim_author_1, claim_author_2, claim_book_1, claim_book_2]);

    let name = "state_author_book";
    let options = (await getCleanStateDir(name)) as Dict<any>;
    //options.showQueries = "debug";

    // The DB conn  
    let db = await getConnectedDb(name);
    if (isDict(db)) {
        let client = getClientType(db);

        // Connect it 
        let r: any = await connectState(options.state, db, options);
        if (r == true) {
            // And apply 1st step    
            r = await handleOneArgCmd("apply", [fileOf(claim_author_2), fileOf(claim_book_1)], options);
            expect(r).toBe(0);
            if (!r) {
                let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                expect(isDict(schema)).toBeTruthy();
                if (schema) {
                    expect(schema.author).toBeTruthy();
                    expect(schema.book).toBeTruthy();
                    expect(schema.author.id?.data_type).toBe("int");
                    expect(schema.author.name?.data_type).toBe("text");
                    expect(schema.book.author_id?.data_type).toBe("int");
                    expect(schema.book.author_id?.foreign_key).toBeTruthy();
                    expect(schema.book.author_id?.foreign_key?.table).toBe("author");
                    expect(schema.book.author_id?.foreign_key?.column).toBe("id");

                    // And apply 2nd step    
                    if(!r) return;
                    r = await handleOneArgCmd("apply", [fileOf(claim_book_2)], options);
                    expect(r).toBe(0);
                    if (!r) {
                        let schema = await slurpSchema(await connect(db), slurpXti(options.state, db));
                        expect(isDict(schema)).toBeTruthy();
                        if (schema) {
                            expect(schema.book.author_id?.data_type).toBe("int");
                            expect(schema.book.author_id?.foreign_key).toBeFalsy();
                        }
                    }
                }

            }
        }
    }
});



