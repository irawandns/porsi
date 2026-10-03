import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedFood, RiceMoundConfig, FoodType, PortionSize } from '../types';
import { nasiConfigFor, laukScaleFor, NASI_REST_Y } from '../utils/sizes';
import type { TrayDrag } from '../App';

// Simple grain shader injection for rice texture
const addGrainShader = (shader: any) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
    varying vec3 vWorldPos;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
    varying vec3 vWorldPos;

    float grain(vec3 pos) {
      // Simple 3D noise approximation for grain
      vec3 p = pos * 120.0;
      float n = fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
      return n * 0.08; // Subtle grain strength
    }`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    diffuseColor.rgb *= (1.0 + grain(vWorldPos) - 0.04);`
  );
};

// Shared nasi material with cream matte finish + grain
const nasiMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff4e6, // Warmer cream (more yellow/peachy than f8f8f0)
  roughness: 0.92,
  metalness: 0.0,
});
nasiMaterial.onBeforeCompile = addGrainShader;

const nasiMaterialSelected = new THREE.MeshStandardMaterial({
  color: 0xfffef8, // Slightly brighter cream for selection
  roughness: 0.92,
  metalness: 0.0,
});
nasiMaterialSelected.onBeforeCompile = addGrainShader;

// ---- Toy drag-and-drop engine --------------------------------------------
// Toca-style lift / float / drop, driven entirely inside useFrame via refs
// (no React state per frame). Grab lifts the piece to HOVER_Y with a slight
// scale-up and a tilt toward the finger; a soft landing shadow stays pinned
// to the plate at the real XZ while the mesh floats above it. Release on the
// plate runs one short drop (DROP_MS) plus a single squash (SQUASH_MS) and
// settles. Release off the plate snaps back — nothing lands in empty space.
const HOVER_Y = 0.95;
const LIFT_SCALE = 1.08;
const DROP_MS = 170;
const SQUASH_MS = 230;
const TILT_MAX = 0.24;
const TILT_K = 0.0035;

function easeInQuad(t: number): number {
  return t * t;
}

function clampTilt(v: number): number {
  return Math.max(-TILT_MAX, Math.min(TILT_MAX, v));
}

function damp(cur: number, target: number, k: number): number {
  return cur + (target - cur) * k;
}

export interface RaycastHandle {
  raycastPlate: (screenPos: { x: number; y: number }) => { x: number; y: number; z: number } | null;
  raycastFood: (screenPos: { x: number; y: number }) => { food: PlacedFood; part: 'top' | 'body' | 'foot' } | null;
}

interface Plate3DProps {
  plateScale: number;
  theme: 'light' | 'dark';
  placedFoods: PlacedFood[];
  selectedFoodId: string | null;
  onSelectFood: (id: string | null) => void;
  onFoodUpdate: (instanceId: string, updates: Partial<PlacedFood>) => void;
  onFoodRemove: (instanceId: string) => void;
  onPlacedDragStateChange?: (dragging: boolean, instanceId: string | null) => void;
  trashZoneRef?: React.RefObject<HTMLDivElement | null>;
  trayDrag: TrayDrag | null;
  trayScreenRef: React.MutableRefObject<{ x: number; y: number } | null>;
}

interface SceneProps {
  plateScale: number;
  placedFoods: PlacedFood[];
  selectedFoodId: string | null;
  onSelectFood: (id: string | null) => void;
  onFoodUpdate: (instanceId: string, updates: Partial<PlacedFood>) => void;
  onFoodRemove: (instanceId: string) => void;
  onPlacedDragStateChange?: (dragging: boolean, instanceId: string | null) => void;
  trashZoneRef?: React.RefObject<HTMLDivElement | null>;
  trayDrag: TrayDrag | null;
  trayScreenRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onRaycastReady: (handle: RaycastHandle) => void;
}

/** Per-piece visual drag/settle state. Lives in a Map so useFrame can mutate
 *  it without touching React state. Created on grab or on spawn, cleared
 *  after the settle finishes. */
interface DragVis {
  isDragging: boolean;
  targetX: number;
  targetZ: number;
  startX: number;
  startZ: number;
  tiltX: number;
  tiltZ: number;
  shadowX: number;
  shadowZ: number;
  snapBack: boolean;
  snapT0: number | null;
  settleT0: number | null;
  spawnInit: boolean;
}

function newDragVis(food: PlacedFood): DragVis {
  return {
    isDragging: false,
    targetX: food.position[0],
    targetZ: food.position[2],
    startX: food.position[0],
    startZ: food.position[2],
    tiltX: 0,
    tiltZ: 0,
    shadowX: food.position[0],
    shadowZ: food.position[2],
    snapBack: false,
    snapT0: null,
    settleT0: null,
    spawnInit: false,
  };
}

function foodFootprint(foodType: FoodType, size: PortionSize): number {
  if (foodType === 'nasi') {
    const c = nasiConfigFor(size);
    return Math.max(c.radiusX, c.radiusZ);
  }
  if (foodType === 'ayam') return 0.35 * laukScaleFor(size);
  return 0.3 * laukScaleFor(size);
}

function Plate({ scale }: { scale: number }) {
  return (
    <group name="plate-group">
      <mesh receiveShadow position={[0, 0, 0]} name="plate">
        <cylinderGeometry args={[2 * scale, 2 * scale, 0.1, 32]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <cylinderGeometry args={[2.05 * scale, 2.05 * scale, 0.02, 32]} />
        <meshStandardMaterial color="#4a9eff" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

function SelectionRing({ position, radius }: { position: [number, number, number]; radius: number }) {
  return (
    <mesh position={[position[0], 0.07, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.9, radius * 1.1, 32]} />
      <meshBasicMaterial color="#4a9eff" transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Soft landing shadow pinned to the plate at the real drop XZ. */
function LandingShadow({ spotRef, radius }: {
  spotRef: React.MutableRefObject<{ visible: boolean; x: number; z: number } | null>;
  radius: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const spot = spotRef.current;
    if (!spot?.visible) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(spot.x, 0.021, spot.z);
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <circleGeometry args={[radius, 24]} />
      <meshBasicMaterial color={0x000000} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

interface PlacedFoodMeshProps {
  food: PlacedFood;
  isSelected: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, food: PlacedFood, part: 'top' | 'body' | 'foot') => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  pendingUpdatesRef: React.RefObject<Map<string, Partial<PlacedFood>>>;
  dragVisMap: React.MutableRefObject<Map<string, DragVis>>;
}

function PlacedFoodMesh({ food, isSelected, onPointerDown, onClick, pendingUpdatesRef, dragVisMap }: PlacedFoodMeshProps) {
  // All refs up-front: this component renders nasi XOR lauk per instanceId
  // (foodType never changes for an id), so hook order stays stable.
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const baseRef = useRef<THREE.Mesh>(null);
  const aoBlobRef = useRef<THREE.Mesh>(null);
  const laukMeshRef = useRef<THREE.Mesh>(null);
  const shadowSpotRef = useRef<{ visible: boolean; x: number; z: number } | null>(null);

  const isNasi = food.foodType === 'nasi';
  const laukScale = food.sizeScale ?? 1;
  // Nasi rest height rides position[1] so stacked scoops perch on the pile;
  // plate-level scoops keep position[1] === 0, exactly as before.
  const restY = isNasi ? NASI_REST_Y + (food.position[1] ?? 0) : food.position[1];

  // Arm the spawn settle exactly once per instanceId. Stale spawnedAt
  // (e.g. a re-run after a rearrange commit changed position) is ignored so
  // old pieces never replay the drop.
  useEffect(() => {
    if (food.spawnedAt === undefined) return;
    if (Date.now() - food.spawnedAt > 1500) return;
    let entry = dragVisMap.current.get(food.instanceId);
    if (!entry) {
      entry = newDragVis(food);
      dragVisMap.current.set(food.instanceId, entry);
    }
    if (!entry.spawnInit) {
      entry.spawnInit = true;
      entry.settleT0 = food.spawnedAt;
      entry.targetX = food.position[0];
      entry.targetZ = food.position[2];
      entry.shadowX = food.position[0];
      entry.shadowZ = food.position[2];
    }
  }, [food.instanceId, food.spawnedAt, food.position, dragVisMap]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const now = Date.now();

    const pendingUpdate = pendingUpdatesRef.current?.get(food.instanceId);
    if (pendingUpdate?.config && isNasi) {
      const newConfig = { ...(food.config as RiceMoundConfig), ...pendingUpdate.config };
      if (bodyRef.current) {
        bodyRef.current.scale.set(newConfig.radiusX, newConfig.height, newConfig.radiusZ);
      }
      if (baseRef.current) {
        baseRef.current.scale.set(newConfig.radiusX, newConfig.radiusZ, 1);
      }
      if (aoBlobRef.current) {
        const maxRad = Math.max(newConfig.radiusX, newConfig.radiusZ);
        aoBlobRef.current.scale.set(maxRad * 1.2, maxRad * 1.2, 1);
      }
    }

    const entry = dragVisMap.current.get(food.instanceId);
    const baseScale = isNasi ? 1 : laukScale;

    // --- Active lift: float above the plate, tilt toward the finger ------
    if (entry?.isDragging) {
      group.position.x = damp(group.position.x, entry.targetX, 0.4);
      group.position.z = damp(group.position.z, entry.targetZ, 0.4);
      group.position.y = damp(group.position.y, HOVER_Y, 0.3);
      const s = damp(group.scale.x, baseScale * LIFT_SCALE, 0.3);
      group.scale.set(s, s, s);
      group.rotation.x = damp(group.rotation.x, entry.tiltX, 0.25);
      group.rotation.z = damp(group.rotation.z, entry.tiltZ, 0.25);
      if (aoBlobRef.current) {
        const m = aoBlobRef.current.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, m.opacity - 0.12);
      }
      shadowSpotRef.current = { visible: true, x: entry.shadowX, z: entry.shadowZ };
      return;
    }

    // --- Snap back: released off the plate (not trash) --------------------
    if (entry?.snapBack && entry.snapT0 !== null) {
      const t = Math.min(1, (now - entry.snapT0) / 180);
      group.position.x = damp(group.position.x, entry.startX, 0.45);
      group.position.z = damp(group.position.z, entry.startZ, 0.45);
      group.position.y = damp(group.position.y, restY, 0.4);
      const s = damp(group.scale.x, baseScale, 0.4);
      group.scale.set(s, s, s);
      group.rotation.x = damp(group.rotation.x, 0, 0.35);
      group.rotation.z = damp(group.rotation.z, 0, 0.35);
      shadowSpotRef.current = { visible: false, x: entry.startX, z: entry.startZ };
      if (t >= 1) {
        group.position.set(entry.startX, restY, entry.startZ);
        group.scale.setScalar(baseScale);
        group.rotation.set(0, 0, 0);
        dragVisMap.current.delete(food.instanceId);
        shadowSpotRef.current = null;
      }
      return;
    }

    // --- Settle: short drop + one squash (fresh drops and drag releases) --
    if (entry?.settleT0 !== null && entry?.settleT0 !== undefined) {
      const settleT0 = entry.settleT0 as number;
      const commitX = entry.targetX;
      const commitZ = entry.targetZ;
      const dropT = Math.min(1, (now - settleT0) / DROP_MS);
      if (dropT < 1) {
        const e = easeInQuad(dropT);
        group.position.x = commitX;
        group.position.z = commitZ;
        group.position.y = HOVER_Y + (restY - HOVER_Y) * e;
        const s = baseScale * (LIFT_SCALE + (1 - LIFT_SCALE) * e);
        group.scale.set(s, s, s);
        group.rotation.x = damp(group.rotation.x, 0, 0.4);
        group.rotation.z = damp(group.rotation.z, 0, 0.4);
        shadowSpotRef.current = { visible: true, x: commitX, z: commitZ };
        return;
      }
      const sqT = (now - settleT0 - DROP_MS) / SQUASH_MS;
      if (sqT < 1) {
        const bump = Math.sin(Math.PI * Math.max(0, sqT));
        group.position.set(commitX, restY, commitZ);
        group.scale.set(
          baseScale * (1 + 0.12 * bump),
          baseScale * (1 - 0.2 * bump),
          baseScale * (1 + 0.12 * bump),
        );
        group.rotation.set(0, 0, 0);
        shadowSpotRef.current = { visible: false, x: commitX, z: commitZ };
        return;
      }
      group.position.set(commitX, restY, commitZ);
      group.scale.setScalar(baseScale);
      group.rotation.set(0, 0, 0);
      dragVisMap.current.delete(food.instanceId);
      shadowSpotRef.current = null;
      return;
    }

    // --- Rest: hard-settle exactly (also heals StrictMode double frames) --
    const px = pendingUpdate?.position ? pendingUpdate.position[0] : food.position[0];
    const pz = pendingUpdate?.position ? pendingUpdate.position[2] : food.position[2];
    group.position.set(px, restY, pz);
    if (Math.abs(group.scale.x - baseScale) > 0.001) group.scale.setScalar(baseScale);
    if (group.rotation.x !== 0 || group.rotation.z !== 0) group.rotation.set(0, 0, 0);
    if (aoBlobRef.current) {
      const m = aoBlobRef.current.material as THREE.MeshBasicMaterial;
      if (m.opacity < 0.18) m.opacity = 0.18;
    }
  });

  if (isNasi && food.config) {
    const config = pendingUpdatesRef.current?.get(food.instanceId)?.config
      ? { ...food.config, ...pendingUpdatesRef.current.get(food.instanceId)!.config! }
      : food.config;
    const pos = food.position;
    const maxRadius = Math.max(config.radiusX, config.radiusZ);
    const entry = dragVisMap.current.get(food.instanceId);
    const dragging = entry?.isDragging ?? false;

    return (
      <group>
        {isSelected && !dragging && <SelectionRing position={pos} radius={maxRadius * 1.2} />}
        <LandingShadow spotRef={shadowSpotRef} radius={maxRadius} />

        <group ref={groupRef} position={[pos[0], NASI_REST_Y + (pos[1] ?? 0), pos[2]]}>
          {/* Soft AO blob under rim (fades while lifted; the landing shadow
              marks the drop spot instead) */}
          <mesh
            ref={aoBlobRef}
            position={[0, 0.001, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[maxRadius * 1.2, maxRadius * 1.2, 1]}
          >
            <ringGeometry args={[0.8, 1.0, 32]} />
            <meshBasicMaterial
              color={0x000000}
              transparent
              opacity={0.18}
              depthWrite={false}
            />
          </mesh>

          <mesh
            ref={bodyRef}
            castShadow
            position={[0, 0, 0]}
            scale={[config.radiusX, config.height, config.radiusZ]}
            name={`nasi-body-${food.instanceId}`}
            onPointerDown={(e) => onPointerDown(e, food, 'body')}
            onClick={(e) => onClick(e)}
            material={isSelected ? nasiMaterialSelected : nasiMaterial}
          >
            <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>

          <mesh
            ref={baseRef}
            castShadow
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[config.radiusX, config.radiusZ, 1]}
            name={`nasi-base-${food.instanceId}`}
            onPointerDown={(e) => onPointerDown(e, food, 'foot')}
            onClick={(e) => onClick(e)}
            material={isSelected ? nasiMaterialSelected : nasiMaterial}
          >
            <circleGeometry args={[1, 32]} />
          </mesh>

          {isSelected && !dragging && (
            <>
              <mesh
                position={[0, config.height, 0]}
                name={`nasi-top-${food.instanceId}`}
                onPointerDown={(e) => onPointerDown(e, food, 'top')}
                onClick={(e) => onClick(e)}
              >
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshStandardMaterial color="#4a9eff" emissive="#4a9eff" emissiveIntensity={0.5} />
              </mesh>

              <mesh
                position={[maxRadius * 0.7, 0, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                name={`nasi-foot-handle-${food.instanceId}`}
                onPointerDown={(e) => onPointerDown(e, food, 'foot')}
                onClick={(e) => onClick(e)}
              >
                <ringGeometry args={[0.08, 0.12, 16]} />
                <meshStandardMaterial color="#4a9eff" emissive="#4a9eff" emissiveIntensity={0.3} />
              </mesh>
            </>
          )}
        </group>
      </group>
    );
  }

  const pos = food.position;
  const s = food.sizeScale ?? 1;
  const entry = dragVisMap.current.get(food.instanceId);
  const dragging = entry?.isDragging ?? false;

  // Unit geometry; the size-sheet factor lives ONLY on the group scale so
  // the visual footprint always matches the collision radius.
  const geometry = food.foodType === 'ayam'
    ? <boxGeometry args={[0.6, 0.3, 0.5]} />
    : <sphereGeometry args={[0.3, 16, 16]} />;

  const color = food.foodType === 'ayam' ? '#d4a574' : '#f4e4c1';
  const selectedColor = food.foodType === 'ayam' ? '#e4b584' : '#ffe4d1';

  return (
    <group>
      {isSelected && !dragging && <SelectionRing position={pos} radius={0.5 * s} />}
      <LandingShadow spotRef={shadowSpotRef} radius={0.5 * s} />
      <group ref={groupRef} position={pos} scale={s}>
        <mesh
          ref={laukMeshRef}
          castShadow
          position={[0, 0, 0]}
          name={`lauk-${food.instanceId}`}
          onPointerDown={(e) => onPointerDown(e, food, 'body')}
          onClick={(e) => onClick(e)}
        >
          {geometry}
          <meshStandardMaterial color={isSelected ? selectedColor : color} roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
    </group>
  );
}

/** Airborne tray preview: the dragged bahan floats above the plate with the
 *  same lift + tilt as a placed piece, and its landing shadow stays pinned
 *  to the plate. Hidden whenever the finger is off the plate (the HTML chip
 *  ghost still follows the finger out there). Position source is
 *  trayScreenRef — no React state per move. */
function TrayGhostMesh({ trayDrag, trayScreenRef, plateScale }: {
  trayDrag: TrayDrag | null;
  trayScreenRef: React.MutableRefObject<{ x: number; y: number } | null>;
  plateScale: number;
}) {
  const { camera, gl, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const lastScreen = useRef<{ x: number; y: number } | null>(null);
  const vel = useRef({ x: 0, z: 0 });

  useFrame(() => {
    const group = groupRef.current;
    const shadow = shadowRef.current;
    if (!group || !shadow) return;
    if (!trayDrag) {
      group.visible = false;
      shadow.visible = false;
      lastScreen.current = null;
      return;
    }
    const screen = trayScreenRef.current;
    if (!screen) {
      group.visible = false;
      shadow.visible = false;
      lastScreen.current = null;
      return;
    }

    // Pointer velocity → tilt toward the finger (smoothed, capped).
    if (lastScreen.current) {
      const dx = screen.x - lastScreen.current.x;
      const dy = screen.y - lastScreen.current.y;
      vel.current.x = damp(vel.current.x, clampTilt(dy * TILT_K * 4), 0.3);
      vel.current.z = damp(vel.current.z, clampTilt(-dx * TILT_K * 4), 0.3);
    }
    lastScreen.current = { ...screen };

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      -((screen.y - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.current.setFromCamera(ndc, camera);
    const plateMesh = scene.getObjectByName('plate');
    if (!plateMesh) {
      group.visible = false;
      shadow.visible = false;
      return;
    }
    const hits = raycaster.current.intersectObject(plateMesh, false);
    if (hits.length === 0) {
      group.visible = false;
      shadow.visible = false;
      return;
    }
    const p = hits[0].point.clone();
    const plateRadius = 2 * plateScale * 0.9;
    const dist = Math.sqrt(p.x * p.x + p.z * p.z);
    if (dist > plateRadius) {
      const k = plateRadius / dist;
      p.x *= k;
      p.z *= k;
    }

    group.visible = true;
    shadow.visible = true;
    group.position.x = damp(group.position.x, p.x, 0.5);
    group.position.z = damp(group.position.z, p.z, 0.5);
    group.position.y = damp(group.position.y || HOVER_Y, HOVER_Y, 0.5);
    group.rotation.x = damp(group.rotation.x, vel.current.x, 0.3);
    group.rotation.z = damp(group.rotation.z, vel.current.z, 0.3);
    shadow.position.set(p.x, 0.021, p.z);
  });

  // Reset the lerp origin each time a new tray drag lifts off.
  useEffect(() => {
    if (trayDrag) {
      lastScreen.current = null;
      vel.current = { x: 0, z: 0 };
      if (groupRef.current) groupRef.current.position.set(0, HOVER_Y, 0);
    }
  }, [trayDrag]);

  if (!trayDrag) return null;
  const { foodType, size } = trayDrag;
  const ghostScale = foodType === 'nasi' ? 1 : laukScaleFor(size);
  const ghostRadius = foodFootprint(foodType, size);
  const nasiCfg = foodType === 'nasi' ? nasiConfigFor(size) : null;
  const ghostColor = foodType === 'ayam' ? '#d4a574' : foodType === 'telur' ? '#f4e4c1' : '#fff4e6';

  return (
    <group>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[ghostRadius, 24]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group ref={groupRef} position={[0, HOVER_Y, 0]} scale={ghostScale * LIFT_SCALE} visible={false}>
        {nasiCfg ? (
          <>
            <mesh scale={[nasiCfg.radiusX, nasiCfg.height, nasiCfg.radiusZ]}>
              <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={ghostColor} roughness={0.92} metalness={0} transparent opacity={0.96} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[nasiCfg.radiusX, nasiCfg.radiusZ, 1]}>
              <circleGeometry args={[1, 32]} />
              <meshStandardMaterial color={ghostColor} roughness={0.92} metalness={0} transparent opacity={0.96} />
            </mesh>
          </>
        ) : (
          <mesh castShadow>
            {foodType === 'ayam'
              ? <boxGeometry args={[0.6, 0.3, 0.5]} />
              : <sphereGeometry args={[0.3, 16, 16]} />}
            <meshStandardMaterial color={ghostColor} roughness={0.7} metalness={0.1} transparent opacity={0.96} />
          </mesh>
        )}
      </group>
    </group>
  );
}

interface ManipState {
  food: PlacedFood;
  part: 'top' | 'body' | 'foot';
  startScreenPos: { x: number; y: number };
  lastScreenPos: { x: number; y: number };
  startConfig?: RiceMoundConfig;
  startFoodPos?: [number, number, number];
  startMoundCenter?: { x: number; z: number };
  moved: boolean;
}

function SceneContent({
  plateScale,
  placedFoods,
  selectedFoodId,
  onSelectFood,
  onFoodUpdate,
  onFoodRemove,
  onPlacedDragStateChange,
  trashZoneRef,
  trayDrag,
  trayScreenRef,
  onRaycastReady
}: SceneProps) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const orbitRef = useRef<any>(null);
  const [manipulating, setManipulating] = useState(false);
  const manipStateRef = useRef<ManipState | null>(null);
  const pendingUpdatesRef = useRef<Map<string, Partial<PlacedFood>>>(new Map());
  const dragVisMap = useRef<Map<string, DragVis>>(new Map());
  const primaryPointerIdRef = useRef<number | null>(null);
  const onFoodUpdateRef = useRef(onFoodUpdate);
  const onFoodRemoveRef = useRef(onFoodRemove);
  const onPlacedDragStateChangeRef = useRef(onPlacedDragStateChange);

  useEffect(() => {
    onFoodUpdateRef.current = onFoodUpdate;
  }, [onFoodUpdate]);

  useEffect(() => {
    onFoodRemoveRef.current = onFoodRemove;
  }, [onFoodRemove]);

  useEffect(() => {
    onPlacedDragStateChangeRef.current = onPlacedDragStateChange;
  }, [onPlacedDragStateChange]);

  // Trash drop target lives in the DOM (plate chrome corner) with
  // pointer-events:none so it never fights OrbitControls. Hit-testing here
  // reads its rect directly — no React state per move, keeping mobile drags
  // free of setState storms. Only placed body-drags that actually moved can
  // delete, so taps/selects and nasi sculpt handles (top/foot) never remove.
  const isOverTrash = useCallback((screenPos: { x: number; y: number }) => {
    const el = trashZoneRef?.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return (
      screenPos.x >= rect.left &&
      screenPos.x <= rect.right &&
      screenPos.y >= rect.top &&
      screenPos.y <= rect.bottom
    );
  }, [trashZoneRef]);

  const setTrashHighlight = useCallback((active: boolean) => {
    trashZoneRef?.current?.classList.toggle('trash-active', active);
  }, [trashZoneRef]);

  const endPlacedDrag = useCallback(() => {
    setTrashHighlight(false);
    setManipulating(false);
    manipStateRef.current = null;
    primaryPointerIdRef.current = null;
    onPlacedDragStateChangeRef.current?.(false, null);

    if (orbitRef.current) {
      orbitRef.current.enabled = true;
    }
  }, [setTrashHighlight]);

  const screenToNDC = useCallback((screenPos: { x: number; y: number }) => {
    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();

    return new THREE.Vector2(
      ((screenPos.x - rect.left) / rect.width) * 2 - 1,
      -((screenPos.y - rect.top) / rect.height) * 2 + 1
    );
  }, [gl]);

  const raycastPlate = useCallback((screenPos: { x: number; y: number }) => {
    const mouse = screenToNDC(screenPos);
    raycaster.current.setFromCamera(mouse, camera);

    const plateMesh = scene.getObjectByName('plate');
    if (!plateMesh) return null;

    const intersects = raycaster.current.intersectObject(plateMesh, false);

    if (intersects.length > 0) {
      const point = intersects[0].point.clone();

      const plateRadius = 2 * plateScale * 0.9;
      const distance = Math.sqrt(point.x * point.x + point.z * point.z);

      if (distance > plateRadius) {
        const scale = plateRadius / distance;
        point.x *= scale;
        point.z *= scale;
      }

      return { x: point.x, y: point.y, z: point.z };
    }

    return null;
  }, [camera, scene, plateScale, screenToNDC]);

  const raycastFood = useCallback((screenPos: { x: number; y: number }) => {
    const mouse = screenToNDC(screenPos);
    raycaster.current.setFromCamera(mouse, camera);

    const foodMeshes: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.name.startsWith('nasi-') || obj.name.startsWith('lauk-')) {
        foodMeshes.push(obj);
      }
    });

    const intersects = raycaster.current.intersectObjects(foodMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const name = hit.object.name;

      for (const food of placedFoods) {
        if (name.includes(food.instanceId)) {
          let part: 'top' | 'body' | 'foot' = 'body';
          if (name.includes('-top-')) part = 'top';
          else if (name.includes('-base-') || name.includes('-foot-')) part = 'foot';

          return { food, part };
        }
      }
    }

    return null;
  }, [camera, scene, placedFoods, screenToNDC]);

  useEffect(() => {
    onRaycastReady({ raycastPlate, raycastFood });
  }, [raycastPlate, raycastFood, onRaycastReady]);

  useEffect(() => {
    if (!manipulating) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary && primaryPointerIdRef.current !== null && e.pointerId !== primaryPointerIdRef.current) {
        return;
      }

      const manipState = manipStateRef.current;
      if (!manipState) return;

      const currentScreenPos = { x: e.clientX, y: e.clientY };
      // Direct DOM highlight only (no setState per move); trash accepts
      // placed body-drags, never nasi sculpt handles or tray ghosts.
      setTrashHighlight(manipState.part === 'body' && isOverTrash(currentScreenPos));
      const screenDelta = {
        x: currentScreenPos.x - manipState.startScreenPos.x,
        y: currentScreenPos.y - manipState.startScreenPos.y
      };

      const moveThreshold = 5;
      const hasMoved = Math.abs(screenDelta.x) > moveThreshold || Math.abs(screenDelta.y) > moveThreshold;

      if (!hasMoved && !manipState.moved) return;

      if (!manipState.moved) {
        manipStateRef.current = { ...manipState, moved: true };
      }

      const { food, part, startConfig, startFoodPos, startMoundCenter } = manipState;

      if (food.foodType === 'nasi' && food.config && startConfig && startFoodPos) {
        if (part === 'top') {
          const heightSensitivity = 0.01;
          const deltaHeight = -screenDelta.y * heightSensitivity;
          const newHeight = Math.max(0.2, Math.min(2.0, startConfig.height + deltaHeight));

          if (!isNaN(newHeight) && isFinite(newHeight) && newHeight > 0) {
            pendingUpdatesRef.current.set(food.instanceId, {
              config: { ...food.config, height: newHeight }
            });
          }
        } else if (part === 'body') {
          const hitPos = raycastPlate(currentScreenPos);
          if (hitPos) {
            const plateRadius = 2 * plateScale * 0.9;
            const distance = Math.sqrt(hitPos.x * hitPos.x + hitPos.z * hitPos.z);

            if (!isNaN(distance) && isFinite(distance)) {
              let tx = hitPos.x;
              let tz = hitPos.z;
              if (distance > plateRadius) {
                const scale = plateRadius / distance;
                tx = hitPos.x * scale;
                tz = hitPos.z * scale;
              }
              pendingUpdatesRef.current.set(food.instanceId, {
                position: [tx, startFoodPos[1], tz]
              });
              // Lift visuals: target + tilt toward the finger. All ref-side,
              // applied in the mesh useFrame — zero setState per move.
              const entry = dragVisMap.current.get(food.instanceId);
              if (entry) {
                entry.targetX = tx;
                entry.targetZ = tz;
                entry.shadowX = tx;
                entry.shadowZ = tz;
                const mdx = currentScreenPos.x - manipState.lastScreenPos.x;
                const mdy = currentScreenPos.y - manipState.lastScreenPos.y;
                entry.tiltX = damp(entry.tiltX, clampTilt(entry.tiltX * 0.6 + mdy * TILT_K * 4), 0.6);
                entry.tiltZ = damp(entry.tiltZ, clampTilt(entry.tiltZ * 0.6 - mdx * TILT_K * 4), 0.6);
              }
              manipState.lastScreenPos = currentScreenPos;
            }
          }
        } else if (part === 'foot') {
          const hitPos = raycastPlate(currentScreenPos);
          if (hitPos && startMoundCenter) {
            const startRadius = Math.sqrt(startConfig.radiusX * startConfig.radiusX + startConfig.radiusZ * startConfig.radiusZ) / Math.sqrt(2);
            const currentDistX = hitPos.x - startMoundCenter.x;
            const currentDistZ = hitPos.z - startMoundCenter.z;
            const currentDist = Math.sqrt(currentDistX * currentDistX + currentDistZ * currentDistZ);
            const signedRadialDelta = currentDist - startRadius;

            const newRadiusX = Math.max(0.5, Math.min(2.0, startConfig.radiusX + signedRadialDelta));
            const newRadiusZ = Math.max(0.5, Math.min(2.0, startConfig.radiusZ + signedRadialDelta));

            if (!isNaN(newRadiusX) && !isNaN(newRadiusZ) && isFinite(newRadiusX) && isFinite(newRadiusZ) && newRadiusX > 0 && newRadiusZ > 0) {
              pendingUpdatesRef.current.set(food.instanceId, {
                config: { ...food.config, radiusX: newRadiusX, radiusZ: newRadiusZ }
              });
            }
          }
        }
      } else if (food.foodType !== 'nasi' && startFoodPos) {
        const hitPos = raycastPlate(currentScreenPos);
        if (hitPos) {
          const plateRadius = 2 * plateScale * 0.9;
          const distance = Math.sqrt(hitPos.x * hitPos.x + hitPos.z * hitPos.z);

          if (!isNaN(distance) && isFinite(distance)) {
            let tx = hitPos.x;
            let tz = hitPos.z;
            if (distance > plateRadius) {
              const scale = plateRadius / distance;
              tx = hitPos.x * scale;
              tz = hitPos.z * scale;
            }
            pendingUpdatesRef.current.set(food.instanceId, {
              position: [tx, startFoodPos[1], tz]
            });
            const entry = dragVisMap.current.get(food.instanceId);
            if (entry) {
              entry.targetX = tx;
              entry.targetZ = tz;
              entry.shadowX = tx;
              entry.shadowZ = tz;
              const mdx = currentScreenPos.x - manipState.lastScreenPos.x;
              const mdy = currentScreenPos.y - manipState.lastScreenPos.y;
              entry.tiltX = damp(entry.tiltX, clampTilt(entry.tiltX * 0.6 + mdy * TILT_K * 4), 0.6);
              entry.tiltZ = damp(entry.tiltZ, clampTilt(entry.tiltZ * 0.6 - mdx * TILT_K * 4), 0.6);
            }
            manipState.lastScreenPos = currentScreenPos;
          }
        }
      }
    };

    const handleGlobalPointerDown = (e: PointerEvent) => {
      if (manipulating && !e.isPrimary) {
        pendingUpdatesRef.current.forEach((updates, instanceId) => {
          onFoodUpdateRef.current(instanceId, updates);
        });
        pendingUpdatesRef.current.clear();

        endPlacedDrag();
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (primaryPointerIdRef.current !== null && e.pointerId !== primaryPointerIdRef.current) {
        return;
      }

      const manipState = manipStateRef.current;
      const dropPos = { x: e.clientX, y: e.clientY };

      // Trash drop: only an already-placed food mid body-drag that actually
      // moved. Taps/selects, sculpt handles, and orbit gestures never delete.
      if (
        manipState &&
        manipState.moved &&
        manipState.part === 'body' &&
        isOverTrash(dropPos)
      ) {
        pendingUpdatesRef.current.clear();
        dragVisMap.current.delete(manipState.food.instanceId);
        const removedId = manipState.food.instanceId;
        endPlacedDrag();
        onFoodRemoveRef.current(removedId);
        return;
      }

      if (manipState && manipState.part === 'body') {
        const entry = dragVisMap.current.get(manipState.food.instanceId);
        // Untouched tap: no visuals to settle, just select.
        if (!manipState.moved) {
          if (entry) dragVisMap.current.delete(manipState.food.instanceId);
          pendingUpdatesRef.current.delete(manipState.food.instanceId);
          endPlacedDrag();
          return;
        }
        const plateHit = raycastPlate(dropPos);
        if (plateHit && entry) {
          // Landed on the plate: commit (App soft-pushes apart, nasi never
          // merges) and run one short drop + squash via the entry.
          const pending = pendingUpdatesRef.current.get(manipState.food.instanceId);
          if (pending?.position) {
            onFoodUpdateRef.current(manipState.food.instanceId, pending);
            entry.targetX = pending.position[0];
            entry.targetZ = pending.position[2];
            entry.shadowX = pending.position[0];
            entry.shadowZ = pending.position[2];
          }
          pendingUpdatesRef.current.delete(manipState.food.instanceId);
          entry.isDragging = false;
          entry.snapBack = false;
          entry.settleT0 = Date.now();
          entry.tiltX = 0;
          entry.tiltZ = 0;
          endPlacedDrag();
          return;
        }
        // Released off the plate (and not on trash): snap back to the grab
        // spot. Nothing lands in empty space; no state commit.
        if (entry) {
          entry.isDragging = false;
          entry.snapBack = true;
          entry.snapT0 = Date.now();
          entry.tiltX = 0;
          entry.tiltZ = 0;
        }
        pendingUpdatesRef.current.delete(manipState.food.instanceId);
        endPlacedDrag();
        return;
      }

      pendingUpdatesRef.current.forEach((updates, instanceId) => {
        onFoodUpdateRef.current(instanceId, updates);
      });
      pendingUpdatesRef.current.clear();

      endPlacedDrag();
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: true });
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [manipulating, plateScale, raycastPlate, isOverTrash, setTrashHighlight, endPlacedDrag]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>, food: PlacedFood, part: 'top' | 'body' | 'foot') => {
    e.stopPropagation();

    if (!e.nativeEvent.isPrimary) {
      return;
    }

    if (orbitRef.current) {
      orbitRef.current.enabled = false;
    }

    primaryPointerIdRef.current = e.nativeEvent.pointerId;
    onSelectFood(food.instanceId);
    const startPos: [number, number, number] = [...food.position] as [number, number, number];
    manipStateRef.current = {
      food,
      part,
      startScreenPos: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      lastScreenPos: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      startConfig: food.config ? { ...food.config } : undefined,
      startFoodPos: startPos,
      startMoundCenter: food.position ? { x: food.position[0], z: food.position[2] } : undefined,
      moved: false
    };
    if (part === 'body') {
      // Arm the lift: the mesh floats on first move, trash shows now.
      const entry = newDragVis(food);
      entry.isDragging = true;
      dragVisMap.current.set(food.instanceId, entry);
      onPlacedDragStateChangeRef.current?.(true, food.instanceId);
    }
    setManipulating(true);
  }, [onSelectFood]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
  }, []);

  const handlePlateClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!manipulating) {
      onSelectFood(null);
    }
  }, [manipulating, onSelectFood]);

  return (
    <>
      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        minDistance={5}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2}
        enableDamping
        dampingFactor={0.05}
        enabled={!manipulating}
        enableZoom={true}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />

      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.06, 0]}
        onClick={handlePlateClick}
      >
        <planeGeometry args={[20, 20]} />
        <shadowMaterial opacity={0.3} />
      </mesh>

      <group onClick={handlePlateClick}>
        <Plate scale={plateScale} />
      </group>

      <TrayGhostMesh trayDrag={trayDrag} trayScreenRef={trayScreenRef} plateScale={plateScale} />

      {placedFoods.map(food => (
        <PlacedFoodMesh
          key={food.instanceId}
          food={food}
          isSelected={selectedFoodId === food.instanceId}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          pendingUpdatesRef={pendingUpdatesRef}
          dragVisMap={dragVisMap}
        />
      ))}
    </>
  );
}

const Plate3D = forwardRef<RaycastHandle, Plate3DProps>(({
  plateScale,
  theme,
  placedFoods,
  selectedFoodId,
  onSelectFood,
  onFoodUpdate,
  onFoodRemove,
  onPlacedDragStateChange,
  trashZoneRef,
  trayDrag,
  trayScreenRef
}, ref) => {
  const bgColor = theme === 'dark' ? '#0a0e1a' : '#f8f9fa';
  const raycastHandleRef = useRef<RaycastHandle | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const isMobile = typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);

  useImperativeHandle(ref, () => ({
    raycastPlate: (screenPos) => raycastHandleRef.current?.raycastPlate(screenPos) || null,
    raycastFood: (screenPos) => raycastHandleRef.current?.raycastFood(screenPos) || null,
  }));

  const handleRaycastReady = useCallback((handle: RaycastHandle) => {
    raycastHandleRef.current = handle;
  }, []);

  if (contextLost) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        backgroundColor: bgColor,
        color: theme === 'dark' ? '#e8eaf0' : '#1a1a1a',
        textAlign: 'center',
      }}>
        <h2 style={{ marginBottom: '1rem' }}>⚠️ GPU Context Lost</h2>
        <p style={{ color: theme === 'dark' ? '#a8afc7' : '#6b7280', marginBottom: '1rem' }}>
          Koneksi GPU terputus. Silakan reload halaman.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#4a9eff',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          🔄 Reload Halaman
        </button>
      </div>
    );
  }

  const hint = trayDrag
    ? '🎯 Lepas di atas piring…'
    : placedFoods.length === 0
      ? '🍚 Seret bahan ke piring · lepas di atas makanan lain untuk menumpuk'
      : selectedFoodId
        ? '✋ Seret untuk geser · lepas di atas makanan lain untuk menumpuk · seret ke 🗑️ untuk buang'
        : '🍚 Seret bahan ke piring · lepas di atas makanan lain untuk menumpuk';

  return (
    <>
      <Canvas
        shadows={!isMobile}
        camera={{ position: [4, 4, 6], fov: 50 }}
        style={{ background: bgColor }}
        dpr={isMobile ? 1 : [1, 2]}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.error('WebGL context lost');
            setContextLost(true);
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
            setContextLost(false);
          });
        }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.3}
          color="#ffe5cc"
          castShadow={!isMobile}
          shadow-mapSize-width={isMobile ? 512 : 2048}
          shadow-mapSize-height={isMobile ? 512 : 2048}
        />
        <spotLight
          position={[-5, 5, 5]}
          intensity={0.25}
          color="#cce5ff"
          angle={0.6}
          penumbra={1}
        />

        <SceneContent
          plateScale={plateScale}
          placedFoods={placedFoods}
          selectedFoodId={selectedFoodId}
          onSelectFood={onSelectFood}
          onFoodUpdate={onFoodUpdate}
          onFoodRemove={onFoodRemove}
          onPlacedDragStateChange={onPlacedDragStateChange}
          trashZoneRef={trashZoneRef}
          trayDrag={trayDrag}
          trayScreenRef={trayScreenRef}
          onRaycastReady={handleRaycastReady}
        />

        {!isMobile && <Environment preset="apartment" frames={1} />}
      </Canvas>
      <div className="canvas-hint">
        {hint}
      </div>
    </>
  );
});

Plate3D.displayName = 'Plate3D';

export default Plate3D;
