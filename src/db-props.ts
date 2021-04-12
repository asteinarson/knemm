
import { Dict } from './utils.js';

const numerics: Dict<number> = {
    float: 1, real: 1, int: 1, integer: 1, decimal: 1, numeric: 1
};

const strings: Dict<number> = { text: 1, varchar: 1 };

export function isNumeric(type: string) {
    return numerics[type];
}

export function isString(type: string) {
    return strings[type];
}

