import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type BlobMood = 'calm' | 'normal' | 'stressed';

export type LifeArea =
  | 'sleep'
  | 'work'
  | 'relationships'
  | 'health'
  | 'money'
  | 'growth'
  | 'home';

export const LIFE_AREAS: { key: LifeArea; label: string; dir: [number, number, number] }[] = [
  { key: 'sleep', label: 'Sleep', dir: [0, 1, 0] },
  { key: 'work', label: 'Work', dir: [1, 0, 0] },
  { key: 'relationships', label: 'Relationships', dir: [-1, 0, 0] },
  { key: 'health', label: 'Health', dir: [0, -1, 0] },
  { key: 'money', label: 'Money', dir: [0, 0, 1] },
  { key: 'growth', label: 'Growth', dir: [0, 0, -1] },
  { key: 'home', label: 'Home', dir: [Math.SQRT1_2, 0, Math.SQRT1_2] },
];

type MoodPreset = {
  distort: number;
  speed: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  emissiveIntensity: number;
  breatheAmp: number;
  breatheSpeed: number;
  bobAmp: number;
  bobSpeed: number;
  rotSpeed: number;
  ambientIntensity: number;
  keyIntensity: number;
};

const MOOD_PRESETS: Record<BlobMood, MoodPreset> = {
  calm: {
    distort: 0.25,
    speed: 1.0,
    roughness: 0.18,
    metalness: 0.05,
    clearcoat: 0.9,
    emissiveIntensity: 0.08,
    breatheAmp: 0.03,
    breatheSpeed: 0.6,
    bobAmp: 1 / 10,
    bobSpeed: 1 / 2,
    rotSpeed: 0.03,
    ambientIntensity: 1.1,
    keyIntensity: 1.4,
  },
  normal: {
    distort: 0.4,
    speed: 2.0,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1,
    emissiveIntensity: 0.15,
    breatheAmp: 0.04,
    breatheSpeed: 0.8,
    bobAmp: 1 / 6,
    bobSpeed: 1 / 1.5,
    rotSpeed: 0.05,
    ambientIntensity: 1.2,
    keyIntensity: 1.8,
  },
  stressed: {
    distort: 0.6,
    speed: 3.0,
    roughness: 0.06,
    metalness: 0.18,
    clearcoat: 1,
    emissiveIntensity: 0.22,
    breatheAmp: 0.06,
    breatheSpeed: 1.2,
    bobAmp: 1 / 4.5,
    bobSpeed: 1 / 1.1,
    rotSpeed: 0.09,
    ambientIntensity: 1.3,
    keyIntensity: 2.2,
  },
};

type MutableMoodPreset = {
  [K in keyof MoodPreset]: number;
};

type AreaIntensities = Record<LifeArea, number>;

export type BlobMeshVisualProps = {
  rippleAmp: number;
  rippleFreq: number;
  rippleSpeed: number;
  smoothness: number;
  lobes: { home: number; growth: number; money: number };
};

const RES = 40;
const ISO = 58;
const CORE_STRENGTH = 1.15;
const CHILD_COUNT = 8;
const CHILD_OFFSET = 0.93 * 1.6;
const MARGIN = 0.5 * 1.6;
const DRIFT = 0.05;
const BREATHE_AMOUNT = 0.06;
const MARGIN_GRID = 0.12;
const HONEY_SAG = 0.06;
const MOTION_SPEED = 0.3;
const MOTION_SMOOTH_STEPS = 50;

function clampToGrid(px: number, py: number, pz: number): [number, number, number] {
  const m = MARGIN_GRID;
  return [
    THREE.MathUtils.clamp(px, m, 1 - m),
    THREE.MathUtils.clamp(py, m, 1 - m),
    THREE.MathUtils.clamp(pz, m, 1 - m),
  ];
}

const CHILD_DIRS: [number, number, number][] = [
  [0.9, 0.2, 0.3],
  [-0.3, 0.85, -0.4],
  [-0.4, -0.5, 0.75],
  [0.6, -0.5, -0.6],
  [0.2, 0.7, 0.65],
  [-0.65, -0.3, -0.65],
  [0.5, -0.7, 0.4],
  [-0.5, 0.3, -0.8],
];

const LOBE_SIZE_SCALE = [1.1, 0.85, 0.95, 1.0, 0.75, 0.9, 0.7, 0.8];

const DROPLETS: { dir: [number, number, number]; dist: number; size: number }[] = [
  { dir: [0.7, 0.5, 0.4], dist: 1.26, size: 0.55 },
  { dir: [-0.6, 0.3, -0.7], dist: 1.4, size: 0.35 },
  { dir: [0.3, -0.8, 0.2], dist: 1.33, size: 0.45 },
  { dir: [-0.4, -0.3, 0.85], dist: 1.46, size: 0.28 },
  { dir: [0.85, -0.2, -0.4], dist: 1.28, size: 0.4 },
  { dir: [-0.2, 0.9, 0.3], dist: 1.36, size: 0.32 },
  { dir: [0.1, 0.4, -0.9], dist: 1.5, size: 0.22 },
];

const DEFAULT_VISUAL: BlobMeshVisualProps = {
  rippleAmp: 0,
  rippleFreq: 18,
  rippleSpeed: 1,
  smoothness: 0.5,
  lobes: { home: 1, growth: 1, money: 1 },
};

function BlobMesh({
  mood,
  areas,
  rippleAmp = DEFAULT_VISUAL.rippleAmp,
  rippleFreq = DEFAULT_VISUAL.rippleFreq,
  rippleSpeed = DEFAULT_VISUAL.rippleSpeed,
  smoothness = DEFAULT_VISUAL.smoothness,
  lobes = DEFAULT_VISUAL.lobes,
}: {
  mood: BlobMood;
  areas: AreaIntensities;
} & Partial<BlobMeshVisualProps>) {
  const groupRef = useRef<THREE.Group>(null);
  const currentPresetRef = useRef<MutableMoodPreset>({ ...MOOD_PRESETS[mood] });
  const smoothTRef = useRef(0);
  const blobUpdateRef = useRef(0);
  const { scene, gl } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.02);
    scene.environment = envRT.texture;
    scene.background = null;
    pmrem.dispose();
  }, [scene, gl]);

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#9C7714',
      metalness: 1,
      roughness: 0.03,
      envMapIntensity: 6.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      emissive: new THREE.Color('#000000'),
    });

    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uRippleAmp = { value: 0.0 };
      shader.uniforms.uRippleFreq = { value: 18.0 };
      shader.uniforms.uRippleSpeed = { value: 1.0 };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;`
      );

      // Ensure vWorldPos is set after world position is computed
      if (shader.vertexShader.includes('#include <worldpos_vertex>')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vWorldPos = worldPosition.xyz;`
        );
      } else {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
           vWorldPos = worldPos.xyz;`
        );
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         uniform float uTime;
         uniform float uRippleAmp;
         uniform float uRippleFreq;
         uniform float uRippleSpeed;

         float rippleFn(vec3 p){
           float t = uTime * uRippleSpeed;
           float f = uRippleFreq;
           float w1 = sin(p.x * f + t * 1.6);
           float w2 = sin(p.z * (f * 0.9) + t * 1.3);
           float w3 = sin((p.x + p.z) * (f * 0.55) + t * 1.1);
           return (w1 + w2 + 0.6 * w3) / 2.6;
         }`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         // Water-like ripple in shading only: perturb normal with a banded ripple
         float r = rippleFn(vWorldPos * 0.6);
         float rx = rippleFn((vWorldPos + vec3(0.03, 0.0, 0.0)) * 0.6);
         float rz = rippleFn((vWorldPos + vec3(0.0, 0.0, 0.03)) * 0.6);

         vec3 grad = vec3((rx - r), 0.0, (rz - r));
         normal = normalize(normal + vec3(grad.x, 0.0, grad.z) * (uRippleAmp * 1.5));`
      );

      mat.userData.shader = shader;
    };

    mat.needsUpdate = true;
    return mat;
  }, []);

  const eggSizeScales = useMemo(
    () => DROPLETS.map(() => 0.3 + 0.7 * Math.random()),
    []
  );

  const mc = useMemo(() => {
    const m = new MarchingCubes(RES, material, false, false, 200000);
    m.isolation = ISO;
    m.enableUvs = false;
    m.enableColors = false;
    m.scale.setScalar(1);
    return m;
  }, [material]);

  useFrame(({ clock }, delta) => {
    const dt = delta;
    const t = clock.elapsedTime;
    const blend = 1 / MOTION_SMOOTH_STEPS;
    smoothTRef.current += (t - smoothTRef.current) * blend;
    const tSmooth = smoothTRef.current;
    const tSlow = tSmooth * MOTION_SPEED;

    const target = MOOD_PRESETS[mood];
    const current = currentPresetRef.current;
    const presetLerpAlpha = 1 - Math.exp(-dt / 0.4);
    (Object.keys(target) as (keyof MoodPreset)[]).forEach(key => {
      current[key] = THREE.MathUtils.lerp(current[key], target[key], presetLerpAlpha);
    });

    // Update ripple shader uniforms from props.
    const shader = (material as any).userData?.shader;
    if (shader) {
      shader.uniforms.uTime.value = t;
      shader.uniforms.uRippleAmp.value = rippleAmp;
      shader.uniforms.uRippleFreq.value = rippleFreq;
      shader.uniforms.uRippleSpeed.value = rippleSpeed;
    }

    const breatheAmp = current.breatheAmp * 1.2;
    const breathe = 1 + Math.sin(tSlow * current.breatheSpeed) * breatheAmp;
    const scaleCompensate = 1 / (1 - 2 * MARGIN_GRID);
    mc.scale.setScalar(2.025 * 0.6 * breathe * scaleCompensate);
    mc.position.y = Math.sin(tSlow * current.bobSpeed) * current.bobAmp * 2.5;

    const blobTick = (blobUpdateRef.current += 1);
    // Always rebuild the field each frame for now.
    mc.reset();

    const subtract = 12;
    const strength = 0.6;
    const rawWobble = 0.16 + current.distort * 0.2;
    const wobbleAmt = rawWobble * (1 - smoothness);

    let coreX = wobbleAmt * Math.sin(tSlow * 2.2);
    let coreY = wobbleAmt * Math.cos(tSlow * 2.0);
    let coreZ = wobbleAmt * Math.sin(tSlow * 2.4);
    coreX = Math.max(-MARGIN, Math.min(MARGIN, coreX));
    coreY = Math.max(-MARGIN, Math.min(MARGIN, coreY));
    coreZ = Math.max(-MARGIN, Math.min(MARGIN, coreZ));
    const coreStrength = strength * 9;
    const [cpx, cpy, cpz] = clampToGrid(0.5 + coreX * 0.42, 0.5 + coreY * 0.42, 0.5 + coreZ * 0.42);
    mc.addBall(cpx, cpy, cpz, coreStrength, subtract);

    const baseLobeStrength = strength * 0.75 * 1.4;

    for (let i = 0; i < CHILD_COUNT; i++) {
      const dir = CHILD_DIRS[i];
      const phase = i * 1.7;
      const driftX = DRIFT * Math.sin(tSlow * 0.09 + phase);
      const driftY = DRIFT * Math.cos(tSlow * 0.1 + phase + 1);
      const driftZ = DRIFT * Math.sin(tSlow * 0.08 + phase + 2);

      // Base lobe center (no tangential wobble; silhouette stays stable)
      let x0 = dir[0] * CHILD_OFFSET + driftX;
      let y0 = dir[1] * CHILD_OFFSET + driftY - HONEY_SAG;
      let z0 = dir[2] * CHILD_OFFSET + driftZ;

      const dist = Math.hypot(x0, y0, z0) || 1;
      const ax = x0 / dist;
      const ay = y0 / dist;
      const az = z0 / dist;

      const clampedDist = Math.min(dist, MARGIN);
      const lobeVariation = 0.92 + 0.16 * Math.sin(phase + tSlow * 0.2);
      const neckDist = clampedDist * 0.5 * lobeVariation;
      const bulbDist = clampedDist;

      let nx = ax * neckDist;
      let ny = ay * neckDist;
      let nz = az * neckDist;
      nx = Math.max(-MARGIN, Math.min(MARGIN, nx));
      ny = Math.max(-MARGIN, Math.min(MARGIN, ny));
      nz = Math.max(-MARGIN, Math.min(MARGIN, nz));

      let bx = ax * bulbDist;
      let by = ay * bulbDist;
      let bz = az * bulbDist;
      bx = Math.max(-MARGIN, Math.min(MARGIN, bx));
      by = Math.max(-MARGIN, Math.min(MARGIN, by));
      bz = Math.max(-MARGIN, Math.min(MARGIN, bz));

      const sizeScale = LOBE_SIZE_SCALE[i] ?? 1;
      const lobeScale = i === 0 ? lobes.home : i === 1 ? lobes.growth : i === 2 ? lobes.money : 1;
      const bulbStrength =
        baseLobeStrength * sizeScale * (0.94 + 0.12 * Math.cos(phase * 0.7)) * lobeScale;
      const neckStrength = bulbStrength * 0.8;
      const bridgeStrength = (neckStrength + bulbStrength) * 0.86;

      const [npx, npy, npz] = clampToGrid(0.5 + nx * 0.42, 0.5 + ny * 0.42, 0.5 + nz * 0.42);
      mc.addBall(npx, npy, npz, neckStrength, subtract);
      const innerMix = 0.28;
      const innerX = 0.5 + (nx + (bx - nx) * innerMix) * 0.42;
      const innerY = 0.5 + (ny + (by - ny) * innerMix) * 0.42;
      const innerZ = 0.5 + (nz + (bz - nz) * innerMix) * 0.42;
      const [ix, iy, iz] = clampToGrid(innerX, innerY, innerZ);
      mc.addBall(ix, iy, iz, (neckStrength + bridgeStrength) * 0.5, subtract);
      const bridgeMix = 0.55;
      const bridgeX = 0.5 + (nx + (bx - nx) * bridgeMix) * 0.42;
      const bridgeY = 0.5 + (ny + (by - ny) * bridgeMix) * 0.42;
      const bridgeZ = 0.5 + (nz + (bz - nz) * bridgeMix) * 0.42;
      const [brix, briy, briz] = clampToGrid(bridgeX, bridgeY, bridgeZ);
      mc.addBall(brix, briy, briz, bridgeStrength, subtract);

      // Stone-in-water style ripples: modulate only the bulb strength
      // using concentric radial waves in the horizontal plane.
      const rippleAmp =
        mood === 'normal' ? 0.08 : mood === 'stressed' ? 0.16 : 0.0;
      let bulbStrengthRippled = bulbStrength;
      if (rippleAmp > 0) {
        const r = Math.hypot(x0, z0); // radial distance in XZ plane
        const rippleFreq = 10.0;
        const rippleSpeed = 2.0;
        const basePhase = r * rippleFreq - tSlow * rippleSpeed;
        // blend two harmonics for smoother water-like bands
        const ripple =
          0.5 * Math.sin(basePhase) + 0.5 * Math.sin(basePhase * 0.5);
        bulbStrengthRippled = bulbStrength * (1 + ripple * rippleAmp);
      }

      const [bpx, bpy, bpz] = clampToGrid(0.5 + bx * 0.42, 0.5 + by * 0.42, 0.5 + bz * 0.42);
      mc.addBall(bpx, bpy, bpz, bulbStrengthRippled, subtract);
    }

    for (let i = 0; i < DROPLETS.length; i++) {
      const drop = DROPLETS[i];
      const dropPhase = i * 2.4;
      const [dx, dy, dz] = drop.dir;
      const len = Math.hypot(dx, dy, dz) || 1;
      let x = (dx / len) * drop.dist;
      let y = (dy / len) * drop.dist;
      let z = (dz / len) * drop.dist;
      x += wobbleAmt * 0.8 * Math.sin(tSlow * 2.5 + dropPhase);
      y += wobbleAmt * 0.8 * Math.cos(tSlow * 2.8 + dropPhase);
      z += wobbleAmt * 0.8 * Math.sin(tSlow * 2.2 + dropPhase);
      x = Math.max(-1, Math.min(1, x));
      y = Math.max(-1, Math.min(1, y));
      z = Math.max(-1, Math.min(1, z));
      const dropStrength = baseLobeStrength * drop.size * eggSizeScales[i];
      const [dpx, dpy, dpz] = clampToGrid(0.5 + x * 0.42, 0.5 + y * 0.42, 0.5 + z * 0.42);
      mc.addBall(dpx, dpy, dpz, dropStrength, subtract);
    }

    mc.update();


    if (groupRef.current) {
      groupRef.current.rotation.y = tSmooth * 0.06;
      groupRef.current.rotation.x = 0.08 * Math.sin(tSmooth * 0.2);
      const squash = 1 + 0.035 * Math.sin(tSlow * 2.5) * (0.5 + current.distort * 0.5);
      groupRef.current.scale.set(squash, 1 / squash, squash);
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={75} />

      <ambientLight color={0xffffff} intensity={0.12} />
      <directionalLight color={0xffffff} intensity={3.5} position={[6, 8, 4]} />
      <directionalLight color={0xffffff} intensity={2.0} position={[-6, 4, -5]} />

      <group ref={groupRef}>
        <primitive object={mc} />
      </group>
    </>
  );
}

export default function HomeBlob() {
  const [mood, setMood] = useState<BlobMood>('calm');
  const [areaIntensities] = useState<AreaIntensities>(() => {
    const initial: Partial<AreaIntensities> = {};
    LIFE_AREAS.forEach((area, index) => {
      // simple spread 0.3..0.9 for now
      initial[area.key] = 0.3 + (index / Math.max(LIFE_AREAS.length - 1, 1)) * 0.6;
    });
    return initial as AreaIntensities;
  });

  const cycleMood = () => {
    setMood(prev => (prev === 'calm' ? 'normal' : prev === 'normal' ? 'stressed' : 'calm'));
  };

  return (
    <View className="h-[200px] mb-3.5">
      <Canvas
        gl={{ alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.35;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <BlobMesh mood={mood} areas={areaIntensities} />
        </Suspense>
      </Canvas>
      <Pressable
        onPress={cycleMood}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 12 }}>{`Mood: ${mood}`}</Text>
      </Pressable>
      <View
        style={{
          position: 'absolute',
          left: 12,
          bottom: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}
      >
        {Object.entries(areaIntensities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([key, value]) => (
            <Text key={key} style={{ color: '#ffffff', fontSize: 10 }}>
              {`${key}: ${value.toFixed(2)}`}
            </Text>
          ))}
      </View>
    </View>
  );
}
