import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The deploy (.github/workflows/build-images.yml, deploy/deploy.sh, Dockerfile, /api/version) must ship every image
// it builds and prove the new commit is live.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const workflow = read("../.github/workflows/build-images.yml");
const dockerfile = read("../Dockerfile");
const script = new URL("../deploy/deploy.sh", import.meta.url).pathname;
const scriptText = read("../deploy/deploy.sh");

test("/api/version answers the commit the image was built from", async () => {
  const { GET } = await import("../src/app/api/version/route.ts");
  process.env.GIT_COMMIT = "a".repeat(40);
  const res = GET();
  assert.deepEqual(await res.json(), { commit: "a".repeat(40) });
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  delete process.env.GIT_COMMIT;
  assert.deepEqual(await GET().json(), { commit: null });
});

test("every image is built with its commit, and the deploy waits for /api/version to show it", () => {
  assert.match(workflow, /GIT_COMMIT=\$\{\{ github\.sha \}\}/);
  assert.match(dockerfile, /ARG GIT_COMMIT=""\nENV GIT_COMMIT=\$GIT_COMMIT/);
  assert.match(dockerfile, /COPY deploy\/deploy\.sh \.\/deploy\/deploy\.sh/);
  assert.match(workflow, /\/api\/version/);
  assert.match(workflow, /deploy\.sh "\$GITHUB_SHA"/);
  assert.doesNotMatch(workflow, /hostinger/i);
});

test("deploy.sh deploys every image the workflow builds", () => {
  const built = [...workflow.matchAll(/- image: ([a-z0-9-]+)/g)].map((m) => m[1]).sort();
  const deployed = (scriptText.match(/^IMAGES="([^"]*)"/m)?.[1] ?? "").split(" ").sort();
  assert.deepEqual(deployed, built);
  execFileSync("bash", ["-n", script]);
});

/** Runs deploy.sh from a temp folder with a fake docker that logs each call and answers from `containers`. */
function runDeploy(containers: string[], imageScript?: string) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const p of ["web", "worker"]) {
    mkdirSync(join(dir, p));
    writeFileSync(join(dir, p, "docker-compose.yml"), "services: {}\n");
  }
  copyFileSync(script, join(dir, "deploy.sh"));
  writeFileSync(join(dir, "image-script.sh"), imageScript ?? scriptText);
  writeFileSync(join(dir, "containers"), containers.map((c) => c.replaceAll("$DIR", dir)).join("\n") + (containers.length ? "\n" : ""));
  writeFileSync(
    join(bin, "docker"),
    `#!/usr/bin/env bash
echo "$PWD: $*" >> "${dir}/calls"
case "$1" in
  ps) [ -s "${dir}/containers" ] && seq 1 "$(wc -l < "${dir}/containers")" ;;
  inspect) cat "${dir}/containers" ;;
  run) cat "${dir}/image-script.sh" ;;
esac
exit 0
`,
  );
  chmodSync(join(bin, "docker"), 0o755);
  const res = spawnSync("bash", [join(dir, "deploy.sh"), "b".repeat(40)], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8" });
  let calls = "";
  try {
    calls = readFileSync(join(dir, "calls"), "utf8").replaceAll(dir, "$DIR");
  } catch {}
  return { ...res, calls };
}

// The runner, relay and intel images run together in one project here; on the server they may be apart.
const RUNNING = [
  "ghcr.io/perceptric/claritia-web:latest|claritia-web|$DIR/web|$DIR/web/docker-compose.yml",
  "ghcr.io/perceptric/claritia-runner:latest|claritia-worker|$DIR/worker|$DIR/worker/docker-compose.yml",
  "ghcr.io/perceptric/claritia-relay:latest|claritia-worker|$DIR/worker|$DIR/worker/docker-compose.yml",
  "ghcr.io/perceptric/claritia-intel@sha256:0123|claritia-worker|$DIR/worker|$DIR/worker/docker-compose.yml",
  "supabase/postgres:17.6.1|sb-claritia|/docker/sb-claritia|/docker/sb-claritia/docker-compose.yml",
];

test("deploy.sh pulls and restarts the projects that run the app's images, and nothing else", () => {
  const { status, stdout, stderr, calls } = runDeploy(RUNNING);
  assert.equal(status, 0, stderr);
  assert.match(stdout, /deploy: done/);
  for (const p of ["web", "worker"]) {
    const f = `-p claritia-${p} -f $DIR/${p}/docker-compose.yml`;
    // Once per project, however many of its containers run the app's images.
    assert.equal(calls.split(`$DIR/${p}: compose ${f} pull\n`).length, 2, calls);
    assert.equal(calls.split(`$DIR/${p}: compose ${f} up -d\n`).length, 2, calls);
  }
  assert.doesNotMatch(calls, /sb-claritia/);
  assert.match(calls, /run --rm --entrypoint cat ghcr\.io\/perceptric\/claritia-web:latest deploy\/deploy\.sh/);
});

test("deploy.sh hands over to a newer copy of itself from the image", () => {
  const { status, stdout, calls } = runDeploy(RUNNING, '#!/usr/bin/env bash\necho "newer script ran with $*"\n');
  assert.equal(status, 0);
  assert.match(stdout, /newer script ran with b{40}/);
  assert.doesNotMatch(calls, /up -d/);
});

test("deploy.sh stops when no container runs the app", () => {
  const { status, stderr } = runDeploy([]);
  assert.equal(status, 1);
  assert.match(stderr, /no container on this server runs/);
});
