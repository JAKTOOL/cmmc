// To parse this data:
//
//   import { Convert, Framework } from "./file";
//
//   const framework = Convert.toFramework(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface Framework {
    response: Response;
}

export interface Response {
    requestType: number;
    elements:    Elements;
}

export interface Elements {
    documents:          Document[];
    relationship_types: RelationshipType[];
    elements:           Element[];
    relationships:      Relationship[];
}

export interface Document {
    doc_identifier: DocIdentifier;
    name:           string;
    version:        string;
    website:        string;
}

export enum DocIdentifier {
    SP800_171_3_0_0 = "SP_800_171_3_0_0",
}

export interface Element {
    element_type:       ElementType;
    element_identifier: string;
    title:              string;
    text:               string;
    doc_identifier:     DocIdentifier;
}

export enum ElementType {
    Determination = "determination",
    Discussion = "discussion",
    Examine = "examine",
    Family = "family",
    Interview = "interview",
    Odp = "odp",
    OdpStatement = "odp_statement",
    OdpType = "odp_type",
    Reference = "reference",
    Requirement = "requirement",
    SecurityRequirement = "security_requirement",
    Test = "test",
    WithdrawReason = "withdraw_reason",
}

export interface RelationshipType {
    relationship_identifier: RelationshipIdentifier;
    description:             string;
}

export enum RelationshipIdentifier {
    AddressedBy = "addressed_by",
    ExternalReference = "external_reference",
    IncorporatedInto = "incorporated_into",
    Projection = "projection",
}

export interface Relationship {
    source_element_identifier: string;
    source_doc_identifier:     DocIdentifier;
    dest_element_identifier:   string;
    dest_doc_identifier:       DocIdentifier;
    relationship_identifier:   RelationshipIdentifier;
    provenance_doc_identifier: DocIdentifier;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toFramework(json: string): Framework {
        return cast(JSON.parse(json), r("Framework"));
    }

    public static frameworkToJson(value: Framework): string {
        return JSON.stringify(uncast(value, r("Framework")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "Framework": o([
        { json: "response", js: "response", typ: r("Response") },
    ], false),
    "Response": o([
        { json: "requestType", js: "requestType", typ: 0 },
        { json: "elements", js: "elements", typ: r("Elements") },
    ], false),
    "Elements": o([
        { json: "documents", js: "documents", typ: a(r("Document")) },
        { json: "relationship_types", js: "relationship_types", typ: a(r("RelationshipType")) },
        { json: "elements", js: "elements", typ: a(r("Element")) },
        { json: "relationships", js: "relationships", typ: a(r("Relationship")) },
    ], false),
    "Document": o([
        { json: "doc_identifier", js: "doc_identifier", typ: r("DocIdentifier") },
        { json: "name", js: "name", typ: "" },
        { json: "version", js: "version", typ: "" },
        { json: "website", js: "website", typ: "" },
    ], false),
    "Element": o([
        { json: "element_type", js: "element_type", typ: r("ElementType") },
        { json: "element_identifier", js: "element_identifier", typ: "" },
        { json: "title", js: "title", typ: "" },
        { json: "text", js: "text", typ: "" },
        { json: "doc_identifier", js: "doc_identifier", typ: r("DocIdentifier") },
    ], false),
    "RelationshipType": o([
        { json: "relationship_identifier", js: "relationship_identifier", typ: r("RelationshipIdentifier") },
        { json: "description", js: "description", typ: "" },
    ], false),
    "Relationship": o([
        { json: "source_element_identifier", js: "source_element_identifier", typ: "" },
        { json: "source_doc_identifier", js: "source_doc_identifier", typ: r("DocIdentifier") },
        { json: "dest_element_identifier", js: "dest_element_identifier", typ: "" },
        { json: "dest_doc_identifier", js: "dest_doc_identifier", typ: r("DocIdentifier") },
        { json: "relationship_identifier", js: "relationship_identifier", typ: r("RelationshipIdentifier") },
        { json: "provenance_doc_identifier", js: "provenance_doc_identifier", typ: r("DocIdentifier") },
    ], false),
    "DocIdentifier": [
        "SP_800_171_3_0_0",
    ],
    "ElementType": [
        "determination",
        "discussion",
        "examine",
        "family",
        "interview",
        "odp",
        "odp_statement",
        "odp_type",
        "reference",
        "requirement",
        "security_requirement",
        "test",
        "withdraw_reason",
    ],
    "RelationshipIdentifier": [
        "addressed_by",
        "external_reference",
        "incorporated_into",
        "projection",
    ],
};
