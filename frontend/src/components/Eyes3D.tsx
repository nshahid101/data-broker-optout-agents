import { useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

/** One lens-shaped eye: an extruded, beveled glossy almond with a pupil
 * that drifts toward the pointer and a blink driven by scaling the whole
 * group on Y — stylized, not anatomical, but genuinely 3D (real geometry,
 * lighting, and reflections instead of a flat SVG). */
function useEyeGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1, 0);
    shape.quadraticCurveTo(0, 0.56, 1, -0.03);
    shape.quadraticCurveTo(0, -0.22, -1, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.035,
      bevelSegments: 4,
      curveSegments: 24,
    });
    geometry.center();
    return geometry;
  }, []);
}

function Eye({ position, pointer }: { position: [number, number, number]; pointer: React.RefObject<THREE.Vector2> }) {
  const geometry = useEyeGeometry();
  const group = useRef<THREE.Group>(null);
  const pupil = useRef<THREE.Mesh>(null);
  const nextBlinkAt = useRef(2 + Math.random() * 2);
  const blinkProgress = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Idle blink loop, independent of the Welcome/tagline text timeline.
    if (t > nextBlinkAt.current && blinkProgress.current === 0) {
      blinkProgress.current = 0.0001;
    }
    if (blinkProgress.current > 0) {
      blinkProgress.current += delta * 6;
      const p = blinkProgress.current;
      const closeAmount = p < 1 ? p : p < 2 ? 2 - p : 0;
      if (group.current) group.current.scale.y = 1 - closeAmount * 0.92;
      if (p >= 2) {
        blinkProgress.current = 0;
        nextBlinkAt.current = t + 3 + Math.random() * 3;
      }
    }

    // Pupil drifts toward the pointer, clamped inside the lens.
    if (pupil.current && pointer.current) {
      const targetX = THREE.MathUtils.clamp(pointer.current.x * 0.35, -0.38, 0.38);
      const targetY = THREE.MathUtils.clamp(pointer.current.y * 0.12, -0.08, 0.14);
      pupil.current.position.x = THREE.MathUtils.lerp(pupil.current.position.x, targetX, 0.08);
      pupil.current.position.y = THREE.MathUtils.lerp(pupil.current.position.y, targetY, 0.08);
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#ededee"
          metalness={0.1}
          roughness={0.15}
          clearcoat={1}
          clearcoatRoughness={0.12}
        />
      </mesh>
      <mesh ref={pupil} position={[0, 0.05, 0.13]}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshPhysicalMaterial color="#0b0b0c" metalness={0.3} roughness={0.2} clearcoat={1} />
      </mesh>
    </group>
  );
}

function Spark() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.8;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.6) * 0.3;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.1]}>
      <octahedronGeometry args={[0.22, 0]} />
      <meshStandardMaterial color="#8fe3b0" emissive="#5fae82" emissiveIntensity={0.6} roughness={0.3} />
    </mesh>
  );
}

function Scene() {
  const pointer = useRef(new THREE.Vector2(0, 0));
  const rig = useRef<THREE.Group>(null);

  useFrame((state) => {
    pointer.current.set(state.pointer.x, state.pointer.y);
    if (rig.current) {
      // Subtle whole-scene parallax toward the cursor.
      rig.current.rotation.y = THREE.MathUtils.lerp(rig.current.rotation.y, state.pointer.x * 0.15, 0.05);
      rig.current.rotation.x = THREE.MathUtils.lerp(rig.current.rotation.x, -state.pointer.y * 0.1, 0.05);
    }
  });

  return (
    <group ref={rig}>
      <Eye position={[-1.15, 0, 0]} pointer={pointer} />
      <Eye position={[1.15, 0, 0]} pointer={pointer} />
      <Spark />
    </group>
  );
}

const lightProps: ThreeElements["directionalLight"] = { castShadow: true };

export function Eyes3D() {
  return (
    <Canvas
      className="eyes-3d__canvas"
      camera={{ position: [0, 0, 4.2], fov: 35 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.5, 3, 3]} intensity={1.3} {...lightProps} />
      <directionalLight position={[-3, -1, 2]} intensity={0.35} color="#8fe3b0" />
      <pointLight position={[0, 1.5, 2]} intensity={0.4} color="#e3b44f" />
      <Scene />
    </Canvas>
  );
}
