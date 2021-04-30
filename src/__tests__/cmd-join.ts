import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isArray, isDict } from '../utils';

import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { matchDiff } from '../logic';

import { claimsToFile, fileOf } from '../__test_cli__/test-utils';

let s_log = "";
function logGet() {
    let s = s_log;
    s_log = "";
    return s;
}
const jest_log = jest.spyOn(console, "log").mockImplementation((v) => { s_log += v.toString() + "\n" });

import { claim_p1, claim_p2, claim_use_p1, claim_use_p2 } from '../__test_cli__/claims';

test("cmd join test - 1", async () => {
    claimsToFile([claim_p1]);
    let r = await handleOneArgCmd("join", [fileOf(claim_p1)], { internal: true });
    let y_s = logGet();
    let o = yamlLoad(y_s);

    expect(r).toBe(0);
    expect(typeof o).toBe("object");

    if (isDict(o)) {
        let d1 = matchDiff(claim_p1.___tables, o);
        expect(firstKey(d1)).toBeFalsy();
        let d2 = matchDiff(o, claim_p1.___tables);
        expect(firstKey(d2)).toBeFalsy();
    }
    else expect("o_is_dict").toBe(false);
});

test("cmd join test - 2", async () => {
    claimsToFile([claim_p1, claim_p2]);
    let r = await handleOneArgCmd("join", [fileOf(claim_p2), fileOf(claim_p1)], { internal: true });
    let y_s = logGet();
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
    let y_s = logGet();
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
    let r = await handleOneArgCmd("join",
        [fileOf(claim_p2), fileOf(claim_use_p2), fileOf(claim_p1)],
        { internal: true });
    let y_s = logGet();
    let o = yamlLoad(y_s);

    expect(r).not.toBe(0);
    expect(isArray(o)).toBe(true);
});
