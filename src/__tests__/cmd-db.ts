
import { createDb, dropDb, existsDb } from '../logic';
import { isDict, isString } from '../utils';

import * as dotenv from 'dotenv'
import { disconnectAll } from '../db-utils';
dotenv.config();

afterAll( () => {
    disconnectAll();
});

// Need a test to be in this file 
test("DB: create, drop test", async () => {
    let r:any;
    
    // Drop if exists 
    r = await existsDb("%","jest_test");
    if( r==true ){
        r = await dropDb("%","jest_test");
        expect(isDict(r)).toBeTruthy();
    }

    // Create it 
    r = await createDb("%","jest_test");
    expect(isDict(r)).toBeTruthy();

    // Existing ? 
    r = await existsDb("%","jest_test")
    expect(r).toBe(true);

    // And drop it 
    r = await dropDb("%","jest_test");
    expect(isDict(r)).toBeTruthy();

    // Not existing ? 
    r = await existsDb("%","jest_test")
    expect(r).toBeFalsy();
}); 
