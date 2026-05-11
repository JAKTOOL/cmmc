#!/usr/bin/env bash

set -euo pipefail

#
# Usage:
#
# ./organize-evidence.sh \
#   ./map.json \
#   ./evidence \
#   ./organized-evidence
#

MAP_FILE="${1:-}"
SOURCE_DIR="${2:-}"
DEST_ROOT="${3:-}"

if [[ -z "$MAP_FILE" || -z "$SOURCE_DIR" || -z "$DEST_ROOT" ]]; then
    cat <<EOF
Usage:

./organize-evidence.sh <map-file> <source-dir> <dest-dir>

Example:

./organize-evidence.sh \
  ./cmmc-map.json \
  ./evidence \
  ./organized-evidence
EOF
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required"
    exit 1
fi

declare -A PROCESSED_COUNTS

#
# Sort requirement keys numerically
#
mapfile -t REQUIREMENTS < <(
    jq -r '.byRequirements | keys[]' "$MAP_FILE" | sort -V
)

for REQUIREMENT in "${REQUIREMENTS[@]}"; do
    echo
    echo "Processing $REQUIREMENT"

    #
    # Convert:
    # 03.01.01 -> 03/01/01
    #
    REQUIREMENT_PATH="${REQUIREMENT//./\/}"

    #
    # Get artifact IDs for requirement
    #
    mapfile -t ARTIFACT_IDS < <(
        jq -r --arg req "$REQUIREMENT" '
            .byRequirements[$req][]
        ' "$MAP_FILE"
    )

    for ARTIFACT_ID in "${ARTIFACT_IDS[@]}"; do

        #
        # Pull artifact info
        #
        ARTIFACT_JSON=$(
            jq -c --arg id "$ARTIFACT_ID" '
                .artifacts[$id]
            ' "$MAP_FILE"
        )

        if [[ "$ARTIFACT_JSON" == "null" ]]; then
            echo "  Missing artifact: $ARTIFACT_ID"
            continue
        fi

        NAME=$(jq -r '.filename' <<< "$ARTIFACT_JSON")
        TYPE=$(jq -r '.type' <<< "$ARTIFACT_JSON")
        TOTAL_REQUIREMENTS=$(jq -r '.requirements | length' <<< "$ARTIFACT_JSON")

        #
        # Skip URLs
        #
        if [[ "$TYPE" == "url" ]]; then
            echo "  [URL] Skipping $NAME"
            continue
        fi

        DEST_DIR="$DEST_ROOT/$REQUIREMENT_PATH"
        DEST_FILE="$DEST_DIR/$NAME"
        SOURCE_FILE="$SOURCE_DIR/$NAME"

        mkdir -p "$DEST_DIR"

        if [[ ! -f "$SOURCE_FILE" ]]; then
            echo "  Source missing: $SOURCE_FILE"
            continue
        fi

        #
        # Track processing count
        #
        CURRENT_COUNT=$(( ${PROCESSED_COUNTS["$ARTIFACT_ID"]:-0} + 1 ))
        PROCESSED_COUNTS["$ARTIFACT_ID"]=$CURRENT_COUNT

        #
        # Single requirement => move
        #
        if [[ "$TOTAL_REQUIREMENTS" -eq 1 ]]; then
            echo "  MOVE $NAME"
            echo "    -> $DEST_FILE"

            mv "$SOURCE_FILE" "$DEST_FILE"
            continue
        fi

        #
        # Multi-requirement handling
        #
        if [[ "$CURRENT_COUNT" -eq "$TOTAL_REQUIREMENTS" ]]; then
            echo "  FINAL MOVE $NAME"
            echo "    -> $DEST_FILE"

            mv "$SOURCE_FILE" "$DEST_FILE"
        else
            echo "  COPY $NAME"
            echo "    -> $DEST_FILE"

            cp "$SOURCE_FILE" "$DEST_FILE"
        fi
    done
done

echo
echo "Done."
