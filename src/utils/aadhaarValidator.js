// Aadhaar number validation — format + Verhoeff checksum.
//
// This does NOT verify that the number belongs to the person registering,
// or that it's a real, issued Aadhaar number at all — that requires a live
// government API call, explicitly deferred to v2. What this DOES do: reject
// numbers that aren't even structurally possible (wrong length, fails the
// checksum every real Aadhaar number satisfies), which closes the "type any
// random string" gap without needing any external verification service.
//
// The Verhoeff algorithm is the actual checksum scheme UIDAI uses for
// Aadhaar — it's public, well-documented, and catches transpositions and
// random-digit errors better than a simple mod-10 check. Implementation
// follows the standard published multiplication/permutation/inverse tables.

const d = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];

const p = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8],
];

const inv = [0,4,3,2,1,5,6,7,8,9];

function verhoeffChecksumValid(numStr) {
  let c = 0;
  const digits = numStr.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = d[c][p[i % 8][digits[i]]];
  }
  return c === 0;
}

// Validates a string is a structurally plausible Aadhaar number:
// exactly 12 digits, doesn't start with 0 or 1 (UIDAI never issues those),
// and passes the Verhoeff checksum.
function isValidAadhaar(raw) {
  if (typeof raw !== "string") return false;
  const cleaned = raw.replace(/\s|-/g, ""); // allow "1234 5678 9012" style input
  if (!/^[2-9]\d{11}$/.test(cleaned)) return false;
  return verhoeffChecksumValid(cleaned);
}

// Normalizes for storage/uniqueness comparison — strip spaces/dashes so
// "1234 5678 9012" and "123456789012" are recognized as the same number.
function normalizeAadhaar(raw) {
  return raw.replace(/\s|-/g, "");
}

module.exports = { isValidAadhaar, normalizeAadhaar };
