"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MAP_STRUCTURE, type Island } from "../data/islands";

type OnePieceMapProps = {
  islands: Island[];
  selectedIslandId: string | null;
  onSelectIsland: (islandId: string) => void;
  focusCoordinates: { lat: number; lon: number } | null;
};

type PlanetTextures = {
  oceanColorMap: THREE.CanvasTexture;
  oceanNormalMap: THREE.CanvasTexture;
  redLineColorMap: THREE.CanvasTexture;
  redLineDisplacementMap: THREE.CanvasTexture;
  redLineAlphaMap: THREE.CanvasTexture;
};

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);

  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function smoothBand(distance: number, halfWidth: number, softness: number): number {
  const inner = Math.max(0, halfWidth - softness);
  const t = THREE.MathUtils.smoothstep(distance, inner, halfWidth);
  return 1 - t;
}

function fractalNoise2D(x: number, y: number, octaves = 4): number {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let max = 0;

  for (let i = 0; i < octaves; i += 1) {
    const n = Math.sin((x * frequency + 17.13) * 2.37 + Math.cos((y * frequency + 9.41) * 3.11));
    total += ((n + 1) * 0.5) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / max;
}

function createPlanetTextures(size = 1024): PlanetTextures {
  const makeCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  };

  const oceanColorCanvas = makeCanvas();
  const oceanNormalCanvas = makeCanvas();
  const redLineColorCanvas = makeCanvas();
  const redLineDisplacementCanvas = makeCanvas();
  const redLineAlphaCanvas = makeCanvas();

  const oceanColorCtx = oceanColorCanvas.getContext("2d");
  const oceanNormalCtx = oceanNormalCanvas.getContext("2d");
  const redLineColorCtx = redLineColorCanvas.getContext("2d");
  const redLineDispCtx = redLineDisplacementCanvas.getContext("2d");
  const redLineAlphaCtx = redLineAlphaCanvas.getContext("2d");

  if (!oceanColorCtx || !oceanNormalCtx || !redLineColorCtx || !redLineDispCtx || !redLineAlphaCtx) {
    throw new Error("Failed to create canvas context for planet textures.");
  }

  const oceanColorImage = oceanColorCtx.createImageData(size, size);
  const oceanNormalImage = oceanNormalCtx.createImageData(size, size);
  const redLineColorImage = redLineColorCtx.createImageData(size, size);
  const redLineDispImage = redLineDispCtx.createImageData(size, size);
  const redLineAlphaImage = redLineAlphaCtx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1);
    const latDeg = 90 - v * 180;
    const latFade = 1 - Math.abs(v * 2 - 1);

    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const u = x / (size - 1);
      const lon = (u - 0.5) * Math.PI * 2;

      const seamDistance = Math.min(Math.abs(u - 0.5), Math.abs(u), Math.abs(u - 1));
      const ridgeMask = Math.max(0, 1 - seamDistance / 0.05);

      const largeNoise = fractalNoise2D(u * 8, v * 12, 5);
      const detailNoise = fractalNoise2D(u * 48, v * 48, 3);
      const rockyVariation = 0.55 * largeNoise + 0.45 * detailNoise;
      const oceanNoise = fractalNoise2D(u * 9, v * 7, 4);

      const inNorth = latDeg > 0;
      const inEast = Math.sin(lon) > 0;

      const northBlue = new THREE.Color("#25a9e0");
      const eastBlue = new THREE.Color("#1e91cd");
      const westBlue = new THREE.Color("#1279af");
      const southBlue = new THREE.Color("#0f5e8f");

      const baseOcean = inNorth ? (inEast ? eastBlue : northBlue) : inEast ? southBlue : westBlue;

      // Official structure approximation: Grand Line belt around equator + two Calm Belts.
      const grandLineMask = smoothBand(
        Math.abs(latDeg - MAP_STRUCTURE.grandLine.centerLat),
        MAP_STRUCTURE.grandLine.halfWidth,
        MAP_STRUCTURE.grandLine.softness,
      );
      const calmNorthMask = smoothBand(
        Math.abs(latDeg - MAP_STRUCTURE.calmBelts.northCenterLat),
        MAP_STRUCTURE.calmBelts.halfWidth,
        MAP_STRUCTURE.calmBelts.softness,
      );
      const calmSouthMask = smoothBand(
        Math.abs(latDeg - MAP_STRUCTURE.calmBelts.southCenterLat),
        MAP_STRUCTURE.calmBelts.halfWidth,
        MAP_STRUCTURE.calmBelts.softness,
      );
      const calmMask = Math.max(calmNorthMask, calmSouthMask);

      const oceanColor = baseOcean.clone();
      oceanColor.multiplyScalar(0.88 + oceanNoise * 0.24);

      if (calmMask > 0) {
        oceanColor.lerp(new THREE.Color("#e7f2f6"), calmMask * 0.62);
      }
      if (grandLineMask > 0) {
        oceanColor.lerp(new THREE.Color("#2f4b6a"), grandLineMask * 0.9);
      }

      oceanColorImage.data[i] = Math.floor(THREE.MathUtils.clamp(oceanColor.r * 255, 0, 255));
      oceanColorImage.data[i + 1] = Math.floor(THREE.MathUtils.clamp(oceanColor.g * 255, 0, 255));
      oceanColorImage.data[i + 2] = Math.floor(THREE.MathUtils.clamp(oceanColor.b * 255, 0, 255));
      oceanColorImage.data[i + 3] = 255;

      const mountainHeight = Math.pow(ridgeMask, 1.8) * (0.65 + rockyVariation * 0.75) * (0.5 + latFade * 0.5);
      const dispGray = Math.min(255, Math.floor(mountainHeight * 255));

      redLineDispImage.data[i] = dispGray;
      redLineDispImage.data[i + 1] = dispGray;
      redLineDispImage.data[i + 2] = dispGray;
      redLineDispImage.data[i + 3] = 255;

      const alpha = Math.floor((0.25 + Math.min(1, Math.pow(ridgeMask, 1.1) * 1.25) * 0.75) * 255);
      redLineAlphaImage.data[i] = alpha;
      redLineAlphaImage.data[i + 1] = alpha;
      redLineAlphaImage.data[i + 2] = alpha;
      redLineAlphaImage.data[i + 3] = 255;

      const rockBase = 90 + Math.floor(70 * rockyVariation);
      redLineColorImage.data[i] = Math.min(255, rockBase + 40);
      redLineColorImage.data[i + 1] = Math.min(255, 30 + Math.floor(45 * rockyVariation));
      redLineColorImage.data[i + 2] = Math.min(255, 20 + Math.floor(30 * rockyVariation));
      redLineColorImage.data[i + 3] = alpha;

      const waveNoise = fractalNoise2D(u * 30, v * 30, 4);
      const nx = 128 + Math.floor((waveNoise - 0.5) * 36);
      const ny = 128 + Math.floor((latFade - 0.5) * 14);
      oceanNormalImage.data[i] = THREE.MathUtils.clamp(nx, 0, 255);
      oceanNormalImage.data[i + 1] = THREE.MathUtils.clamp(ny, 0, 255);
      oceanNormalImage.data[i + 2] = 255;
      oceanNormalImage.data[i + 3] = 255;
    }
  }

  oceanColorCtx.putImageData(oceanColorImage, 0, 0);
  oceanNormalCtx.putImageData(oceanNormalImage, 0, 0);
  redLineColorCtx.putImageData(redLineColorImage, 0, 0);
  redLineDispCtx.putImageData(redLineDispImage, 0, 0);
  redLineAlphaCtx.putImageData(redLineAlphaImage, 0, 0);

  const oceanColorMap = new THREE.CanvasTexture(oceanColorCanvas);
  const oceanNormalMap = new THREE.CanvasTexture(oceanNormalCanvas);
  const redLineColorMap = new THREE.CanvasTexture(redLineColorCanvas);
  const redLineDisplacementMap = new THREE.CanvasTexture(redLineDisplacementCanvas);
  const redLineAlphaMap = new THREE.CanvasTexture(redLineAlphaCanvas);

  oceanColorMap.wrapS = THREE.RepeatWrapping;
  oceanColorMap.wrapT = THREE.ClampToEdgeWrapping;
  oceanNormalMap.wrapS = THREE.RepeatWrapping;
  oceanNormalMap.wrapT = THREE.RepeatWrapping;
  oceanColorMap.repeat.set(1, 1);
  oceanNormalMap.repeat.set(4, 2);

  oceanColorMap.colorSpace = THREE.SRGBColorSpace;
  redLineColorMap.colorSpace = THREE.SRGBColorSpace;
  oceanNormalMap.colorSpace = THREE.NoColorSpace;
  redLineDisplacementMap.colorSpace = THREE.NoColorSpace;
  redLineAlphaMap.colorSpace = THREE.NoColorSpace;

  [oceanColorMap, oceanNormalMap, redLineColorMap, redLineDisplacementMap, redLineAlphaMap].forEach((texture) => {
    texture.needsUpdate = true;
  });

  return {
    oceanColorMap,
    oceanNormalMap,
    redLineColorMap,
    redLineDisplacementMap,
    redLineAlphaMap,
  };
}

function Planet() {
  const textures = useMemo(() => createPlanetTextures(1024), []);

  return (
    <group>
      {/* Ocean sphere: smooth, reflective, with subtle wave normals. */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[1, 256, 256]} />
        <meshStandardMaterial
          map={textures.oceanColorMap}
          roughness={0.24}
          metalness={0.28}
          normalMap={textures.oceanNormalMap}
          normalScale={new THREE.Vector2(0.45, 0.45)}
          envMapIntensity={0.6}
        />
      </mesh>

      {/*
        Displacement map principle:
        the grayscale texture changes vertex height on the GPU (black = low, white = high),
        so the Red Line is physically sculpted into rocky mountains instead of a flat painted band.
      */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[1.006, 256, 256]} />
        <meshStandardMaterial
          map={textures.redLineColorMap}
          alphaMap={textures.redLineAlphaMap}
          displacementMap={textures.redLineDisplacementMap}
          displacementScale={0.12}
          displacementBias={-0.01}
          roughness={0.88}
          metalness={0.08}
          opacity={0.95}
          transparent
          depthWrite
        />
      </mesh>

      {/* Grand Line + Calm Belts are painted on the globe texture so they follow the sphere perfectly. */}
    </group>
  );
}

function IslandMarkers({ islands, selectedIslandId, onSelectIsland }: Pick<OnePieceMapProps, "islands" | "selectedIslandId" | "onSelectIsland">) {
  return (
    <group>
      {islands.map((island) => {
        const isSelected = island.id === selectedIslandId;
        const markerPosition = latLonToVector3(island.coordinates.lat, island.coordinates.lon, 1.03);

        return (
          <mesh
            key={island.id}
            position={markerPosition}
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onSelectIsland(island.id);
            }}
          >
            <sphereGeometry args={[isSelected ? 0.026 : 0.02, 16, 16]} />
            <meshStandardMaterial
              color={isSelected ? "#f59e0b" : "#7c4a1d"}
              roughness={0.9}
              metalness={0.05}
              emissive={isSelected ? new THREE.Color("#f97316") : new THREE.Color("#000000")}
              emissiveIntensity={isSelected ? 0.45 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function CameraFocus({ focusCoordinates }: Pick<OnePieceMapProps, "focusCoordinates">) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls as OrbitControlsImpl | undefined);
  const targetPositionRef = useRef<THREE.Vector3 | null>(null);
  const cameraPositionRef = useRef<THREE.Vector3 | null>(null);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    if (!focusCoordinates || !controls) {
      return;
    }

    const surfacePoint = latLonToVector3(focusCoordinates.lat, focusCoordinates.lon, 1.03);
    targetPositionRef.current = surfacePoint.clone().multiplyScalar(0.42);
    cameraPositionRef.current = surfacePoint.clone().multiplyScalar(2.38);
    isAnimatingRef.current = true;
  }, [controls, focusCoordinates]);

  useFrame(() => {
    if (!controls || !isAnimatingRef.current || !targetPositionRef.current || !cameraPositionRef.current) {
      return;
    }

    controls.target.lerp(targetPositionRef.current, 0.08);
    camera.position.lerp(cameraPositionRef.current, 0.08);
    controls.update();

    const targetDistance = controls.target.distanceTo(targetPositionRef.current);
    const cameraDistance = camera.position.distanceTo(cameraPositionRef.current);
    if (targetDistance < 0.005 && cameraDistance < 0.015) {
      isAnimatingRef.current = false;
    }
  });

  return null;
}

export default function OnePieceMap({ islands, selectedIslandId, onSelectIsland, focusCoordinates }: OnePieceMapProps) {
  return (
    <div className="h-screen w-full">
      <Canvas
        camera={{ position: [0, 0.4, 2.8], fov: 45, near: 0.1, far: 100 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#08131f"]} />

        <ambientLight intensity={0.35} />

        <directionalLight
          position={[4, 3.5, 2.5]}
          intensity={1.7}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={15}
          shadow-bias={-0.0001}
        />

        <Planet />
        <IslandMarkers islands={islands} selectedIslandId={selectedIslandId} onSelectIsland={onSelectIsland} />
        <CameraFocus focusCoordinates={focusCoordinates} />

        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={1.45} maxDistance={6} autoRotate={false} autoRotateSpeed={0.15} />
      </Canvas>
    </div>
  );
}
