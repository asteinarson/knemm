import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isArray, isDict } from '../utils';

import { join as pJoin } from 'path';
import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { matchDiff, toState } from '../logic';

import { jestLogCaptureStart, jestLogGet, claimsToFile, fileOf, jestWarnCaptureStart, jestWarnGet } from './test-utils';

jestLogCaptureStart();

import { claim_p1, claim_p2, claim_p3, claim_p4, claim_p5, claim_p6, claim_p7, claim_use_p1, claim_use_p2, claim_use_p3, claim_use_p3_err, claim_use_p3_ok, claim_use_p5 } from './claims';
import { tmpdir } from 'os';
import { existsSync, rmSync } from 'fs';
import { Tables } from '../types';

test("cmd join test - 1", async () => {
    claimsToFile([claim_p1]);
    let r = await handleOneArgCmd("join", [fileOf(claim_p1)], { internal: true });
    let y_s = jestLogGet(); //logGet();
    let o = yamlLoad(y_s);

    expect(r).toBe(0);
    expect(typeof o).toBe("object");

    if (isDict(o)) {
        let d1 = matchDiff(claim_p1.___tables, o as any as Tables);
        expect(firstKey(d1)).toBeFalsy();
        let d2 = matchDiff(o as any as Tables, claim_p1.___tables);
        expect(firstKey(d2)).toBeFalsy();
    }
    else expect("o_is_dict").toBe(false);
});

test("cmd join test - 2", async () => {
    claimsToFile([claim_p1, claim_p2]);
    let r = await handleOneArgCmd("join", [fileOf(claim_p2), fileOf(claim_p1)], { internal: true });
    let y_s = jestLogGet(); //logGet();
    let o = yamlLoad(y_s);

    expect(r).toBe(0);
    expect(typeof o).toBe("object");

    if (isDict(o)) {
        expect((o as any)?.person?.name?.data_type).toBe("text");
        expect((o as any)?.person?.age?.data_type).toBe("int");
        expect((o as any)?.person?.age?.max_length).toBeFalsy();
    }
    else expect("o_is_dict").toBe(false);
});

test("cmd join test (branch 1) - 3", async () => {
    // The using (branch) claim should succeed here 
    claimsToFile([claim_p1, claim_p2, claim_use_p2]);
    let r = await handleOneArgCmd("join",
        [fileOf(claim_p2), fileOf(claim_use_p2), fileOf(claim_p1)],
        { internal: true });
    let y_s = jestLogGet(); //logGet();
    let o = yamlLoad(y_s);

    expect(r).toBe(0);
    expect(isDict(o)).toBe(true);

    if (isDict(o)) {
        expect((o as any)?.person?.name?.data_type).toBe("text");
        expect((o as any)?.person?.age?.data_type).toBe("int");
        expect((o as any)?.person?.age?.max_length).toBeFalsy();
    }
    else expect("o_is_dict").toBe(false);
});

test("cmd join test (branch 2) - 4", async () => {
    // This should fail - the datatype in p1 does not match
    claimsToFile([claim_p1, claim_p2, claim_use_p1]);
    let spy_warn = jestWarnCaptureStart();
    let r = await handleOneArgCmd("join",
        [fileOf(claim_p2), fileOf(claim_use_p2), fileOf(claim_p1)],
        { internal: true });
    let y_s = jestLogGet();
    spy_warn.mockClear(); jestWarnGet();
    let o = yamlLoad(y_s);

    expect(r).not.toBe(0);
    expect(isDict(o)).toBe(false);
});

describe("describe - generate state", () => {
    test("cmd join test - generate state 1", async () => {
        // Test generation of a state (just from claims) 
        let state_dir = pJoin(tmpdir(), "state1");
        let m_yaml = pJoin(state_dir, "___merge.yaml");
        if (existsSync(m_yaml)) rmSync(m_yaml);

        let r = await handleOneArgCmd(
            "join",
            [fileOf(claim_p2), fileOf(claim_p1)],
            { internal: true, state: state_dir });
        expect(r).toBe(0);
        let s = toState(state_dir);
        expect(isDict(s)).toBe(true);
        if (isDict(s)) {
            let person = (s as any)?.___tables?.person;
            expect(person?.name?.data_type).toBe("text");
            expect(person?.age?.data_type).toBe("int");
        }
    })
});

describe("describe - extend state", () => {
    test("cmd join test - extend state 1", async () => {
        // Test extending a state (existing state + new claims)
        let state_dir = pJoin(tmpdir(), "state1");
        let m_yaml = pJoin(state_dir, "___merge.yaml");
        expect(existsSync(m_yaml)).toBeTruthy();

        // This should succeed - use_p2 is a valid dep
        let r = await handleOneArgCmd(
            "join",
            [fileOf(claim_use_p2)],
            { internal: true, state: state_dir });
        expect(r).toBe(0);
        let s = toState(state_dir);
        expect(isDict(s)).toBe(true);
    });
});

claimsToFile([claim_p3, claim_use_p3, claim_use_p3_err, claim_p4]);
describe("describe - extend state 1.1", () => {
    test("cmd join - extend state 1.1", async () => {
        // We got the wrong one of this state otherwise
        claimsToFile([claim_use_p2]);

        let state_dir = pJoin(tmpdir(), "state1");
        let m_yaml = pJoin(state_dir, "___merge.yaml");
        expect(existsSync(m_yaml)).toBeTruthy();

        // This should succeed - both datatypes match
        let r = await handleOneArgCmd("join",
            [fileOf(claim_p3), fileOf(claim_use_p3)],
            { internal: true });
        expect(r).toBe(0);

        // This should fail - type is wrong and is_nullable too
        r = await handleOneArgCmd("join",
            [fileOf(claim_p3), fileOf(claim_use_p3_err)],
            { internal: true });
        expect(r).not.toBe(0);

        // This should fail - cannot change reffed is_nullable, and cannot drop reffed column 
        r = await handleOneArgCmd("join",
            [fileOf(claim_p4), fileOf(claim_use_p3)],
            { internal: true });
        expect(r).not.toBe(0);

        // This should succeed, we unref a column and a prop 
        claimsToFile([claim_use_p3_ok]);
        r = await handleOneArgCmd("join",
            [fileOf(claim_p3), fileOf(claim_use_p3_ok)],
            { internal: true });
        expect(r).toBe(0);

        // This should succeed, as we have unreffed 'age' column and 'is_nullable' (in p4)
        r = await handleOneArgCmd("join",
            [fileOf(claim_p4), fileOf(claim_use_p3_ok)],
            { internal: true });
        expect(r).toBe(0);

    });
});


claimsToFile([claim_p5, claim_use_p5, claim_p6, claim_p7]);
describe("describe - extend state 1.3", () => {
    test("cmd join - extend state 1.3", async () => {
        let state_dir = pJoin(tmpdir(), "state1");
        let m_yaml = pJoin(state_dir, "___merge.yaml");
        expect(existsSync(m_yaml)).toBeTruthy();

        // This should succeed - can expand data_type, even if reffed 
        let r = await handleOneArgCmd("join",
            [fileOf(claim_p6), fileOf(claim_use_p5)],
            { internal: true });
        expect(r).toBe(0);

        // This should fail - Cannot drop column when reffed 
        r = await handleOneArgCmd("join",
            [fileOf(claim_p7), fileOf(claim_use_p5)],
            { internal: true });
        expect(r).not.toBe(0);
    });
});

