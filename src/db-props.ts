
import { Dict } from './utils.js';

const numerics: Dict<number> = {
    float: 1, real: 1, int: 1, integer: 1, bigint: 1, decimal: 1, numeric: 1
};

const strings: Dict<number> = { text: 1, varchar: 1 };

const datetimes: Dict<number> = { date: 1, time:1, datetime: 1, timestamp:1, timestamp_tz:1 };

export function isNumeric(type: string) {
    return numerics[type];
}

export function isString(type: string) {
    return strings[type];
}

export function getTypeGroup( type:string ): "numeric"|"text"|"json"|"datetime"|"boolean"|"uuid" { 
    if( numerics[type] ) return "numeric";
    if( strings[type] ) return "text";
    if( datetimes[type] ) return "datetime";
    if( type=="json" || type=="jsonb" ) return "json";
    if( type=="boolean" ) return "boolean";
    if( type=="uuid" ) return "uuid";
    return null;
}