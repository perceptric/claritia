// Import files (docs/conversion-weeks.md week 2): streaming CSV in any encoding, Excel, vCard, and cleaning.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPhone, nameCase, splitName, titleRole } from "../src/lib/contacts/clean.ts";
import { csvRows, parseCsv, sniffEncoding } from "../src/lib/contacts/csv.ts";
import { prepareImport } from "../src/lib/contacts/import.ts";

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}
async function* pieces(bytes: Uint8Array, size: number) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

const tricky = '﻿email,name,note\r\n"a@x.com","Doe, Jane","He said ""hi""\r\nand left"\r\nb@x.com,Zoë Ångström,Café\n\n"c@x.com",,"x,y"\r\n';

test("streaming CSV gives the same rows however the bytes are cut", async () => {
  const want = parseCsv(tricky);
  assert.equal(want.length, 4);
  const bytes = new TextEncoder().encode(tricky);
  for (const size of [1, 2, 3, 7, 64, 100_000]) assert.deepEqual(await all(csvRows(pieces(bytes, size))), want, `pieces of ${size}`);
});

test("encodings: UTF-16 with a byte order mark, and Windows-1252", async () => {
  const text = "email,name\r\nz@x.com,Zoë Müller\r\n";
  const le = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...text].map((c) => c.charCodeAt(0))).buffer)]);
  assert.equal(sniffEncoding(le), "utf-16le");
  assert.deepEqual(await all(csvRows(pieces(le, 5))), [["email", "name"], ["z@x.com", "Zoë Müller"]]);
  const cp1252 = new Uint8Array([...text].map((c) => c.charCodeAt(0)));
  assert.equal(sniffEncoding(cp1252), "windows-1252");
  assert.deepEqual(await all(csvRows(pieces(cp1252, 3))), [["email", "name"], ["z@x.com", "Zoë Müller"]]);
  const utf8 = new TextEncoder().encode(text);
  assert.equal(sniffEncoding(utf8), "utf-8");
});

test("cleaning: phones, names, titles", () => {
  assert.equal(cleanPhone("(415) 555-0132", "US"), "+14155550132");
  assert.equal(cleanPhone("030 1234567", "DE"), "+49301234567");
  assert.equal(cleanPhone("call me", "US"), "call me");
  assert.equal(nameCase("JANE"), "Jane");
  assert.equal(nameCase("mary-jane o'neil"), "Mary-Jane O'Neil");
  assert.equal(nameCase("ludwig van beethoven"), "Ludwig van Beethoven");
  assert.equal(nameCase("McDonald"), "McDonald");
  assert.deepEqual(splitName("Doe, Jane"), { first: "Jane", last: "Doe" });
  assert.deepEqual(splitName("Jane van Doe"), { first: "Jane", last: "van Doe" });
  assert.deepEqual(titleRole("VP of Marketing"), { seniority: "VP", department: "Marketing" });
  assert.deepEqual(titleRole("Senior Software Engineer"), { seniority: "Individual", department: "Engineering" });
  assert.deepEqual(titleRole("Co-founder & CEO"), { seniority: "C-level", department: undefined });
});

test("unsubscribe files and consent cells block the address, and seniority fills in", () => {
  const custom = [
    { key: "seniority", label: "Seniority", type: "select" as const, options: ["C-level", "VP", "Director", "Manager", "Individual"] },
    { key: "department", label: "Department", type: "select" as const, options: ["Marketing", "Sales", "Engineering"] },
  ];
  const p = prepareImport(
    [
      ["a@acme.com", "unsubscribed", "Head of Growth"],
      ["b@acme.com", "opt-in", "Director, Sales"],
      ["c@acme.com", "cleaned", ""],
    ],
    { columns: ["email", "basis", "title"], source: "signups", basis: null },
    { custom },
  );
  assert.deepEqual(p.suppress, [
    { email_clean: "a@acme.com", reason: "unsubscribed" },
    { email_clean: "c@acme.com", reason: "bounced" },
  ]);
  assert.equal(p.contacts.find((c) => c.email_clean === "a@acme.com")!.basis, "none", "an unsubscribed person has no basis");
  assert.deepEqual(p.contacts.find((c) => c.email_clean === "b@acme.com")!.fields, { seniority: "Director", department: "Sales" });
  const all = prepareImport([["x@acme.com"], ["y@acme.com"]], { columns: ["email"], source: "crm_export", basis: null, list: "bounced" }, { custom: [] });
  assert.equal(all.suppress.length, 2);
});

