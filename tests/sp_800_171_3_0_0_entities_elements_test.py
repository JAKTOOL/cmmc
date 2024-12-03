import os
import unittest

from src.api.data.sp_800_171_3_0_0.entities.elements import Elements


class TestElementsEntities(unittest.TestCase):
    def test_has_response(self):
        directory = "src/api/data/sp_800_171_3_0_0/elements"
        for filename in os.listdir(directory):
            if filename.endswith(".json"):
                with open(os.path.join(directory, filename), "r") as f:
                    print(filename)
                    Elements.schema().loads(f.read())


if __name__ == "__main__":
    unittest.main()
