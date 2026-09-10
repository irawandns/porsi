import { useRef, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedFood } from '../types';

interface Plate3DProps {
  plateScale: number;
  theme: 'light' | 'dark';
  placedFoods: PlacedFood[];
  onFoodPlaced: (food: PlacedFood) => void;
  isDragging: boolean;
  dragType: string | null;
  dragScreenPos: { x: number; y: number } | null;
}

function Plate({ scale }: { scale: number }) {
  const plateRef = useRef<THREE.Group>(null);
  
  return (
    <group ref={plateRef} name="plate-group">
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


function PlacedFoodMesh({ food }: { food: PlacedFood }) {
  if (food.foodType === 'nasi' && food.config) {
    return (
      <group position={[food.position[0], 0.05, food.position[2]]}>
        <mesh 
          castShadow 
          position={[0, 0, 0]}
          scale={[food.config.radiusX, food.config.height, food.config.radiusZ]}
        >
          <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial 
            color="#f8f8f0" 
            roughness={0.9} 
            metalness={0.0}
          />
        </mesh>
        
        <mesh 
          castShadow 
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[food.config.radiusX, food.config.radiusZ, 1]}
        >
          <circleGeometry args={[1, 32]} />
          <meshStandardMaterial 
            color="#f8f8f0" 
            roughness={0.9} 
            metalness={0.0}
          />
        </mesh>
      </group>
    );
  }
  
  const geometry = food.foodType === 'ayam' 
    ? <boxGeometry args={[0.6, 0.3, 0.5]} />
    : <sphereGeometry args={[0.3, 16, 16]} />;
  
  const color = food.foodType === 'ayam' ? '#d4a574' : '#f4e4c1';
  
  return (
    <mesh castShadow position={food.position}>
      {geometry}
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

function RaycastHandler({ 
  plateScale, 
  isDragging, 
  dragScreenPos, 
  dragType,
  onFoodPlaced 
}: { 
  plateScale: number;
  isDragging: boolean;
  dragScreenPos: { x: number; y: number } | null;
  dragType: string | null;
  onFoodPlaced: (food: PlacedFood) => void;
}) {
  const { camera, gl, size } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const [hitPoint, setHitPoint] = useState<THREE.Vector3 | null>(null);

  const performRaycast = useCallback(() => {
    if (!dragScreenPos) {
      setHitPoint(null);
      return null;
    }

    const mouse = new THREE.Vector2(
      (dragScreenPos.x / size.width) * 2 - 1,
      -(dragScreenPos.y / size.height) * 2 + 1
    );

    raycaster.current.setFromCamera(mouse, camera);
    
    const plateMesh = gl.domElement.closest('.canvas-container')?.querySelector('canvas');
    if (!plateMesh) return null;

    const scene = camera.parent;
    if (!scene) return null;

    const plateGroup = scene.getObjectByName('plate');
    if (!plateGroup) return null;

    const intersects = raycaster.current.intersectObject(plateGroup, false);
    
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
  }, [dragScreenPos, camera, gl, size, plateScale]);

  if (isDragging && dragScreenPos) {
    performRaycast();
  }

  if (!isDragging && hitPoint && dragType) {
    const point = hitPoint;
    const foodType = dragType as 'nasi' | 'ayam' | 'telur';
    
    if (foodType === 'nasi') {
      onFoodPlaced({
        instanceId: `${foodType}-${Date.now()}`,
        foodType,
        position: [point.x, 0, point.z],
        config: { radiusX: 1.2, radiusZ: 1.0, height: 0.5 }
      });
    } else {
      onFoodPlaced({
        instanceId: `${foodType}-${Date.now()}`,
        foodType,
        position: [point.x, 0.15, point.z]
      });
    }
    
    setHitPoint(null);
  }

  return hitPoint && isDragging ? (
    <mesh position={[hitPoint.x, 0.02, hitPoint.z]}>
      <ringGeometry args={[0.3, 0.4, 32]} />
      <meshBasicMaterial color="#4a9eff" transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  ) : null;
}

export default function Plate3D({ 
  plateScale, 
  theme, 
  placedFoods,
  onFoodPlaced,
  isDragging,
  dragType,
  dragScreenPos
}: Plate3DProps) {
  const bgColor = theme === 'dark' ? '#0a0e1a' : '#f8f9fa';
  const controlsRef = useRef<any>(null);
  
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
        
        <Plate scale={plateScale} />
        
        {placedFoods.map(food => (
          <PlacedFoodMesh key={food.instanceId} food={food} />
        ))}
        
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
        
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={5}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2}
          enableDamping
          dampingFactor={0.05}
          enabled={!isDragging}
        />
        
        <RaycastHandler
          plateScale={plateScale}
          isDragging={isDragging}
          dragScreenPos={dragScreenPos}
          dragType={dragType}
          onFoodPlaced={onFoodPlaced}
        />
        
        <Environment preset="apartment" />
      </Canvas>
      <div className="canvas-hint">
        {isDragging 
          ? '🎯 Lepaskan di atas piring untuk menempatkan' 
          : '🖱️ Klik dan tarik untuk memutar • Scroll untuk zoom'
        }
      </div>
    </>
  );
}
