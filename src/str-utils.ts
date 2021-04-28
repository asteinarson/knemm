import { Dict } from './utils';


function multiReplaceInternal(s: string, dict: Dict<string>, keys: string[], pos: number): string {
    let w = keys[pos];
    let parts = s.split(w);
    if (++pos < keys.length) {
        for (let ix in parts) {
            parts[ix] = multiReplaceInternal(parts[ix], dict, keys, pos);
        }
    }
    return parts.join(dict[w]);
}


// Do a one sweep multiple string replacement where substitutions of 
// previous ones are not input to later ones. 
export function multiReplace(s: string, dict: Dict<string>) {
    return multiReplaceInternal(s, dict, Object.keys(dict), 0);
}

