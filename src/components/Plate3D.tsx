import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { RiceMoundConfig, FoodItem } from '../types';

interface Plate3DProps {
  plateScale: number;
  riceMound: RiceMoundConfig;
  onRiceMoundChange: (config: RiceMoundConfig) => void;
  foods: FoodItem[];
  theme: 'light' | 'dark';
}

function Plate({ scale }: { scale: number }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]}>
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

function RiceMound({ config }: { config: RiceMoundConfig }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  return (
    <mesh ref={meshRef} castShadow position={[0, config.height / 2, 0]}>
      <sphereGeometry args={[1, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial 
        color="#f8f8f0" 
        roughness={0.9} 
        metalness={0.0}
      />
      <group scale={[config.radiusX, config.height, config.radiusZ]} />
    </mesh>
  );
}

function FoodItemMesh({ food }: { food: FoodItem }) {
  if (!food.enabled) return null;
  
  const geometry = food.id === 'ayam' 
    ? <boxGeometry args={[0.6, 0.3, 0.5]} />
    : <sphereGeometry args={[0.3, 16, 16]} />;
  
  return (
    <mesh castShadow position={food.position}>
      {geometry}
      <meshStandardMaterial color={food.color} roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

export default function Plate3D({ plateScale, riceMound, foods, theme }: Plate3DProps) {
  const bgColor = theme === 'dark' ? '#0a0e1a' : '#f8f9fa';
  
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
        <RiceMound config={riceMound} />
        
        {foods.map(food => (
          <FoodItemMesh key={food.id} food={food} />
        ))}
        
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
          <planeGeometry args={[20, 20]} />
          <shadowMaterial opacity={0.3} />
        </mesh>
        
        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2}
          enableDamping
          dampingFactor={0.05}
        />
        
        <Environment preset="apartment" />
      </Canvas>
      <div className="canvas-hint">
        🖱️ Klik dan tarik untuk memutar • Scroll untuk zoom
      </div>
    </>
  );
}
