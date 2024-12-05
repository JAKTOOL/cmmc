// To parse this data:
//
//   import { Convert, Elements } from "./file";
//
//   const elements = Convert.toElements(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface Elements {
    response: Response;
}

export interface Response {
    requestType: number;
    elements:    ResponseElement[];
}

export interface ResponseElement {
    elementIdentifier:     string;
    elementTypeIdentifier: PurpleElementTypeIdentifier;
    title:                 string;
    text:                  string;
    elements:              PurpleElement[];
}

export enum PurpleElementTypeIdentifier {
    Family = "family",
}

export interface PurpleElement {
    elementIdentifier:      string;
    elementTypeIdentifier:  FluffyElementTypeIdentifier;
    title:                  string;
    text:                   string;
    elements:               FluffyElement[];
    externalRelationships?: ExternalRelationship[];
}

export enum FluffyElementTypeIdentifier {
    Determination = "determination",
    Requirement = "requirement",
    SecurityRequirement = "security_requirement",
}

export interface FluffyElement {
    elementIdentifier:     string;
    elementTypeIdentifier: TentacledElementTypeIdentifier;
    title:                 string;
    text:                  string;
    elements?:             TentacledElement[];
}

export enum TentacledElementTypeIdentifier {
    Discussion = "discussion",
    Examine = "examine",
    Interview = "interview",
    Reference = "reference",
    SecurityRequirement = "security_requirement",
    Test = "test",
    WithdrawReason = "withdraw_reason",
}

export interface TentacledElement {
    elementIdentifier:     string;
    elementTypeIdentifier: FluffyElementTypeIdentifier;
    title:                 string;
    text:                  string;
    elements?:             StickyElement[];
    relationIdentifier?:   ElementRelationIdentifier;
}

export interface StickyElement {
    elementIdentifier:     string;
    elementTypeIdentifier: StickyElementTypeIdentifier;
    title:                 string;
    text:                  string;
    elements?:             StickyElement[];
}

export enum StickyElementTypeIdentifier {
    Determination = "determination",
    Odp = "odp",
    OdpStatement = "odp_statement",
    OdpType = "odp_type",
    SecurityRequirement = "security_requirement",
}

export enum ElementRelationIdentifier {
    AddressedBy = "addressed_by",
    IncorporatedInto = "incorporated_into",
}

export interface ExternalRelationship {
    elementIdentifier:           string;
    relationIdentifier:          ExternalRelationshipRelationIdentifier;
    olirEntryElementId?:         number;
    shortName:                   ShortName;
    elementTypeIdentifier:       ExternalRelationshipElementTypeIdentifier;
    title?:                      Title;
    text?:                       Text;
    olirName?:                   OlirName;
    child_title?:                string;
    child_text?:                 string;
    frameworkVersionIdentifier?: FrameworkVersionIdentifier;
}

export enum ExternalRelationshipElementTypeIdentifier {
    Control = "control",
    ControlEnhancement = "control_enhancement",
    X = "x",
}

export enum FrameworkVersionIdentifier {
    SP800_53_5_1_1 = "SP_800_53_5_1_1",
}

export enum OlirName {
    A = "a",
}

export enum ExternalRelationshipRelationIdentifier {
    ExternalReference = "external_reference",
    OlirFocal = "olir_focal",
}

export enum ShortName {
    SP800171Rev2 = "SP 800-171 Rev 2",
    SP80053Rev511 = "SP 800-53 Rev 5.1.1",
}

export enum Text {
    Z = "z",
}

export enum Title {
    Y = "y",
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toElements(json: string): Elements {
        return cast(JSON.parse(json), r("Elements"));
    }

    public static elementsToJson(value: Elements): string {
        return JSON.stringify(uncast(value, r("Elements")), null, 2);
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
    "Elements": o([
        { json: "response", js: "response", typ: r("Response") },
    ], false),
    "Response": o([
        { json: "requestType", js: "requestType", typ: 0 },
        { json: "elements", js: "elements", typ: a(r("ResponseElement")) },
    ], false),
    "ResponseElement": o([
        { json: "elementIdentifier", js: "elementIdentifier", typ: "" },
        { json: "elementTypeIdentifier", js: "elementTypeIdentifier", typ: r("PurpleElementTypeIdentifier") },
        { json: "title", js: "title", typ: "" },
        { json: "text", js: "text", typ: "" },
        { json: "elements", js: "elements", typ: a(r("PurpleElement")) },
    ], false),
    "PurpleElement": o([
        { json: "elementIdentifier", js: "elementIdentifier", typ: "" },
        { json: "elementTypeIdentifier", js: "elementTypeIdentifier", typ: r("FluffyElementTypeIdentifier") },
        { json: "title", js: "title", typ: "" },
        { json: "text", js: "text", typ: "" },
        { json: "elements", js: "elements", typ: a(r("FluffyElement")) },
        { json: "externalRelationships", js: "externalRelationships", typ: u(undefined, a(r("ExternalRelationship"))) },
    ], false),
    "FluffyElement": o([
        { json: "elementIdentifier", js: "elementIdentifier", typ: "" },
        { json: "elementTypeIdentifier", js: "elementTypeIdentifier", typ: r("TentacledElementTypeIdentifier") },
        { json: "title", js: "title", typ: "" },
        { json: "text", js: "text", typ: "" },
        { json: "elements", js: "elements", typ: u(undefined, a(r("TentacledElement"))) },
    ], false),
    "TentacledElement": o([
        { json: "elementIdentifier", js: "elementIdentifier", typ: "" },
        { json: "elementTypeIdentifier", js: "elementTypeIdentifier", typ: r("FluffyElementTypeIdentifier") },
        { json: "title", js: "title", typ: "" },
        { json: "text", js: "text", typ: "" },
        { json: "elements", js: "elements", typ: u(undefined, a(r("StickyElement"))) },
        { json: "relationIdentifier", js: "relationIdentifier", typ: u(undefined, r("ElementRelationIdentifier")) },
    ], false),
    "StickyElement": o([
        { json: "elementIdentifier", js: "elementIdentifier", typ: "" },
        { json: "elementTypeIdentifier", js: "elementTypeIdentifier", typ: r("StickyElementTypeIdentifier") },
        { json: "title", js: "title", typ: "" },
        { json: "text", js: "text", typ: "" },
        { json: "elements", js: "elements", typ: u(undefined, a(r("StickyElement"))) },
    ], false),
    "ExternalRelationship": o([
        { json: "elementIdentifier", js: "elementIdentifier", typ: "" },
        { json: "relationIdentifier", js: "relationIdentifier", typ: r("ExternalRelationshipRelationIdentifier") },
        { json: "olirEntryElementId", js: "olirEntryElementId", typ: u(undefined, 0) },
        { json: "shortName", js: "shortName", typ: r("ShortName") },
        { json: "elementTypeIdentifier", js: "elementTypeIdentifier", typ: r("ExternalRelationshipElementTypeIdentifier") },
        { json: "title", js: "title", typ: u(undefined, r("Title")) },
        { json: "text", js: "text", typ: u(undefined, r("Text")) },
        { json: "olirName", js: "olirName", typ: u(undefined, r("OlirName")) },
        { json: "child_title", js: "child_title", typ: u(undefined, "") },
        { json: "child_text", js: "child_text", typ: u(undefined, "") },
        { json: "frameworkVersionIdentifier", js: "frameworkVersionIdentifier", typ: u(undefined, r("FrameworkVersionIdentifier")) },
    ], false),
    "PurpleElementTypeIdentifier": [
        "family",
    ],
    "FluffyElementTypeIdentifier": [
        "determination",
        "requirement",
        "security_requirement",
    ],
    "TentacledElementTypeIdentifier": [
        "discussion",
        "examine",
        "interview",
        "reference",
        "security_requirement",
        "test",
        "withdraw_reason",
    ],
    "StickyElementTypeIdentifier": [
        "determination",
        "odp",
        "odp_statement",
        "odp_type",
        "security_requirement",
    ],
    "ElementRelationIdentifier": [
        "addressed_by",
        "incorporated_into",
    ],
    "ExternalRelationshipElementTypeIdentifier": [
        "control",
        "control_enhancement",
        "x",
    ],
    "FrameworkVersionIdentifier": [
        "SP_800_53_5_1_1",
    ],
    "OlirName": [
        "a",
    ],
    "ExternalRelationshipRelationIdentifier": [
        "external_reference",
        "olir_focal",
    ],
    "ShortName": [
        "SP 800-171 Rev 2",
        "SP 800-53 Rev 5.1.1",
    ],
    "Text": [
        "z",
    ],
    "Title": [
        "y",
    ],
};
