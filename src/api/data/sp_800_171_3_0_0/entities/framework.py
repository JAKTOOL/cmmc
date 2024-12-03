from dataclasses import dataclass
from typing import List

from dataclasses_json import dataclass_json


@dataclass_json
@dataclass
class Document:
    doc_identifier: str
    name: str
    version: str
    website: str


@dataclass_json
@dataclass
class RelationshipType:
    relationship_identifier: str
    description: str


@dataclass_json
@dataclass
class Relationship:
    source_element_identifier: str
    source_doc_identifier: str
    dest_element_identifier: str
    dest_doc_identifier: str
    relationship_identifier: str
    provenance_doc_identifier: str


@dataclass_json
@dataclass
class Element:
    element_type: str
    element_identifier: str
    title: str
    text: str
    doc_identifier: str


@dataclass_json
@dataclass
class ElementsResponse:
    documents: List[Document]
    relationship_types: List[RelationshipType]
    elements: List[Element]
    relationships: List[Relationship]


@dataclass_json
@dataclass
class Response:
    requestType: int
    elements: ElementsResponse


@dataclass_json
@dataclass
class Framework:
    response: Response
