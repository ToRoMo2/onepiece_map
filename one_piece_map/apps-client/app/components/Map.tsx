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
  onGlobeInteraction: () => void;
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

// ─── Globe label helpers (canvas-sprite, no font download needed) ─────────────

function makeLabelTexture(text: string, color: string, opacity: number): THREE.CanvasTexture {
  const cw = 512;
  const ch = 96;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context for label texture");
  ctx.clearRect(0, 0, cw, ch);

  const fs = 40;
  ctx.font = `700 ${fs}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Thick dark outline for readability against any background
  ctx.strokeStyle = "rgba(0,0,0,0.90)";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.strokeText(text, cw / 2, ch / 2);

  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillText(text, cw / 2, ch / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

type GlobeLabelProps = {
  lat: number;
  lon: number;
  text: string;
  /** World-unit height of the sprite; width = height × (512/96) */
  scale: number;
  color: string;
  opacity?: number;
};

function GlobeLabel({ lat, lon, text, scale, color, opacity = 1 }: GlobeLabelProps) {
  const position = useMemo(() => latLonToVector3(lat, lon, 1.05), [lat, lon]);
  const material = useMemo(() => {
    const tex = makeLabelTexture(text, color, opacity);
    return new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: true,   // occluded naturally by the opaque globe mesh
      depthWrite: false,
      sizeAttenuation: true,
    });
  }, [text, color, opacity]);

  const ASPECT = 512 / 96;
  return <sprite position={position} material={material} scale={[scale * ASPECT, scale, 1]} />;
}

// ─── World navigation labels ─────────────────────────────────────────────────

function WorldLabels() {
  return (
    <group>
      {/* ── Four Blue Seas ── */}
      <GlobeLabel lat={-48} lon={90}  text="EAST BLUE"  scale={0.22} color="#7dd3fc" />
      <GlobeLabel lat={-48} lon={-90} text="WEST BLUE"  scale={0.22} color="#93c5fd" />
      <GlobeLabel lat={48}  lon={-90} text="NORTH BLUE" scale={0.22} color="#60a5fa" />
      <GlobeLabel lat={48}  lon={90}  text="SOUTH BLUE" scale={0.22} color="#86efac" />

      {/* ── Grand Line zones ── */}
      <GlobeLabel lat={0} lon={135} text="PARADISE"  scale={0.20} color="#c084fc" />
      <GlobeLabel lat={0} lon={-25} text="NEW WORLD" scale={0.20} color="#f87171" />

      {/* ── Calm Belts – both hemispheres, both sides ── */}
      <GlobeLabel lat={20}  lon={90}  text="CALM BELT" scale={0.12} color="#bfdbfe" opacity={0.82} />
      <GlobeLabel lat={-20} lon={90}  text="CALM BELT" scale={0.12} color="#bfdbfe" opacity={0.82} />
      <GlobeLabel lat={20}  lon={-90} text="CALM BELT" scale={0.12} color="#bfdbfe" opacity={0.82} />
      <GlobeLabel lat={-20} lon={-90} text="CALM BELT" scale={0.12} color="#bfdbfe" opacity={0.82} />

      {/* ── Red Line – lon=0 and lon=±180 seam, north & south ── */}
      <GlobeLabel lat={38}  lon={0}   text="RED LINE" scale={0.12} color="#fca5a5" opacity={0.9} />
      <GlobeLabel lat={-38} lon={0}   text="RED LINE" scale={0.12} color="#fca5a5" opacity={0.9} />
      <GlobeLabel lat={38}  lon={180} text="RED LINE" scale={0.12} color="#fca5a5" opacity={0.9} />
      <GlobeLabel lat={-38} lon={180} text="RED LINE" scale={0.12} color="#fca5a5" opacity={0.9} />
    </group>
  );
}

// ─── Compass synchroniser (must live inside Canvas) ───────────────────────────

function CompassSync({ compassRef }: { compassRef: { current: HTMLDivElement | null } }) {
  const camera = useThree((state) => state.camera);
  const northPole = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!compassRef.current) return;
    scratch.copy(northPole).project(camera);
    // atan2(x, y) = angle from screen-up (+y) going clockwise → that's the needle rotation
    let angle = Math.atan2(scratch.x, scratch.y);
    // If the north pole is behind the camera (NDC z > 1) flip by 180°
    if (scratch.z > 1) angle += Math.PI;
    compassRef.current.style.transform = `rotate(${angle}rad)`;
  });

  return null;
}

// ─── Détection d'interaction avec les contrôles ─────────────────────────────

function OrbitControlsInteraction({ onInteraction }: { onInteraction: () => void }) {
  const controls = useThree((state) => state.controls as OrbitControlsImpl | undefined);

  useEffect(() => {
    if (!controls) return;

    const handleStart = () => {
      onInteraction();
    };

    controls.addEventListener('start', handleStart);

    return () => {
      controls.removeEventListener('start', handleStart);
    };
  }, [controls, onInteraction]);

  return null;
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

export default function OnePieceMap({ islands, selectedIslandId, onSelectIsland, onGlobeInteraction, focusCoordinates }: OnePieceMapProps) {
  const compassRoseRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-screen w-full">
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
        <WorldLabels />
        <IslandMarkers islands={islands} selectedIslandId={selectedIslandId} onSelectIsland={onSelectIsland} />
        <CameraFocus focusCoordinates={focusCoordinates} />
        <CompassSync compassRef={compassRoseRef} />
        <OrbitControlsInteraction onInteraction={onGlobeInteraction} />

        <OrbitControls 
          makeDefault 
          enablePan={true} 
          enableZoom={true}
          enableRotate={true}
          enableDamping 
          dampingFactor={0.08} 
          minDistance={1.45} 
          maxDistance={8} 
          autoRotate={false} 
          autoRotateSpeed={0.15} 
        />
      </Canvas>

      {/* ─── Compass overlay ──────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute bottom-6 right-6 z-10 select-none"
        aria-hidden="true"
      >
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-slate-900/70 shadow-xl shadow-slate-950/60 backdrop-blur-md">
          {/* This div is rotated every frame by CompassSync via direct DOM mutation */}
          <div ref={compassRoseRef} className="absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="-1 -1 2 2"
              width="64"
              height="64"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Decorative outer ring */}
              <circle cx="0" cy="0" r="0.90" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.04" />

              {/* 8 tick marks around the ring */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const cx = Math.sin(rad);
                const cy = -Math.cos(rad);
                const isCardinal = deg % 90 === 0;
                return (
                  <line
                    key={deg}
                    x1={cx * 0.78}
                    y1={cy * 0.78}
                    x2={cx * 0.90}
                    y2={cy * 0.90}
                    stroke={isCardinal ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.18)"}
                    strokeWidth={isCardinal ? 0.048 : 0.028}
                  />
                );
              })}

              {/* North needle – red upper half */}
              <polygon points="0,-0.64  -0.10,-0.12  0,-0.26  0.10,-0.12" fill="#ef4444" />
              {/* South needle – pale lower half */}
              <polygon points="0,0.64  -0.10,0.12  0,0.26  0.10,0.12" fill="rgba(255,255,255,0.50)" />

              {/* E / W side pips */}
              <polygon points=" 0.64,0   0.15,-0.06   0.28,0   0.15,0.06" fill="rgba(255,255,255,0.38)" />
              <polygon points="-0.64,0  -0.15,-0.06  -0.28,0  -0.15,0.06" fill="rgba(255,255,255,0.38)" />

              {/* Intercardinal small diamond pips */}
              <polygon points=" 0.45,-0.45   0.22,-0.30   0.30,-0.22   0.13,-0.37" fill="rgba(255,255,255,0.20)" />
              <polygon points=" 0.45, 0.45   0.22, 0.30   0.30, 0.22   0.13, 0.37" fill="rgba(255,255,255,0.20)" />
              <polygon points="-0.45, 0.45  -0.22, 0.30  -0.30, 0.22  -0.13, 0.37" fill="rgba(255,255,255,0.20)" />
              <polygon points="-0.45,-0.45  -0.22,-0.30  -0.30,-0.22  -0.13,-0.37" fill="rgba(255,255,255,0.20)" />

              {/* Cardinal labels */}
              <text x="0"     y="-0.66" textAnchor="middle" fontSize="0.26" fill="#ef4444"                   fontFamily="system-ui,sans-serif" fontWeight="bold">N</text>
              <text x="0"     y="0.90"  textAnchor="middle" fontSize="0.22" fill="rgba(255,255,255,0.52)"    fontFamily="system-ui,sans-serif">S</text>
              <text x="0.72"  y="0.08"  textAnchor="middle" fontSize="0.22" fill="rgba(255,255,255,0.52)"    fontFamily="system-ui,sans-serif" dominantBaseline="middle">E</text>
              <text x="-0.72" y="0.08"  textAnchor="middle" fontSize="0.22" fill="rgba(255,255,255,0.52)"    fontFamily="system-ui,sans-serif" dominantBaseline="middle">W</text>

              {/* Centre pivot dot */}
              <circle cx="0" cy="0" r="0.065" fill="rgba(255,255,255,0.80)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
