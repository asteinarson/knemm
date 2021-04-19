import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { readFileSync } from 'fs';

let f = process.argv[2];
let s = readFileSync(f);
if (s) {
    let obj = yamlLoad(s.toString());
    if (obj) {
        console.log(yamlDump(obj));
    }
    else console.log("Failed yamlLoad: ");
}
else console.log("File not found: " + f);


