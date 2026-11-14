import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const params = new URLSearchParams(location.search);
const KIND = params.get("kind") || "calendar";
const SIZE = Number(params.get("size") || 640);
const DARK = params.get("theme") === "dark";
const FILL = 0.76;

// Materials: glazed porcelain, a deeper glaze for second parts, Claritia blue enamel, ink, and clear blue glass.
const M = {
  porcelain: new THREE.MeshPhysicalMaterial({ color: DARK ? "#d9dbe2" : "#f4f3ef", roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22 }),
  shade: new THREE.MeshPhysicalMaterial({ color: DARK ? "#9ea3b0" : "#dcdbd5", roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
  blue: new THREE.MeshPhysicalMaterial({ color: DARK ? "#17a673" : "#0c8c5e", roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1 }),
  paleShade: new THREE.MeshPhysicalMaterial({ color: DARK ? "#c4c8d1" : "#e9e8e3", roughness: 0.4, clearcoat: 0.4 }),
  paleBlue: new THREE.MeshPhysicalMaterial({ color: DARK ? "#7fd3ad" : "#b9e3cf", roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
  ink: new THREE.MeshPhysicalMaterial({ color: "#1d1f25", roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  fire: new THREE.MeshPhysicalMaterial({ color: "#ff5a1f", roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#dfe9ff", roughness: 0.06, metalness: 0, transmission: 1, thickness: 0.5, ior: 1.45,
    attenuationColor: new THREE.Color("#7fd3ad"), attenuationDistance: 1.4, clearcoat: 1, transparent: true, opacity: 1,
  }),
};

// Shapes ------------------------------------------------------------------------------------------

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function at(obj, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
}
const box = (w, h, d, r, mat) => mesh(new RoundedBoxGeometry(w, h, d, 6, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), mat);
const ball = (r, mat) => mesh(new THREE.SphereGeometry(r, 64, 48), mat);

/** A cylinder with soft edges, standing on y = 0. */
function puck(r, h, b, mat) {
  const pts = [new THREE.Vector2(0, 0)];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, b + Math.sin(a) * b));
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h));
  return mesh(new THREE.LatheGeometry(pts, 96), mat);
}

/** A thick line through points, with round joints and ends. */
function stroke(points, radius, mat) {
  const g = new THREE.Group();
  const v = points.map((p) => new THREE.Vector3(...p));
  v.forEach((p) => g.add(at(ball(radius, mat), p.x, p.y, p.z)));
  for (let i = 0; i < v.length - 1; i++) {
    const a = v[i], b = v[i + 1];
    const len = a.distanceTo(b);
    const c = mesh(new THREE.CylinderGeometry(radius, radius, len, 48, 1, true), mat);
    c.position.copy(a.clone().add(b).multiplyScalar(0.5));
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(c);
  }
  return g;
}

/** A smooth tube along a curve. */
function tube(points, radius, mat, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, "centripetal");
  const g = new THREE.Group();
  g.add(mesh(new THREE.TubeGeometry(curve, 160, radius, 32, closed), mat));
  if (!closed) {
    g.add(at(ball(radius, mat), ...points[0]));
    g.add(at(ball(radius, mat), ...points[points.length - 1]));
  }
  return g;
}

/** A flat shape pushed into depth with rounded edges, centered. */
function slab(shape, depth, bevel, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 8, curveSegments: 48 });
  geo.center();
  return mesh(geo, mat);
}

function roundedPolygon(pts, r) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector2(...pts[i]);
    const prev = new THREE.Vector2(...pts[(i - 1 + n) % n]);
    const next = new THREE.Vector2(...pts[(i + 1) % n]);
    const a = p.clone().add(prev.clone().sub(p).normalize().multiplyScalar(r));
    const b = p.clone().add(next.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) s.moveTo(a.x, a.y);
    else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  }
  s.closePath();
  return s;
}

function group(...kids) {
  const g = new THREE.Group();
  kids.forEach((k) => g.add(k));
  return g;
}

// Pictures ----------------------------------------------------------------------------------------

const check = (s, mat, r = 0.16) => stroke([[-0.5 * s, 0.02 * s, 0], [-0.15 * s, -0.33 * s, 0], [0.55 * s, 0.4 * s, 0]], r, mat);

const PICTURES = {
  /** Forms: a form card with two fields, two choices and the send button. */
  clipboard() {
    const card = at(box(1.75, 2.25, 0.2, 0.14, M.porcelain), 0, 1.12, 0);
    const title = at(box(0.8, 0.12, 0.05, 0.04, M.ink), -0.3, 1.95, 0.11);
    const f1 = at(box(1.35, 0.3, 0.08, 0.1, M.shade), 0, 1.62, 0.11);
    const f2 = at(box(1.35, 0.3, 0.08, 0.1, M.shade), 0, 1.22, 0.11);
    const c1 = at(box(0.62, 0.26, 0.1, 0.12, M.blue), -0.36, 0.84, 0.12);
    const c2 = at(box(0.62, 0.26, 0.08, 0.12, M.paleBlue), 0.36, 0.84, 0.11);
    const btn = at(box(1.35, 0.34, 0.14, 0.16, M.ink), 0, 0.4, 0.13);
    const arrow = at(stroke([[-0.12, 0, 0], [0.12, 0, 0], [0.04, 0.08, 0], [0.12, 0, 0], [0.04, -0.08, 0]], 0.025, M.porcelain), 0, 0.4, 0.22);
    return at(group(card, title, f1, f2, c1, c2, btn, arrow), 0, 0, 0, 0, 0, 0);
  },
  /** Capture: a funnel with leads dropping in and one coming out green. */
  funnel() {
    const prof = [[0.16, 0.0], [0.2, 0.0], [0.2, 0.55], [1.08, 1.6], [1.12, 1.72], [1.02, 1.74], [0.12, 0.62], [0.12, 0.0]].map(([x, y]) => new THREE.Vector2(x, y));
    const f = mesh(new THREE.LatheGeometry(prof, 128), M.porcelain);
    f.position.y = 0.75;
    const rim = at(mesh(new THREE.TorusGeometry(1.08, 0.07, 24, 128).rotateX(Math.PI / 2), M.shade), 0, 0.75 + 1.72, 0);
    const balls = [
      at(ball(0.2, M.shade), -0.35, 2.75, 0.1),
      at(ball(0.17, M.porcelain), 0.3, 2.95, -0.15),
      at(ball(0.15, M.shade), 0.05, 3.25, 0.2),
    ];
    const out = at(ball(0.24, M.blue), 0, 0.24, 0);
    return group(f, rim, ...balls, out);
  },
  /** Pipeline: a stack of records, the top one lifted out in green. */
  cards() {
    const g = new THREE.Group();
    const rows = [[0, M.shade, 0], [0.42, M.porcelain, 0], [0.98, M.blue, 0.22]];
    for (const [y, mat, dx] of rows) {
      g.add(at(box(2.0, 0.34, 1.15, 0.12, mat), dx, y + 0.17, -dx * 0.6, 0, dx * 0.4, 0));
      const dot = mat === M.blue ? M.porcelain : M.blue;
      g.add(at(ball(0.07, dot), dx - 0.72, y + 0.17, 0.585 - dx * 0.6 + dx * 0.26));
      g.add(at(box(0.9, 0.08, 0.04, 0.03, mat === M.blue ? M.porcelain : M.shade), dx - 0.1, y + 0.17, 0.585 - dx * 0.6 + dx * 0.15));
    }
    return at(g, 0, 0, 0, 0, 0, 0);
  },
  /** Chain: steps joined on a path, one branch reaching the green goal. */
  road() {
    const y = 0.22;
    const g = new THREE.Group();
    const nodes = [[-1.0, -0.2, M.porcelain], [0.0, 0.0, M.porcelain], [0.95, -0.75, M.shade], [0.85, 0.75, M.blue]];
    g.add(tube([[-1.0, y, -0.2], [-0.5, y, -0.05], [0.0, y, 0.0]], 0.11, M.shade));
    g.add(tube([[0.0, y, 0.0], [0.5, y, -0.25], [0.95, y, -0.75]], 0.11, M.shade));
    g.add(tube([[0.0, y, 0.0], [0.45, y, 0.35], [0.85, y, 0.75]], 0.11, M.blue));
    for (const [x, z, mat] of nodes) g.add(at(puck(0.38, 0.44, 0.13, mat), x, 0, z));
    const flag = group(stroke([[0, 0, 0], [0, 1.05, 0]], 0.05, M.ink), at(box(0.5, 0.34, 0.06, 0.04, M.blue), 0.27, 0.86, 0));
    flag.position.set(0.85, 0.44, 0.75);
    g.add(flag);
    return at(g, 0, 0, 0, 0.45, 0, 0);
  },
  /** Workflows: a paper plane on its way, with a green trail. */
  plane() {
    const N = [0, 0.05, 1.45], L = [-1.05, 0.32, -0.85], R = [1.05, 0.32, -0.85], C = [0, 0, -0.85], K = [0, -0.42, -0.85];
    const tri = (pts, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
      geo.computeVertexNormals();
      const m = mesh(geo, mat.clone());
      m.material.side = THREE.DoubleSide;
      m.material.flatShading = true;
      return m;
    };
    const plane = group(tri([N, L, C], M.porcelain), tri([N, C, R], M.paleShade), tri([N, K, C], M.shade), tri([N, C, K], M.shade));
    plane.scale.setScalar(1.25);
    const PR = (params.get("rot") || "0.5,0,0,1.85").split(",").map(Number);
    plane.rotation.set(PR[0], PR[1], PR[2]);
    const flying = group(plane);
    flying.rotation.y = PR[3];
    flying.position.set(0.45, 1.6, -0.2);
    const curve = new THREE.CatmullRomCurve3([[-1.7, 0.35, 0.9], [-1.1, 0.4, 0.2], [-0.9, 0.95, -0.4], [-0.4, 1.2, 0.0], [-0.1, 1.4, 0.05]].map((p) => new THREE.Vector3(...p)));
    const trail = new THREE.Group();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = curve.getPoint(i / n), b = curve.getPoint(i / n + 0.55 / n);
      trail.add(stroke([a.toArray(), b.toArray()], 0.055, M.blue));
    }
    trail.rotation.y = 0.35;
    trail.position.set(-0.2, 0, -0.3);
    return group(flying, trail);
  },
  /** Routing: a signpost, the picked way in green. */
  signpost() {
    const arrow = (w, mat) => slab(roundedPolygon([[-w / 2, 0.22], [w / 2 - 0.22, 0.22], [w / 2, 0], [w / 2 - 0.22, -0.22], [-w / 2, -0.22]], 0.06), 0.12, 0.04, mat);
    const post = at(mesh(new THREE.CylinderGeometry(0.09, 0.1, 2.6, 48), M.porcelain), 0, 1.3, 0);
    const cap = at(ball(0.12, M.porcelain), 0, 2.6, 0);
    const base = puck(0.55, 0.16, 0.06, M.shade);
    const a1 = at(arrow(1.5, M.blue), 0.55, 2.2, 0.0);
    const a2 = at(arrow(1.3, M.porcelain), -0.45, 1.65, 0, 0, Math.PI, 0);
    a2.rotation.y = Math.PI - 0.45;
    a2.position.set(-0.4, 1.65, -0.25);
    const a3 = at(arrow(1.1, M.shade), 0.38, 1.12, 0.12, 0, -0.45, 0);
    return at(group(base, post, cap, a1, a2, a3), 0, 0, 0, 0, 0, 0);
  },
  /** Emails: a sealed envelope over a second one. */
  envelopes() {
    const back = at(box(2.0, 1.3, 0.18, 0.1, M.shade), 0.35, 0.95, -0.45, 0, 0.1, 0.12);
    const body = at(box(2.0, 1.3, 0.2, 0.1, M.porcelain), 0, 0.68, 0);
    const flap = slab(roundedPolygon([[-0.98, 0.0], [0.98, 0.0], [0, -0.62]], 0.08), 0.04, 0.03, M.paleShade);
    flap.position.set(0, 1.12, 0.13);
    const seal = puck(0.18, 0.08, 0.03, M.blue);
    seal.rotation.x = Math.PI / 2;
    seal.position.set(0, 0.62, 0.12);
    const l1 = stroke([[-0.98, 0.06, 0.11], [-0.3, 0.55, 0.11]], 0.02, M.shade);
    const l2 = stroke([[0.98, 0.06, 0.11], [0.3, 0.55, 0.11]], 0.02, M.shade);
    return at(group(back, body, flap, seal, l1, l2), 0, 0, 0, 0, 0, 0);
  },
  /** Feed: a page with its form and the green button. */
  browser() {
    const frame = at(box(2.2, 1.65, 0.2, 0.12, M.porcelain), 0, 0.83, 0);
    const bar = at(box(2.06, 0.03, 0.04, 0.01, M.shade), 0, 1.42, 0.1);
    const dots = [M.ink, M.shade, M.shade].map((m, i) => at(ball(0.055, m), -0.92 + i * 0.17, 1.53, 0.1));
    const f1 = at(box(1.5, 0.22, 0.07, 0.04, M.shade), -0.1, 1.12, 0.1);
    const f2 = at(box(1.5, 0.22, 0.07, 0.04, M.shade), -0.1, 0.82, 0.1);
    const btn = at(box(0.8, 0.26, 0.14, 0.13, M.blue), -0.45, 0.46, 0.12);
    const pic = at(box(0.42, 0.52, 0.09, 0.04, M.paleBlue), 0.82, 0.97, 0.1);
    const back = at(box(1.6, 1.25, 0.16, 0.1, M.shade), 0.55, 0.62, -0.5, 0, 0.18, 0);
    return at(group(back, frame, bar, ...dots, f1, f2, btn, pic), 0, 0, 0, 0, 0, 0);
  },
  /** People: contact cards. */
  megaphone() {
    const back = at(box(1.6, 2.0, 0.2, 0.1, M.shade), 0.38, 1.0, -0.42, 0, 0.12, 0.08);
    const front = at(box(1.6, 2.0, 0.2, 0.1, M.porcelain), 0, 1.0, 0);
    const head = at(ball(0.3, M.blue), 0, 1.38, 0.12);
    head.scale.set(1, 1, 0.55);
    const body = at(ball(0.5, M.blue), 0, 0.72, 0.1);
    body.scale.set(1, 0.42, 0.3);
    const l1 = at(box(0.9, 0.1, 0.06, 0.03, M.shade), 0, 0.38, 0.11);
    const l2 = at(box(0.56, 0.1, 0.06, 0.03, M.shade), 0, 0.22, 0.11);
    return at(group(back, front, head, body, l1, l2), 0, 0, 0, 0, 0, 0);
  },
  /** Settings: two gears, the small one green. */
  gear() {
    const gearShape = (teeth, R, r, hole) => {
      const s = new THREE.Shape();
      const n = teeth * 4;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rad = i % 4 === 0 || i % 4 === 1 ? R : r;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      const h = new THREE.Path();
      h.absarc(0, 0, hole, 0, Math.PI * 2, true);
      s.holes.push(h);
      return s;
    };
    const big = slab(gearShape(10, 1.0, 0.82, 0.3), 0.3, 0.05, M.porcelain);
    big.position.set(-0.3, 1.15, 0);
    big.rotation.z = 0.12;
    const small = slab(gearShape(7, 0.62, 0.48, 0.18), 0.34, 0.05, M.blue);
    small.position.set(0.98, 0.72, 0.12);
    small.rotation.z = 0.3;
    const hub1 = at(puck(0.22, 0.42, 0.06, M.shade), -0.3, 1.15, -0.21, Math.PI / 2, 0, 0);
    const hub2 = at(puck(0.12, 0.46, 0.05, M.porcelain), 0.98, 0.72, -0.11, Math.PI / 2, 0, 0);
    return at(group(big, small, hub1, hub2), 0, 0, 0, 0, 0, 0);
  },
  /** Meetings: a desk calendar with six time slots, one booked in green. */
  calendar() {
    const face = new THREE.Group();
    face.add(at(box(2.3, 2.0, 0.24, 0.18, M.porcelain), 0, 1.0, 0));
    face.add(at(box(2.3, 0.46, 0.27, 0.16, M.shade), 0, 1.79, 0.0));
    for (const x of [-0.6, 0.6]) face.add(at(mesh(new THREE.TorusGeometry(0.15, 0.05, 20, 64), M.ink), x, 2.02, 0, 0, Math.PI / 2, 0));
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) {
        const booked = r === 0 && c === 2;
        const x = -0.66 + c * 0.66, y = 1.2 - r * 0.62;
        face.add(at(box(0.54, 0.44, booked ? 0.2 : 0.08, 0.12, booked ? M.blue : M.shade), x, y, booked ? 0.18 : 0.13));
        if (booked) face.add(at(check(0.22, M.porcelain, 0.04), x, y, 0.3));
      }
    face.rotation.x = -0.18;
    const leg = at(box(0.7, 0.14, 0.9, 0.06, M.shade), 0, 0.07, -0.45);
    return at(group(face, leg), 0, 0, 0, 0, 0, 0);
  },
  /** Sync: two arrows chasing each other round, one green. */
  sync() {
    const arc = (a0, a1, mat) => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = a0 + (a1 - a0) * (i / 24);
        pts.push([Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0]);
      }
      const g = tube(pts, 0.14, mat);
      const end = new THREE.Vector3(...pts[pts.length - 1]);
      const tangent = new THREE.Vector3(-Math.sin(a1), Math.cos(a1), 0).multiplyScalar(Math.sign(a1 - a0));
      const head = mesh(new THREE.ConeGeometry(0.3, 0.42, 48), mat);
      head.position.copy(end.clone().add(tangent.clone().multiplyScalar(0.12)));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
      g.add(head);
      return g;
    };
    const g = group(arc(Math.PI * 0.15, Math.PI * 0.85, M.blue), arc(Math.PI * 1.15, Math.PI * 1.85, M.porcelain));
    return at(g, 0, 1.25, 0, -0.06, 0.1, 0);
  },
  /** Your domain: a globe with a green orbit. */
  domain() {
    const globe = at(ball(0.92, M.porcelain), 0, 1.15, 0);
    const lines = new THREE.Group();
    for (const ry of [0, Math.PI / 3, (2 * Math.PI) / 3]) lines.add(at(mesh(new THREE.TorusGeometry(0.925, 0.018, 16, 160), M.shade), 0, 0, 0, 0, ry, 0));
    for (const y of [-0.46, 0, 0.46]) {
      const r = Math.sqrt(0.925 ** 2 - y * y);
      lines.add(at(mesh(new THREE.TorusGeometry(r, 0.018, 16, 160), M.shade), 0, y, 0, Math.PI / 2, 0, 0));
    }
    lines.position.set(0, 1.15, 0);
    const ring = new THREE.Group();
    ring.add(mesh(new THREE.TorusGeometry(1.38, 0.07, 32, 200), M.blue));
    ring.add(at(ball(0.17, M.blue), 1.38 * Math.cos(-0.6), 1.38 * Math.sin(-0.6), 0));
    ring.rotation.set(Math.PI / 2 - 0.1, 0, 0.32);
    ring.position.set(0, 1.15, 0);
    return group(globe, lines, ring);
  },
  /** Your own code: a key, its bow in green. */
  key() {
    const bow = mesh(new THREE.TorusGeometry(0.42, 0.16, 40, 120), M.blue);
    const shaft = at(mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.7, 48), M.porcelain), 0, -1.27, 0);
    const tip = at(ball(0.11, M.porcelain), 0, -2.12, 0);
    const collar = at(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 48), M.shade), 0, -0.55, 0);
    const t1 = at(box(0.36, 0.16, 0.16, 0.05, M.porcelain), 0.2, -1.75, 0);
    const t2 = at(box(0.26, 0.14, 0.16, 0.05, M.porcelain), 0.15, -1.98, 0);
    const k = group(bow, shaft, tip, collar, t1, t2);
    k.rotation.set(0.05, 0.15, -0.8);
    k.position.set(0, 1.3, 0);
    return k;
  },
};

// Stage -------------------------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = DARK ? 0.92 : 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;

const key = new THREE.DirectionalLight("#ffffff", 2.2);
key.position.set(-3.5, 9, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 14;
key.shadow.blurSamples = 25;
key.shadow.bias = -0.0005;
const sc = key.shadow.camera;
sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 0.5; sc.far = 25;
scene.add(key);
const rim = new THREE.DirectionalLight("#d9efe4", 0.7);
rim.position.set(5, 3, -4);
scene.add(rim);
scene.add(new THREE.HemisphereLight("#ffffff", "#d8dce6", 0.35));

const obj = PICTURES[KIND]();
const holder = new THREE.Group();
holder.add(obj);
scene.add(holder);

// Sit the object on the ground, centered, floating a little.
const bb = new THREE.Box3().setFromObject(holder, true);
const center = bb.getCenter(new THREE.Vector3());
holder.position.set(-center.x, -bb.min.y + 0.22, -center.z);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: DARK ? "#000000" : "#1c2a24", opacity: DARK ? 0.45 : 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A soft contact glow right under the object.
const cv = document.createElement("canvas");
cv.width = cv.height = 256;
const cx = cv.getContext("2d");
const grd = cx.createRadialGradient(128, 128, 0, 128, 128, 128);
grd.addColorStop(0, DARK ? "rgba(0,0,0,0.5)" : "rgba(20,40,30,0.15)");
grd.addColorStop(1, "rgba(0,0,0,0)");
cx.fillStyle = grd;
cx.fillRect(0, 0, 256, 256);
const blobTex = new THREE.CanvasTexture(cv);
const size = bb.getSize(new THREE.Vector3());
const blob = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size.x, size.z) * 1.15, Math.max(size.x, size.z) * 0.95), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.002;
scene.add(blob);

// Camera: a three-quarter look from above. Every object fills the same share of the frame.
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
const fit = new THREE.Box3().setFromObject(holder, true);
const sphere = fit.getBoundingSphere(new THREE.Sphere());
const dir = new THREE.Vector3(0.36, 0.5, 1.5).normalize();
let dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(12));
const corners = [];
for (const x of [fit.min.x, fit.max.x]) for (const y of [fit.min.y, fit.max.y]) for (const z of [fit.min.z, fit.max.z]) corners.push(new THREE.Vector3(x, y, z));
let cxy = [0, 0];
for (let i = 0; i < 6; i++) {
  camera.position.copy(sphere.center).add(dir.clone().multiplyScalar(dist));
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ps = corners.map((c) => c.clone().project(camera));
  const minX = Math.min(...ps.map((p) => p.x)), maxX = Math.max(...ps.map((p) => p.x));
  const minY = Math.min(...ps.map((p) => p.y)), maxY = Math.max(...ps.map((p) => p.y));
  cxy = [(minX + maxX) / 2, (minY + maxY) / 2];
  const ext = Math.max(maxX - minX, maxY - minY) / 2;
  dist *= ext / FILL;
}
camera.setViewOffset(SIZE, SIZE, (cxy[0] * SIZE) / 2 + SIZE * 0.02, (-cxy[1] * SIZE) / 2 + SIZE * 0.035, SIZE, SIZE);

renderer.render(scene, camera);
renderer.render(scene, camera);
window.__done = true;
