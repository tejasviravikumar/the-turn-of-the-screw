import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/* ---------------- Cinematic timeline (single source of camera truth) ---------------- */
import { TOTAL } from "./timeline";
type Key = { t: number; pos: [number, number, number]; tgt: [number, number, number] };
const KEYS: Key[] = [
  { t: 0, pos: [0.09, 1.79, 0.27], tgt: [0.02, 1.76, 0] }, // 1 fabric macro
  { t: 2.5, pos: [-0.06, 1.77, 0.26], tgt: [0, 1.75, 0] },
  { t: 5, pos: [0.12, 1.92, 0.95], tgt: [0, 1.72, 0] }, // 2 veiled head
  { t: 8, pos: [0.95, 1.5, 1.75], tgt: [0, 1.33, 0] }, // 3 torso three-quarter
  { t: 10.5, pos: [0.62, 1.24, 0.62], tgt: [0.08, 1.2, 0] }, // 4 measurement
  { t: 13, pos: [0.42, 1.62, 0.55], tgt: [0.1, 1.5, 0] }, // 5 seam thread
  { t: 16, pos: [0.55, 1.42, 2.9], tgt: [0, 1.32, 0] }, // 6 pattern pieces
  { t: 19, pos: [-0.75, 1.38, 3.3], tgt: [-0.55, 1.3, 0] }, // 7 brand
];
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.pos)), false, "centripetal");
const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.tgt)), false, "centripetal");
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** time -> curve parameter, eased within each shot so moves feel deliberate */
function timeToU(t: number) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (t <= b.t) {
      const l = clamp01((t - a.t) / (b.t - a.t));
      const k = 0.5 * l + 0.5 * ease(l); // soften stops between shots
      return (i + k) / (KEYS.length - 1);
    }
  }
  return 1;
}

/* ---------------- Geometry ---------------- */
const IVORY = "#F3E8D9";
const CHAMP = "#E7C9B8";

function lathe(profile: [number, number][], seg = 96) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function Mannequin() {
  const torso = useMemo(() => {
    const g = lathe([
      [0, 0.88], [0.12, 0.885], [0.175, 0.92], [0.19, 0.98], [0.18, 1.06], [0.155, 1.14], [0.135, 1.2], [0.14, 1.26],
      [0.16, 1.32], [0.178, 1.38], [0.172, 1.44], [0.18, 1.48], [0.17, 1.52], [0.12, 1.56], [0.06, 1.595], [0.05, 1.62], [0.048, 1.66], [0, 1.665],
    ]);
    g.scale(1.22, 1, 0.76);
    g.computeVertexNormals();
    return g;
  }, []);
  const head = useMemo(() => {
    const g = lathe([[0, 1.655], [0.05, 1.67], [0.075, 1.7], [0.088, 1.75], [0.086, 1.8], [0.07, 1.845], [0.04, 1.87], [0, 1.876]], 64);
    g.scale(0.92, 1, 1.05);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group>
      <mesh geometry={torso} castShadow receiveShadow>
        <meshStandardMaterial color={IVORY} roughness={0.78} />
      </mesh>
      <mesh geometry={head} castShadow rotation-x={-0.06}>
        <meshStandardMaterial color={IVORY} roughness={0.78} />
      </mesh>
      {/* walnut stand */}
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.014, 0.88, 16]} />
        <meshStandardMaterial color="#3a2a26" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.015, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.03, 48]} />
        <meshStandardMaterial color="#2b1f1d" roughness={0.45} metalness={0.2} />
      </mesh>
    </group>
  );
}

function Veil() {
  const ref = useRef<THREE.Mesh>(null);
  const { geo, base } = useMemo(() => {
    const g = lathe([
      [0.001, 1.886], [0.05, 1.878], [0.082, 1.85], [0.098, 1.8], [0.1, 1.74], [0.094, 1.69], [0.09, 1.65], [0.12, 1.6],
      [0.18, 1.555], [0.235, 1.5], [0.255, 1.44], [0.262, 1.39],
    ], 160);
    g.scale(1.12, 1, 0.9);
    return { geo: g, base: Float32Array.from(g.attributes.position.array) };
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const th = Math.atan2(z, x);
      const drop = clamp01((1.84 - y) / 0.45); // folds grow as fabric falls
      const fold = 0.5 + 0.5 * Math.sin(th * 9 + Math.sin(th * 3) * 1.5);
      const fold2 = 0.5 + 0.5 * Math.sin(th * 23 + y * 18);
      const breathe = Math.sin(t * 0.6 + th * 2 + y * 6) * 0.0025;
      const k = 1 + drop * (fold * 0.09 + fold2 * 0.025) + 0.012 + breathe * drop;
      p.setXYZ(i, x * k, y - drop * drop * fold * 0.012, z * k);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh ref={ref} geometry={geo} castShadow>
      <meshPhysicalMaterial color="#F7F1E8" roughness={0.55} sheen={1} sheenColor={CHAMP} sheenRoughness={0.4}
        transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

/** Progressive line: draw range driven by progress 0..1 */
function useProgressLine(points: THREE.Vector3[], dashed = false) {
  return useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = dashed
      ? new THREE.LineDashedMaterial({ color: CHAMP, dashSize: 0.008, gapSize: 0.006, transparent: true })
      : new THREE.LineBasicMaterial({ color: CHAMP, transparent: true });
    const l = new THREE.Line(g, m);
    if (dashed) l.computeLineDistances();
    g.setDrawRange(0, 0);
    return l;
  }, []);
}

function ring(y: number, r: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2 + Math.PI / 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r * 1.22 + Math.sign(Math.cos(a)) * 0.004, y, Math.sin(a) * r * 0.76 + 0.004));
  }
  return pts;
}

function Measurements({ time }: { time: React.MutableRefObject<number> }) {
  const lines = [useProgressLine(ring(1.38, 0.182)), useProgressLine(ring(1.2, 0.139)), useProgressLine(ring(0.98, 0.194))];
  const thread = useProgressLine(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.03, 1.598, 0.03), new THREE.Vector3(0.1, 1.57, 0.035), new THREE.Vector3(0.17, 1.535, 0.03),
      new THREE.Vector3(0.205, 1.5, 0.02), new THREE.Vector3(0.21, 1.44, 0.075), new THREE.Vector3(0.2, 1.3, 0.1),
    ]).getPoints(160).map((v) => v.setZ(v.z + 0.035)), true);
  useFrame(() => {
    const t = time.current;
    lines.forEach((l, i) => {
      const p = clamp01((t - 8 - i * 0.6) / 1.6);
      l.geometry.setDrawRange(0, Math.floor(p * 129));
      (l.material as THREE.LineBasicMaterial).opacity = 0.85 * (t > 16 ? 1 - clamp01((t - 16) / 2) * 0.5 : 1);
    });
    thread.geometry.setDrawRange(0, Math.floor(clamp01((t - 10.6) / 2) * 161));
  });
  return (
    <>
      {lines.map((l, i) => <primitive key={i} object={l} />)}
      <primitive object={thread} />
    </>
  );
}

const SHAPES: { pts: [number, number][]; to: [number, number, number]; rot: number }[] = [
  { pts: [[0, 0], [0.08, 0.02], [0.2, 0.0], [0.22, -0.12], [0.24, -0.2], [0.21, -0.44], [0, -0.44]], to: [0.55, 1.62, 0.15], rot: 0.12 },
  { pts: [[0, 0], [0.06, 0.03], [0.22, 0.02], [0.24, -0.22], [0.2, -0.44], [0, -0.44]], to: [0.95, 1.55, -0.1], rot: -0.08 },
  { pts: [[0, -0.12], [0.15, 0], [0.3, -0.12], [0.26, -0.55], [0.04, -0.55]], to: [0.62, 1.05, 0.05], rot: -0.18 },
  { pts: [[0.04, 0], [0.26, 0], [0.34, -0.5], [-0.04, -0.5]], to: [1.02, 1.0, -0.15], rot: 0.1 },
];

function PatternPieces({ time }: { time: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const geos = useMemo(() => SHAPES.map((s) => {
    const sh = new THREE.Shape(s.pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(sh);
    g.center();
    return g;
  }), []);
  const edges = useMemo(() => geos.map((g) => new THREE.EdgesGeometry(g)), [geos]);
  useFrame(() => {
    const t = time.current;
    const p = ease(clamp01((t - 13) / 3));
    group.current?.children.forEach((c, i) => {
      const s = SHAPES[i];
      const from = new THREE.Vector3(0.05 * (i % 2 ? -1 : 1), 1.3 - i * 0.05, 0.12);
      const local = clamp01(p * 1.3 - i * 0.08);
      c.position.lerpVectors(from, new THREE.Vector3(...s.to), ease(local));
      c.rotation.set(0, -0.35 * (1 - local) + 0.15, s.rot * local);
      c.scale.setScalar(0.25 + 0.75 * local);
      c.visible = t > 13;
      c.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number };
        if (m) m.opacity = (o.type === "Mesh" ? 0.92 : 0.6) * clamp01((t - 13) / 0.8);
      });
    });
  });
  return (
    <group ref={group}>
      {geos.map((g, i) => (
        <group key={i}>
          <mesh geometry={g} castShadow>
            <meshStandardMaterial color="#EFE3CF" roughness={0.95} side={THREE.DoubleSide} transparent />
          </mesh>
          <lineSegments geometry={edges[i]}>
            <lineBasicMaterial color="#794653" transparent />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function CameraRig({ time, playing, speed, onTick }: { time: React.MutableRefObject<number>; playing: boolean; speed: number; onTick: (t: number) => void }) {
  const { camera } = useThree();
  const tgt = useMemo(() => new THREE.Vector3(), []);
  const last = useRef(-1);
  useFrame((_, raw) => {
    if (!playing) return;
    const dt = Math.min(raw, 0.05);
    time.current = Math.min(TOTAL, time.current + dt * speed);
    const u = timeToU(time.current);
    camera.position.copy(posCurve.getPoint(u));
    tgtCurve.getPoint(u, tgt);
    camera.lookAt(tgt);
    const whole = Math.floor(time.current * 4) / 4;
    if (whole !== last.current) { last.current = whole; onTick(time.current); }
  });
  return null;
}

export function AtelierScene({ playing, startAt, onTick, onInteract, interactive }: {
  playing: boolean; startAt: number; onTick: (t: number) => void; onInteract: () => void; interactive: boolean;
}) {
  const time = useRef(startAt);
  useEffect(() => { time.current = startAt; }, [startAt]);
  const narrow = typeof window !== "undefined" && window.innerWidth < 768;
  const start = KEYS[0];
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: start.pos, fov: narrow ? 46 : 32, near: 0.02, far: 40 }}
      onPointerDown={onInteract} onWheel={onInteract} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={["#171114"]} />
      <fog attach="fog" args={["#1d1418", 3, 9]} />
      <ambientLight intensity={0.18} color="#E7C9B8" />
      {/* key: large soft light above and to one side */}
      <spotLight position={[1.6, 3.6, 1.8]} angle={0.5} penumbra={1} intensity={38} color="#F6E6D6" castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0004} />
      {/* warm low fill opposite */}
      <pointLight position={[-1.8, 1.3, 1.2]} intensity={1.6} color="#C99A9D" />
      {/* rear rim separates veil from backdrop */}
      <spotLight position={[-0.6, 2.4, -2]} angle={0.6} penumbra={1} intensity={22} color="#E7C9B8" />
      <Environment resolution={128}>
        <Lightformer intensity={1.2} position={[2, 4, 2]} scale={[4, 4, 1]} color="#F3E8D9" />
        <Lightformer intensity={0.4} position={[-3, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} color="#A96F7D" />
      </Environment>
      <group position={[narrow ? -0.25 : 0, 0, 0]}>
        <Mannequin />
        <Veil />
        <Measurements time={time} />
        <PatternPieces time={time} />
      </group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#25191F" roughness={0.9} />
      </mesh>
      <CameraRig time={time} playing={playing} speed={1} onTick={onTick} />
      {interactive && <OrbitControls target={[-0.55, 1.3, 0]} enablePan={false} minDistance={1.2} maxDistance={5} maxPolarAngle={Math.PI / 2 - 0.05} enableDamping />}
    </Canvas>
  );
}
