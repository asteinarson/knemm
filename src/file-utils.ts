
import { existsSync, readFileSync, lstatSync } from 'fs';
import { load as yamlLoad } from 'js-yaml';
import { Dict } from './utils';

export function slurpFile(file: string, quiet?: boolean,
    validator?: (r: any) => boolean): string | number | any[] | Record<string, any> {
    if (existsSync(file)) {
        let s = readFileSync(file);
        let ejs = file.slice(-5);
        try {
            if (ejs == ".json" || ejs == ".JSON") {
                return JSON.parse(s.toString());
            }
            if (ejs == ".yaml" || ejs == ".YAML") {
                return yamlLoad(s.toString());
            }
            // No extension match, try the two formats 
            let r = JSON.parse(s.toString());
            if (r) return r;
            r = yamlLoad(s.toString());
            if (r) {
                if (!validator || validator(r))
                    return r;
            }
        } catch (e) {
            if (!quiet)
                console.log(`slurpFile ${file}, exception: ${e.toString()}`);
        }
    }
    return null;
}

const re_path = /^(.*)\/[^/]*/;
export function getDirsFromFileList(files: string[]): string[] {
    let dirs: Dict<1> = {};
    for (let f of files) {
        let md = f.match(re_path);
        if (md) dirs[md[1]] = 1;
    }
    return Object.keys(dirs);
    /*return Object.keys(files.reduce((dirs: Dict<1>, f) => {
        let md = f.match(re_path);
        if (md) dirs[md[1]] = 1;
        return dirs;
    }, {}));*/
}

//const re_fm = /^(.*\/)?([^/]*)$/;
const re_fn = /^(.*\/)*([^/]+)\/*$/;
export function fileNameOf(path: string) {
    let md = path.match(re_fn);
    return md?.[2];
}

export function pathOf(file_path: string) {
    let md = file_path.match(re_fn);
    return md?.[1];
}

export function isDir(path: string) {
    try {
        return lstatSync(path).isDirectory();
    }
    catch (e) {
        let x = 1;
    }
}

export function isFile(path: string) {
    try {
        return lstatSync(path).isFile();
    }
    catch (e) {
        let x = 1;
    }
}

let std_inputs: Record<number, string> = {};
export function getStoreStdin(fd?: number) {
    if (!fd) fd = 0;
    if (std_inputs[fd] == undefined)
        std_inputs[fd] = readFileSync(fd).toString();
    return std_inputs[fd];
}

