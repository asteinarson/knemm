
import { Dict, BaseTypes, isDict } from './utils';

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

//export type TableProps2 = Dict<ColumnProps | "*NOT" | "*UNREF"> | "*NOT";
export function isTableProps(o:any): o is TableProps {
    return isDict(o);
}

export type TableProps = {
    ___owner?: string,
    [k: string]: ColumnProps | string
};

export type Tables = Dict<TableProps|"*NOT">;

// export type ClaimState_O = {
//     id?: ClaimId,
//     source?: ClaimStateSource,
//     file?: string,
//     directory?: string,
//     connection?: any,    // Actually Knex
//     format: FormatTypeWUnk,
//     depends?: Dict<number>,
//     modules?: Dict<number>,
//     ___tables: Tables,
//     ___dependee?: Dict<number>
// };

export interface ClaimState {
    source?: ClaimStateSource,
    file?: string,
    format: FormatTypeWUnk,
    ___tables: Tables,
};

export interface Claim extends ClaimState {
    id: ClaimId,
    depends?: Dict<number>,
    ___dependee?: Dict<number>
};

export interface State extends ClaimState {
    modules: Dict<number>,
    directory?: string,
    connection?: any,    // Actually Knex
};

export function isClaimState(o: any): o is ClaimState {
    return !!(isDict(o) && o.___tables);
}
export function isClaim(o: any): o is Claim {
    return !!(isDict(o) && o.___tables && o.id);
}
export function isState(o: any): o is State {
    return !!(isDict(o) && o.___tables && o.modules);
} 


export type BTDict1 = Dict<BaseTypes> | BaseTypes;
export type BTDict2 = Dict<BTDict1> | BaseTypes;
export type BTDict3 = Dict<BTDict2> | BaseTypes;

export type ForeignKey = {
    table: string,
    column: string,
    constraint_name?: string,
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
    foreign_key?: ForeignKey | "*NOT",
    max_length?: number,
    numeric_precision?: number,
    numeric_scale?: number,
    [k: string]: BTDict3,
};

