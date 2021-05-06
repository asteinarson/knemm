import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isArray, isDict } from '../utils';

import { join as pJoin } from 'path';
import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { matchDiff, toState } from '../logic';

import { jestLogCaptureStart, jestLogGet, claimsToFile, fileOf, jestWarnCaptureStart, jestWarnGet } from './test-utils';

//jestLogCaptureStart();

import { claim_p1, claim_apply_simple_types as claim_ast } from './claims';
import { tmpdir } from 'os';
import { existsSync, rmSync } from 'fs';


claimsToFile([claim_ast]);

// Need a test to be in this file 
test("cmd apply test - 1 ", async () => {
    let state_dir = pJoin(tmpdir(), "state_ast");
    let options = {
        internal: true,
        state: state_dir,
    };
    let r = await handleOneArgCmd("join", [fileOf(claim_ast)], options);
    expect(1).toBe(1);
});
