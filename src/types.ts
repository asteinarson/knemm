
import { Dict, BaseTypes } from './utils';

export type ClaimId = {
    branch: string,
    version: number,
};

export type FormatType = "internal" | "hr-compact";
export type FormatTypeWUnk = FormatType | "?";
export type ClaimStateSource = "*file" | "*state" | "*db";

//export type PropDirective = "*NOT" | "*UNREF";
//export type TableDirectives = "*NOT";
//export type ColumnDirectives = "*NOT";

export type TopClaim = {
    id?: ClaimId,
    source: ClaimStateSource,
    file?: string,
    directory?: string,
    connection?: any,    // Actually Knex
    format: FormatTypeWUnk,
    modules?: Dict<number>,
    ___tables: Dict<TableProps>,
};

export type TableProps = Dict<ColumnProps | "*NOT" | "*UNREF"> | "*NOT";

export type BTDict1 = Dict<BaseTypes> | BaseTypes;
export type BTDict2 = Dict<BTDict1> | BaseTypes;
export type BTDict3 = Dict<BTDict2> | BaseTypes;

export type ForeignKey = {
    table: string,
    column: string,
    constraint?: string,
};
export type ColumnProps = {
    ___refs?: Dict<number>,
    ___owner?: string,
    data_type?: string,
    ref_type?: string,
    is_nullable?: boolean,
    is_unique?: boolean,
    is_primary_key?: boolean,
    has_auto_increment?: boolean,
    default?: BaseTypes,
    comment?: string,
    foreign_key?: ForeignKey,
    max_length?: number,
    numeric_precision?: number,
    numeric_scale?: number,
    [k: string]: BTDict3,
};

