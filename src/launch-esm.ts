#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';

// From - https://techsparx.com/nodejs/esnext/dirname-es-modules.html
const esm_dirname = path.dirname(new URL(import.meta.url).pathname);

export function launch(cmd: string, args?: string[]) {
    let node_args = ["--experimental-specifier-resolution=node",
        path.join(esm_dirname, cmd),
        ...(args ? args : process.argv.slice(2))];
    let r = spawn("node", args);

    r.stdout.on("data", data => { process.stdout.write(data.toString()); });
    r.stderr.on("data", data => { process.stderr.write(data.toString()); });
    r.on("close", code => { process.exit(code) });
    r.on("error", err => { console.log("Error: " + err) });
}

