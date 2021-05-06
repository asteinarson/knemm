import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isArray, isDict } from '../utils';

import { join as pJoin } from 'path';
import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { matchDiff, toState } from '../logic';

import { jestLogCaptureStart, jestLogGet, claimsToFile, fileOf, jestWarnCaptureStart, jestWarnGet } from './test-utils';

jestLogCaptureStart();

import { claim_p1, claim_p2, claim_use_p1, claim_use_p2 } from './claims';
import { tmpdir } from 'os';
import { existsSync, rmSync } from 'fs';

// Need a test to be in this file 
test("cmd apply test - 1 ", () => {
    expect(1).toBe(1);
});
