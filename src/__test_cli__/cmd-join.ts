import { handleNoArgCmd, handleOneArgCmd, handleTwoArgCmd, handleDbCmd } from '../cmd-handlers';
import { Dict, firstKey, isDict } from '../utils';

import { dump as yamlDump } from 'js-yaml';
import { load as yamlLoad } from 'js-yaml';

import { matchDiff } from '../logic';

import {claimsToFile,captureStart,captureStop,fileOf} from './test-utils';

let claim_s1 = {
    format: "internal",
    id: {
        branch: "cmd-join",
        version: 1
    },
    ___tables: {
        person: {
            id: {
                data_type: "int",
                is_primary_key: true,
                has_auto_increment: true
            },
            name: {
                data_type: "varchar",
                max_length: 32,
            },
        },
    }
};

// Make sure claims are in file formats 
claimsToFile([claim_s1]);

captureStart();
let r = await handleOneArgCmd("join",[fileOf(claim_s1)],{internal:true});
let y_s = captureStop();
console.log( "test return code: " + r );

try {
    let o = yamlLoad(y_s);
    if( isDict(o)){
        // The merge should be identical with the one claim 
        let es:string[] = [];
        let d1 = matchDiff(claim_s1.___tables,o);
        if( firstKey(d1) ) es.push("Expected empty diff1");
        let d2 = matchDiff(o,claim_s1.___tables);
        if( firstKey(d2) ) es.push("Expected empty diff2");

        if( !es.length ) console.log("success");
        else es.forEach( e => console.error(e) );
    }
}catch(e){
    console.error("Failed yamlLoad");
}


