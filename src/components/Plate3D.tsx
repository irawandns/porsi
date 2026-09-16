import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedFood, RiceMoundConfig } from '../types';

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
  isDragging: boolean;
  dragScreenPosRef: React.RefObject<{ x: number; y: number } | null>;
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
  onRaycastReady: (handle: RaycastHandle) => void;
  isDragging: boolean;
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
    <mesh position={[position[0], 0.01, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.9, radius * 1.1, 32]} />
      <meshBasicMaterial color="#4a9eff" transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface PlacedFoodMeshProps {
  food: PlacedFood;
  isSelected: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, food: PlacedFood, part: 'top' | 'body' | 'foot') => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  pendingUpdatesRef: React.RefObject<Map<string, Partial<PlacedFood>>>;
}

function PlacedFoodMesh({ food, isSelected, onPointerDown, onClick, pendingUpdatesRef }: PlacedFoodMeshProps) {
  const bodyRef = useRef<THREE.Mesh>(null);
  const baseRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const aoBlobRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const pendingUpdate = pendingUpdatesRef.current?.get(food.instanceId);
    if (!pendingUpdate) return;

    if (pendingUpdate.position && groupRef.current) {
      groupRef.current.position.set(
        pendingUpdate.position[0],
        0.05,
        pendingUpdate.position[2]
      );
    }

    if (pendingUpdate.config && food.foodType === 'nasi') {
      const newConfig = { ...food.config, ...pendingUpdate.config };
      if (bodyRef.current) {
        bodyRef.current.scale.set(newConfig.radiusX, newConfig.height, newConfig.radiusZ);
      }
      if (baseRef.current) {
        baseRef.current.scale.set(newConfig.radiusX, newConfig.radiusZ, 1);
      }
      // Update AO blob to scale with mound
      if (aoBlobRef.current) {
        const maxRad = Math.max(newConfig.radiusX, newConfig.radiusZ);
        aoBlobRef.current.scale.set(maxRad * 1.2, maxRad * 1.2, 1);
      }
    }
  });
  if (food.foodType === 'nasi' && food.config) {
    const config = food.config;
    const pos = food.position;
    const maxRadius = Math.max(config.radiusX, config.radiusZ);
    
    return (
      <group>
        {isSelected && <SelectionRing position={pos} radius={maxRadius * 1.2} />}
        
        <group ref={groupRef} position={[pos[0], 0.05, pos[2]]}>
          {/* Soft AO blob under rim */}
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
          
          {isSelected && (
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
  
  const laukRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const pendingUpdate = pendingUpdatesRef.current?.get(food.instanceId);
    if (pendingUpdate?.position && laukRef.current) {
      laukRef.current.position.set(
        pendingUpdate.position[0],
        pendingUpdate.position[1],
        pendingUpdate.position[2]
      );
    }
  });

  const pos = food.position;

  const geometry = food.foodType === 'ayam' 
    ? <boxGeometry args={[0.6, 0.3, 0.5]} />
    : <sphereGeometry args={[0.3, 16, 16]} />;
  
  const color = food.foodType === 'ayam' ? '#d4a574' : '#f4e4c1';
  const selectedColor = food.foodType === 'ayam' ? '#e4b584' : '#ffe4d1';
  
  return (
    <group>
      {isSelected && <SelectionRing position={pos} radius={0.5} />}
      <mesh 
        ref={laukRef}
        castShadow 
        position={pos}
        name={`lauk-${food.instanceId}`}
        onPointerDown={(e) => onPointerDown(e, food, 'body')}
        onClick={(e) => onClick(e)}
      >
        {geometry}
        <meshStandardMaterial color={isSelected ? selectedColor : color} roughness={0.7} metalness={0.1} />
      </mesh>
    </group>
  );
}

interface ManipState {
  food: PlacedFood;
  part: 'top' | 'body' | 'foot';
  startScreenPos: { x: number; y: number };
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
  onRaycastReady,
  isDragging
}: SceneProps) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const orbitRef = useRef<any>(null);
  const [manipulating, setManipulating] = useState(false);
  const manipStateRef = useRef<ManipState | null>(null);
  const pendingUpdatesRef = useRef<Map<string, Partial<PlacedFood>>>(new Map());
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
  // free of setState storms. Only body-drags that actually moved can delete,
  // so taps/selects and nasi sculpt handles (top/foot) never remove.
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
      orbitRef.current.enabled = !isDragging;
    }
  }, [isDragging, setTrashHighlight]);

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
      // body-drags, never nasi sculpt handles.
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
              if (distance <= plateRadius) {
                pendingUpdatesRef.current.set(food.instanceId, { 
                  position: [hitPos.x, startFoodPos[1], hitPos.z] 
                });
              } else {
                const scale = plateRadius / distance;
                pendingUpdatesRef.current.set(food.instanceId, { 
                  position: [hitPos.x * scale, startFoodPos[1], hitPos.z * scale] 
                });
              }
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
            if (distance <= plateRadius) {
              pendingUpdatesRef.current.set(food.instanceId, { 
                position: [hitPos.x, startFoodPos[1], hitPos.z] 
              });
            } else {
              const scale = plateRadius / distance;
              pendingUpdatesRef.current.set(food.instanceId, { 
                position: [hitPos.x * scale, startFoodPos[1], hitPos.z * scale] 
              });
            }
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
        const removedId = manipState.food.instanceId;
        endPlacedDrag();
        onFoodRemoveRef.current(removedId);
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
  }, [manipulating, plateScale, raycastPlate, isDragging, isOverTrash, setTrashHighlight, endPlacedDrag]);

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
    onPlacedDragStateChangeRef.current?.(true, food.instanceId);
    manipStateRef.current = {
      food,
      part,
      startScreenPos: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      startConfig: food.config ? { ...food.config } : undefined,
      startFoodPos: [...food.position],
      startMoundCenter: food.position ? { x: food.position[0], z: food.position[2] } : undefined,
      moved: false
    };
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
        enabled={!manipulating && !isDragging}
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
      
      {placedFoods.map(food => (
        <PlacedFoodMesh
          key={food.instanceId}
          food={food}
          isSelected={selectedFoodId === food.instanceId}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          pendingUpdatesRef={pendingUpdatesRef}
        />
      ))}
    </>
  );
}

function RaycastHandler({ 
  plateScale, 
  dragScreenPosRef
}: { 
  plateScale: number;
  dragScreenPosRef: React.RefObject<{ x: number; y: number } | null>;
}) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const hitPointRef = useRef<THREE.Vector3 | null>(null);

  useFrame(() => {
    const dragScreenPos = dragScreenPosRef.current;
    if (!dragScreenPos) {
      hitPointRef.current = null;
      return;
    }

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    
    const mouse = new THREE.Vector2(
      ((dragScreenPos.x - rect.left) / rect.width) * 2 - 1,
      -((dragScreenPos.y - rect.top) / rect.height) * 2 + 1
    );

    raycaster.current.setFromCamera(mouse, camera);
    
    const plateMesh = scene.getObjectByName('plate');
    if (!plateMesh) {
      hitPointRef.current = null;
      return;
    }

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
      
      hitPointRef.current = point;
    } else {
      hitPointRef.current = null;
    }
  });

  return hitPointRef.current ? (
    <mesh position={[hitPointRef.current.x, 0.02, hitPointRef.current.z]}>
      <ringGeometry args={[0.3, 0.4, 32]} />
      <meshBasicMaterial color="#4a9eff" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  ) : null;
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
  isDragging,
  dragScreenPosRef
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
          onRaycastReady={handleRaycastReady}
          isDragging={isDragging}
        />
        
        {isDragging && <RaycastHandler
          plateScale={plateScale}
          dragScreenPosRef={dragScreenPosRef}
        />}
        
        {!isMobile && <Environment preset="apartment" frames={1} />}
      </Canvas>
      <div className="canvas-hint">
        {isDragging
          ? '🎯 Lepaskan di atas piring untuk menempatkan'
          : selectedFoodId
          ? '✋ Tarik untuk ubah • Buang di dock bawah • Klik di luar untuk batal'
          : '🖱️ Klik makanan untuk pilih • Tarik untuk memutar'
        }
      </div>
    </>
  );
});

Plate3D.displayName = 'Plate3D';

export default Plate3D;
