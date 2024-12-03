from dataclasses import dataclass
from typing import List, Optional

from dataclasses_json import dataclass_json


@dataclass_json
@dataclass
class ExternalRelationship:
    elementIdentifier: str
    relationIdentifier: str
    olirEntryElementId: Optional[int] = None
    shortName: Optional[str] = None
    elementTypeIdentifier: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None
    olirName: Optional[str] = None
    frameworkVersionIdentifier: Optional[str] = None
    child_title: Optional[str] = None
    child_text: Optional[str] = None


@dataclass_json
@dataclass
class Element:
    elementIdentifier: str
    elementTypeIdentifier: str
    title: str
    text: str
    elements: Optional[List["Element"]] = None
    externalRelationships: Optional[List[ExternalRelationship]] = None


@dataclass_json
@dataclass
class Response:
    requestType: int
    elements: List[Element]


@dataclass_json
@dataclass
class Elements:
    response: Response
