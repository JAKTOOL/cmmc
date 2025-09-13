import { readFileSync, writeFileSync } from "fs";
const mapping = JSON.parse(
  readFileSync("./client/public/data/v2-to-v3-withdrawn_into.json")
);

for (const row of Object.values(mapping)) {
  row.revision = 2;
  if (row?.withdrawn_into?.length) {
    for (const id of row.withdrawn_into) {
      if (!mapping[id]) {
        console.log(`${id} does not exist`);
        continue;
      }
      if (mapping[id]?.withdrawn_from) {
        mapping[id].withdrawn_from.push(row.id);
        mapping[id].aggregate_value_withdrawn_from += row.value;
        mapping[id].aggregate_partial_value_withdrawn_from += row.partial_value;
      } else {
        mapping[id].withdrawn_from = [row.id];
        mapping[id].aggregate_value_withdrawn_from = row.value;
        mapping[id].aggregate_partial_value_withdrawn_from = row.partial_value;
      }
    }
  }
}

writeFileSync(
  "./client/public/data/v2-to-v3-mapping2.json",
  JSON.stringify(mapping, null, 4)
);
