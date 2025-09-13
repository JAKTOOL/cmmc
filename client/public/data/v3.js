import { readFileSync, writeFileSync } from "fs";
const v2 = JSON.parse(
  readFileSync("./client/public/data/v2-to-v3-mapping2.json")
);
const v3 = JSON.parse(readFileSync("./client/public/data/v3-values.json"));

writeFileSync(
  "./client/public/data/v2-and-v3-values.json",
  JSON.stringify({
    ...v2,
    ...v3,
  })
);
