import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isDict } from '../utils';

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

import { claim_p1 } from '../__test_cli__/claims';

test("cmd join test - 1", async () => {
    claimsToFile([claim_p1]);
    let r = await handleOneArgCmd("join", [fileOf(claim_p1)], { internal: true });
    let y_s = logGet();
    let o = yamlLoad(y_s);

    expect(r).toBe(0);
    expect(typeof o).toBe("object");

    if( isDict(o) ){
        let d1 = matchDiff(claim_p1.___tables, o);
        expect( firstKey(d1) ).toBeFalsy();
        let d2 = matchDiff(o,claim_p1.___tables);
        expect( firstKey(d2) ).toBeFalsy();
    } 
    else expect("o_is_dict").toBe(false);
});
