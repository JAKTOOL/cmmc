import unittest

from src.api.data.sp_800_171_3_0_0.entities.framework import Framework


class TestFrameworkEntities(unittest.TestCase):
    def setUp(self):
        with open("src/api/data/sp_800_171_3_0_0/framework.json", "r") as f:
            self.framework = Framework.schema().loads(f.read())

    def test_has_response(self):
        self.assertIsNotNone(self.framework.response)


if __name__ == "__main__":
    unittest.main()
