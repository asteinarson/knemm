
import { existsSync, readFileSync } from 'fs';
import { load } from 'js-yaml';

export function slurpFile(file: string): string | number | any[] | Record<string,any> {
    if (existsSync(file)) {
        let s = readFileSync(file);
        let ejs = file.slice(-5);
        try {
            if (ejs == ".json" || ejs == ".JSON") {
                return JSON.parse(s.toString());
            }
            if (ejs == ".yaml" || ejs == ".YAML") {
                return load(s.toString());
            }
            // No extension match, try the two formats 
            let r = JSON.parse(s.toString());
            if(r) return r;
            r = load(s.toString());
            if(r) return r;
        } catch (e) {
            console.log(`slurpFile ${file}, exception: ${e.toString()}`);
        }
    }
    return null;
}


