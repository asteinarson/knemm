
import { Dict } from './utils.js';

export type ModuleId = {
    branch: string,
    version: number,
    [key:string]: boolean
};

export type FormatType = "internal" | "hr-compact";
export type FormatTypeWUnk = FormatType | "?";
export type ClaimStateSource = "*file" | "*state" | "*db";

//export type TableDirectives = "*NOT";
//export type ColumnDirectives = "*NOT";

export type TopClaim = {
    id?: ModuleId,
    source: ClaimStateSource,
    file?: string,
    directory?: string,
    connection?: any,    // Actually Knex
    format: FormatTypeWUnk,
    modules?: Dict<number>,
    ___tables: Dict<TableProps | string>,
};

export type TableProps = Dict<ColumnProps | string>;

export type ColumnProps = {
    ___refs?:Dict<string>,
    ___owner?:string,
    data_type?: string,
    is_nullable?: boolean,
    is_unique?: boolean,
    is_primary_key?: boolean,
    has_auto_increment?: boolean,
    default_value?: string | number | boolean,
    comment?: string,
    foreign_key?: {
        table: string,
        column: string
    },
    max_length?: number,
    numeric_precision?: number,
    numeric_scale?: number
};

interface TestType {
    a: number;
    b: string;
    [key:string]: number|string;
 };

type TestType2 = {
    a: number;
    b: string;
    [key:string]: any;
 };

let tt2:TestType2 = {
    a:14,
    b:"car",
    ddd:111
}
