import os
import re

from fastapi import FastAPI, HTTPException

from src.api.data.sp_800_171_3_0_0.entities.elements import Elements
from src.api.data.sp_800_171_3_0_0.entities.framework import Framework

# Create fast api to serve the data
app = FastAPI()

DATA_FOLDER = "./src/api/data/sp_800_171_3_0_0"


@app.get("/sp_800_171_3_0_0/framework")
async def read_framework() -> Framework:
    file_path = os.path.join(DATA_FOLDER, "framework.json")
    if os.path.exists(file_path):
        with open(file_path, "r") as file:
            data = Framework.schema().loads(file.read())
        return data

    raise HTTPException(status_code=404, detail="Framework not found")


element_re = re.compile(r"^\d{2}\.\d{2}(\.\d{2})?$")


@app.get("/sp_800_171_3_0_0/elements/{element}")
async def read_element(element: str) -> Elements:
    if not element_re.match(element):
        raise HTTPException(status_code=400, detail="Invalid element identifier")
    file_path = os.path.join(DATA_FOLDER, "elements", f"{element}.json")
    if os.path.exists(file_path):
        with open(file_path, "r") as file:
            data = Elements.schema().loads(file.read())
        return data

    raise HTTPException(status_code=404, detail="Element not found")
