import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedFood, RiceMoundConfig } from '../types';

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
  isDragging: boolean;
  dragScreenPos: { x: number; y: number } | null;
}

interface SceneProps {
  plateScale: number;
  placedFoods: PlacedFood[];
  selectedFoodId: string | null;
  onSelectFood: (id: string | null) => void;
  onFoodUpdate: (instanceId: string, updates: Partial<PlacedFood>) => void;
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
}

function PlacedFoodMesh({ food, isSelected, onPointerDown, onClick }: PlacedFoodMeshProps) {
  if (food.foodType === 'nasi' && food.config) {
    const config = food.config;
    const pos = food.position;
    const maxRadius = Math.max(config.radiusX, config.radiusZ);
    
    return (
      <group>
        {isSelected && <SelectionRing position={pos} radius={maxRadius * 1.2} />}
        
        <group position={[pos[0], 0.05, pos[2]]}>
          <mesh 
            castShadow 
            position={[0, 0, 0]}
            scale={[config.radiusX, config.height, config.radiusZ]}
            name={`nasi-body-${food.instanceId}`}
            onPointerDown={(e) => onPointerDown(e, food, 'body')}
            onClick={(e) => onClick(e)}
          >
            <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial 
              color={isSelected ? "#fffef8" : "#f8f8f0"}
              roughness={0.9} 
              metalness={0.0}
            />
          </mesh>
          
          <mesh 
            castShadow 
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[config.radiusX, config.radiusZ, 1]}
            name={`nasi-base-${food.instanceId}`}
            onPointerDown={(e) => onPointerDown(e, food, 'foot')}
            onClick={(e) => onClick(e)}
          >
            <circleGeometry args={[1, 32]} />
            <meshStandardMaterial 
              color={isSelected ? "#fffef8" : "#f8f8f0"}
              roughness={0.9} 
              metalness={0.0}
            />
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
  
  const geometry = food.foodType === 'ayam' 
    ? <boxGeometry args={[0.6, 0.3, 0.5]} />
    : <sphereGeometry args={[0.3, 16, 16]} />;
  
  const color = food.foodType === 'ayam' ? '#d4a574' : '#f4e4c1';
  const selectedColor = food.foodType === 'ayam' ? '#e4b584' : '#ffe4d1';
  
  return (
    <group>
      {isSelected && <SelectionRing position={food.position} radius={0.5} />}
      <mesh 
        castShadow 
        position={food.position}
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
  onRaycastReady,
  isDragging 
}: SceneProps) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const orbitRef = useRef<any>(null);
  const [manipulating, setManipulating] = useState(false);
  const [manipState, setManipState] = useState<ManipState | null>(null);

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
    if (!manipulating || !manipState) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      const currentScreenPos = { x: e.clientX, y: e.clientY };
      const screenDelta = {
        x: currentScreenPos.x - manipState.startScreenPos.x,
        y: currentScreenPos.y - manipState.startScreenPos.y
      };
      
      const moveThreshold = 5;
      const hasMoved = Math.abs(screenDelta.x) > moveThreshold || Math.abs(screenDelta.y) > moveThreshold;
      
      if (!hasMoved && !manipState.moved) return;
      
      if (!manipState.moved) {
        setManipState({ ...manipState, moved: true });
      }
      
      const { food, part, startConfig, startFoodPos, startMoundCenter } = manipState;
      
      if (food.foodType === 'nasi' && food.config && startConfig && startFoodPos) {
        if (part === 'top') {
          const heightSensitivity = 0.01;
          const deltaHeight = -screenDelta.y * heightSensitivity;
          const newHeight = Math.max(0.2, Math.min(2.0, startConfig.height + deltaHeight));
          onFoodUpdate(food.instanceId, { config: { ...food.config, height: newHeight } });
        } else if (part === 'body') {
          const hitPos = raycastPlate(currentScreenPos);
          if (hitPos) {
            const plateRadius = 2 * plateScale * 0.9;
            const distance = Math.sqrt(hitPos.x * hitPos.x + hitPos.z * hitPos.z);
            
            if (distance <= plateRadius) {
              onFoodUpdate(food.instanceId, { position: [hitPos.x, startFoodPos[1], hitPos.z] });
            } else {
              const scale = plateRadius / distance;
              onFoodUpdate(food.instanceId, { position: [hitPos.x * scale, startFoodPos[1], hitPos.z * scale] });
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
            onFoodUpdate(food.instanceId, { config: { ...food.config, radiusX: newRadiusX, radiusZ: newRadiusZ } });
          }
        }
      } else if (food.foodType !== 'nasi' && startFoodPos) {
        const hitPos = raycastPlate(currentScreenPos);
        if (hitPos) {
          const plateRadius = 2 * plateScale * 0.9;
          const distance = Math.sqrt(hitPos.x * hitPos.x + hitPos.z * hitPos.z);
          
          if (distance <= plateRadius) {
            onFoodUpdate(food.instanceId, { position: [hitPos.x, startFoodPos[1], hitPos.z] });
          } else {
            const scale = plateRadius / distance;
            onFoodUpdate(food.instanceId, { position: [hitPos.x * scale, startFoodPos[1], hitPos.z * scale] });
          }
        }
      }
    };

    const handleGlobalPointerUp = () => {
      setManipulating(false);
      setManipState(null);
      
      if (orbitRef.current) {
        orbitRef.current.enabled = true;
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [manipulating, manipState, onFoodUpdate, plateScale, raycastPlate, orbitRef]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>, food: PlacedFood, part: 'top' | 'body' | 'foot') => {
    e.stopPropagation();
    
    if (orbitRef.current) {
      orbitRef.current.enabled = false;
    }
    
    onSelectFood(food.instanceId);
    setManipulating(true);
    setManipState({
      food,
      part,
      startScreenPos: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
      startConfig: food.config ? { ...food.config } : undefined,
      startFoodPos: [...food.position],
      startMoundCenter: food.position ? { x: food.position[0], z: food.position[2] } : undefined,
      moved: false
    });
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
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
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
        />
      ))}
    </>
  );
}

function RaycastHandler({ 
  plateScale, 
  dragScreenPos
}: { 
  plateScale: number;
  dragScreenPos: { x: number; y: number } | null;
}) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const [hitPoint, setHitPoint] = useState<THREE.Vector3 | null>(null);

  const performRaycast = useCallback(() => {
    if (!dragScreenPos) {
      setHitPoint(null);
      return null;
    }

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    
    const mouse = new THREE.Vector2(
      ((dragScreenPos.x - rect.left) / rect.width) * 2 - 1,
      -((dragScreenPos.y - rect.top) / rect.height) * 2 + 1
    );

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
      
      setHitPoint(point);
      return point;
    }
    
    setHitPoint(null);
    return null;
  }, [dragScreenPos, camera, gl, scene, plateScale]);

  if (dragScreenPos) {
    performRaycast();
  }

  return hitPoint ? (
    <mesh position={[hitPoint.x, 0.02, hitPoint.z]}>
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
  isDragging,
  dragScreenPos
}, ref) => {
  const bgColor = theme === 'dark' ? '#0a0e1a' : '#f8f9fa';
  const raycastHandleRef = useRef<RaycastHandle | null>(null);
  
  useImperativeHandle(ref, () => ({
    raycastPlate: (screenPos) => raycastHandleRef.current?.raycastPlate(screenPos) || null,
    raycastFood: (screenPos) => raycastHandleRef.current?.raycastFood(screenPos) || null,
  }));
  
  const handleRaycastReady = useCallback((handle: RaycastHandle) => {
    raycastHandleRef.current = handle;
  }, []);
  
  return (
    <>
      <Canvas
        shadows
        camera={{ position: [4, 4, 6], fov: 50 }}
        style={{ background: bgColor }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <spotLight
          position={[-5, 5, 5]}
          intensity={0.3}
          angle={0.6}
          penumbra={1}
        />
        
        <SceneContent
          plateScale={plateScale}
          placedFoods={placedFoods}
          selectedFoodId={selectedFoodId}
          onSelectFood={onSelectFood}
          onFoodUpdate={onFoodUpdate}
          onRaycastReady={handleRaycastReady}
          isDragging={isDragging}
        />
        
        <RaycastHandler
          plateScale={plateScale}
          dragScreenPos={dragScreenPos}
        />
        
        <Environment preset="apartment" />
      </Canvas>
      <div className="canvas-hint">
        {isDragging 
          ? '🎯 Lepaskan di atas piring untuk menempatkan' 
          : selectedFoodId 
          ? '✋ Tarik untuk ubah • Klik di luar untuk batal' 
          : '🖱️ Klik makanan untuk pilih • Tarik untuk memutar'
        }
      </div>
    </>
  );
});

Plate3D.displayName = 'Plate3D';

export default Plate3D;
