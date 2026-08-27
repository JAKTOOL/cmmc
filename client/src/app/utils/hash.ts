/** sha256 of a UTF-8 string, hex-encoded. (db.ts keeps a private copy for
 *  ArrayBuffers; this one is for derived-data fingerprints.) */
export const sha256Hex = async (text: string): Promise<string> =>
    [
        ...new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(text),
            ),
        ),
    ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
