
import { Dict } from "./utils";
export type HrcFieldType = "select" | "int" | "string" | "boolean" | "dict" | "any";

export interface HrcField {
    name: string,
    type: HrcFieldType,
    mandatory?: boolean,
    default?: any,
    fit_style?: "exact" | "lte",    // How this field fits into a "candidate"
    resets?: string[],              // What fields it resets if changed
    top_select?: boolean,           // If a select, whether can expose value on top level
    select_vals?: string[],
    dict_fields?: HrcField[],        // What fields can be in a dict 
    min?: number,
    max?: number,
    min_max_incl?: boolean,     
};

export interface HrcFieldSet {
    name: string,
    fields: HrcField[],
};

export interface HrcArea {
    path: string[],         // Where in tree
    fields: HrcFieldSet[],  // Build and replace in array order 
    fields_exclude?: string[], // Fields to drop from above 
};

export interface HrcPlugin {
    name: string,
    field_sets: HrcFieldSet[],
    areas: HrcArea[],
};

export interface HrcMerge {
    plugins: Dict<HrcPlugin>,
    field_sets: Dict<HrcFieldSet>,
    areas: Dict<HrcArea>,
};

