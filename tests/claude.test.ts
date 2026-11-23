import assert from "node:assert/strict";
import { test } from "node:test";
import { jsonRequest, textOf, usageOf } from "../src/lib/claude.ts";

const SCHEMA = { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false };

test("an Opus request has the fallback, adaptive thinking, the schema and cached instructions", () => {
  assert.deepEqual(jsonRequest({ model: "claude-opus-5-5", maxTokens: 16000, effort: "medium", schema: SCHEMA, system: "S", content: "U", fallback: true }), {
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: "S", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: "U" }],
  });
});

test("a Haiku request has no fallback", () => {
  const r = jsonRequest({ model: "claude-haiku-5-5", maxTokens: 4000, effort: "low", schema: SCHEMA, system: "S", content: "U", fallback: false });
  assert.ok(!("betas" in r) && !("fallbacks" in r));
  assert.equal(r.output_config.effort, "low");
});

test("usage counts cached input, and the text is joined from text blocks only", () => {
  const res = { usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 }, content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"a":' }, { type: "text", text: '"x"}' }] };
  assert.deepEqual(usageOf(res as never), { input: 115, output: 7 });
  assert.equal(textOf(res as never), '{"a":"x"}');
});
