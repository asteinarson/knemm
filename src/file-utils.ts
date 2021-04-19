
import { existsSync, readFileSync } from 'fs';
import { load as yamlLoad } from 'js-yaml';

export function slurpFile(file: string, quiet?:boolean): string | number | any[] | Record<string,any> {
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
            if(r) return r;
            r = yamlLoad(s.toString());
            if(r) return r;
        } catch (e) {
            if( !quiet )
                console.log(`slurpFile ${file}, exception: ${e.toString()}`);
        }
    }
    return null;
}


