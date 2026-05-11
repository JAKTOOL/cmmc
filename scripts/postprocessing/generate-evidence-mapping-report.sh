#!/usr/bin/env bash
set -euo pipefail
#
# Usage:
#
#   ./generate-evidence-report.sh <map-file> [output-file]
#
# Example:
#
#   ./generate-evidence-report.sh ./cmmc-map.json ./cmmc-evidence-report.md
#
# Outputs a Markdown report organised by requirement ID.
# Each requirement becomes a ## heading with a table of its artifacts.
# File artifacts link to <req-path>/<name> (e.g. 03/01/01/file.png).
# URL artifacts link to their external URL. Hash column is omitted for URLs.
#
MAP_FILE="${1:-}"
OUT_FILE="${2:-cmmc-evidence-report.md}"

if [[ -z "$MAP_FILE" ]]; then
    cat <<EOF
Usage:
    $0 <map-file> [output-file]

Example:
    $0 ./cmmc-map.json ./cmmc-evidence-report.md
EOF
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required but was not found." >&2
    exit 1
fi

python3 - "$MAP_FILE" "$OUT_FILE" <<'PYEOF'
import json
import sys
from pathlib import Path

map_file = sys.argv[1]
out_file  = sys.argv[2]

with open(map_file) as f:
    data = json.load(f)

artifacts = data["artifacts"]
by_req    = data["byRequirements"]

# Natural / version sort for dotted requirement IDs (e.g. 03.01.01 < 03.01.02)
def version_key(s):
    return [part.zfill(10) for part in s.split(".")]

sorted_reqs = sorted(by_req.keys(), key=version_key)

lines = []
lines.append("# CMMC 800-171 Rev 2 Evidence Report")
lines.append("")

def artifact_sort_key(aid):
    a = artifacts.get(aid)
    if a is None:
        return (2, "")
    return (0 if a.get("type") == "url" else 1, a.get("name", "").lower())

for req in sorted_reqs:
    lines.append(f"## {req}")
    lines.append("")
    lines.append("| Artifact | Type | Hash |")
    lines.append("|---|---|---|")

    for art_id in sorted(by_req[req], key=artifact_sort_key):
        art = artifacts.get(art_id)

        if art is None:
            lines.append(f"| *(missing: {art_id})* | — | — |")
            continue

        name       = art["name"]
        filename     = art["filename"]
        atype      = art.get("type", "")
        hash_type  = art.get("hashType", "")

        if atype == "url":
            url    = art.get("url", "#")
            link   = f"[{name}]({url})"
            hash_val = "—"
        else:
            req_path = req.replace(".", "/")
            link     = f"[{name}](./{req_path}/{filename})"
            hash_val = f"`{hash_type}: {art_id}`" if hash_type else f"`{art_id}`"

        lines.append(f"| {link} | `{atype}` | {hash_val} |")

    lines.append("")  # blank line between sections

Path(out_file).write_text("\n".join(lines))
print(f"Report written to: {out_file}")
print(f"  {len(sorted_reqs)} requirements, {len(artifacts)} artifacts")
PYEOF
