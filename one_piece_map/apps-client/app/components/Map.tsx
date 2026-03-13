"use client";

import { Line, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Island } from "../data/islands";
import { MAP_STRUCTURE } from "../data/islands";

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
  cloudColorMap: THREE.CanvasTexture;
  cloudAlphaMap: THREE.CanvasTexture;
};

type RouteDefinition = {
  id: string;
  ids: string[];
  color: string;
  glowColor: string;
  width: number;
  opacity: number;
};

type Coordinates = {
  lat: number;
  lon: number;
};

const ROUTES: RouteDefinition[] = [
  {
    id: "east-blue-route",
    ids: ["dawn-island", "shells-town", "orange-town", "syrup-village", "baratie", "arlong-park", "loguetown", "reverse-mountain"],
    color: "#f9d56e",
    glowColor: "#b66a17",
    width: 1.9,
    opacity: 0.88,
  },
  {
    id: "grand-line-route",
    ids: ["reverse-mountain", "alabasta", "jaya", "water-7", "thriller-bark", "dressrosa", "whole-cake-island", "wano"],
    color: "#ff7b7b",
    glowColor: "#7d1c28",
    width: 2.1,
    opacity: 0.82,
  },
  {
    id: "sky-route",
    ids: ["jaya", "skypiea"],
    color: "#9be7ff",
    glowColor: "#326d92",
    width: 1.5,
    opacity: 0.72,
  },
];

function createToonGradientMap(): THREE.DataTexture {
  const colors = new Uint8Array([
    82, 104, 120,
    144, 171, 188,
    211, 229, 238,
    255, 248, 229,
  ]);

  const texture = new THREE.DataTexture(colors, 4, 1, THREE.RGBFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

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

function createGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create glow texture canvas context.");
  }

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 248, 214, 1)");
  gradient.addColorStop(0.18, "rgba(255, 216, 143, 0.92)");
  gradient.addColorStop(0.45, "rgba(255, 140, 82, 0.42)");
  gradient.addColorStop(1, "rgba(255, 140, 82, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
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
  const cloudColorCanvas = makeCanvas();
  const cloudAlphaCanvas = makeCanvas();

  const oceanColorCtx = oceanColorCanvas.getContext("2d");
  const oceanNormalCtx = oceanNormalCanvas.getContext("2d");
  const redLineColorCtx = redLineColorCanvas.getContext("2d");
  const redLineDispCtx = redLineDisplacementCanvas.getContext("2d");
  const redLineAlphaCtx = redLineAlphaCanvas.getContext("2d");
  const cloudColorCtx = cloudColorCanvas.getContext("2d");
  const cloudAlphaCtx = cloudAlphaCanvas.getContext("2d");

  if (
    !oceanColorCtx ||
    !oceanNormalCtx ||
    !redLineColorCtx ||
    !redLineDispCtx ||
    !redLineAlphaCtx ||
    !cloudColorCtx ||
    !cloudAlphaCtx
  ) {
    throw new Error("Failed to create canvas context for planet textures.");
  }

  const oceanColorImage = oceanColorCtx.createImageData(size, size);
  const oceanNormalImage = oceanNormalCtx.createImageData(size, size);
  const redLineColorImage = redLineColorCtx.createImageData(size, size);
  const redLineDispImage = redLineDispCtx.createImageData(size, size);
  const redLineAlphaImage = redLineAlphaCtx.createImageData(size, size);
  const cloudColorImage = cloudColorCtx.createImageData(size, size);
  const cloudAlphaImage = cloudAlphaCtx.createImageData(size, size);

  const northBlue = new THREE.Color("#55c3e3");
  const eastBlue = new THREE.Color("#3fa6d0");
  const westBlue = new THREE.Color("#2e81ae");
  const southBlue = new THREE.Color("#2a6687");

  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1);
    const latDeg = 90 - v * 180;
    const latFade = 1 - Math.abs(v * 2 - 1);

    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const u = x / (size - 1);
      const lon = (u - 0.5) * Math.PI * 2;

      const latRad = THREE.MathUtils.degToRad(latDeg);
      const sphereZ = Math.cos(latRad) * Math.sin(lon);
      const redDistance = Math.abs(sphereZ);

      // Constant angular width around a great circle (no taper at poles).
      const redLinePlateauHalfWidth = Math.sin(THREE.MathUtils.degToRad(2.8));
      const redLineWallHalfWidth = Math.sin(THREE.MathUtils.degToRad(8.5));
      let redLineWallMask = 0;

      if (redDistance <= redLinePlateauHalfWidth) {
        redLineWallMask = 1;
      } else if (redDistance <= redLineWallHalfWidth) {
        const cliffFade = THREE.MathUtils.smoothstep(redDistance, redLinePlateauHalfWidth, redLineWallHalfWidth);
        redLineWallMask = 1 - cliffFade;
      }

      const largeNoise = fractalNoise2D(u * 8, v * 12, 5);
      const detailNoise = fractalNoise2D(u * 48, v * 48, 3);
      const rockyVariation = 0.55 * largeNoise + 0.45 * detailNoise;
      const oceanNoise = fractalNoise2D(u * 9, v * 7, 4);
      const cloudNoise = 0.65 * fractalNoise2D(u * 8 + 11, v * 10 + 7, 5) + 0.35 * fractalNoise2D(u * 42 + 2, v * 32 + 13, 3);

      const inNorth = latDeg > 0;
      const inEast = Math.sin(lon) > 0;
      const baseOcean = inNorth ? (inEast ? eastBlue : northBlue) : inEast ? southBlue : westBlue;

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
      const grandEdgeDistance = Math.abs(Math.abs(latDeg) - MAP_STRUCTURE.grandLine.halfWidth);
      const grandEdgeMask = 1 - THREE.MathUtils.smoothstep(grandEdgeDistance, 0.35, 2.6);

      const oceanColor = baseOcean.clone();
      oceanColor.multiplyScalar(0.88 + oceanNoise * 0.24);
      oceanColor.lerp(new THREE.Color("#87e1ff"), latFade * 0.08);

      if (calmMask > 0) {
        oceanColor.lerp(new THREE.Color("#dff4f8"), calmMask * 0.86);
      }
      if (grandLineMask > 0) {
        oceanColor.lerp(new THREE.Color("#122f4e"), grandLineMask * 0.97);
      }
      if (grandEdgeMask > 0) {
        oceanColor.lerp(new THREE.Color("#8fd4df"), grandEdgeMask * 0.28);
      }

      oceanColorImage.data[i] = Math.floor(THREE.MathUtils.clamp(oceanColor.r * 255, 0, 255));
      oceanColorImage.data[i + 1] = Math.floor(THREE.MathUtils.clamp(oceanColor.g * 255, 0, 255));
      oceanColorImage.data[i + 2] = Math.floor(THREE.MathUtils.clamp(oceanColor.b * 255, 0, 255));
      oceanColorImage.data[i + 3] = 255;

      const cliffNoise = fractalNoise2D(u * 20 + 4, v * 26 + 8, 4);
      const topNoise = fractalNoise2D(u * 140 + 19, v * 130 + 3, 2);
      const wallCore = redLineWallMask * (0.88 + cliffNoise * 0.12);
      const topPlateau = redLineWallMask > 0.92 ? topNoise * 0.06 : 0;
      const mountainHeight = THREE.MathUtils.clamp(wallCore + topPlateau, 0, 1);
      const dispGray = Math.min(255, Math.floor(mountainHeight * 255));

      redLineDispImage.data[i] = dispGray;
      redLineDispImage.data[i + 1] = dispGray;
      redLineDispImage.data[i + 2] = dispGray;
      redLineDispImage.data[i + 3] = 255;

      const alpha = redLineWallMask > 0.02 ? Math.floor((0.9 + redLineWallMask * 0.1) * 255) : 0;
      redLineAlphaImage.data[i] = alpha;
      redLineAlphaImage.data[i + 1] = alpha;
      redLineAlphaImage.data[i + 2] = alpha;
      redLineAlphaImage.data[i + 3] = 255;

      const wallShade = 0.76 + cliffNoise * 0.24;
      const red = Math.floor((184 + rockyVariation * 26) * wallShade);
      const green = Math.floor((58 + rockyVariation * 24) * wallShade);
      const blue = Math.floor((42 + rockyVariation * 16) * wallShade);
      redLineColorImage.data[i] = THREE.MathUtils.clamp(red, 0, 255);
      redLineColorImage.data[i + 1] = THREE.MathUtils.clamp(green, 0, 255);
      redLineColorImage.data[i + 2] = THREE.MathUtils.clamp(blue, 0, 255);
      redLineColorImage.data[i + 3] = alpha;

      const waveNoise = fractalNoise2D(u * 30, v * 30, 4);
      const nx = 128 + Math.floor((waveNoise - 0.5) * 40);
      const ny = 128 + Math.floor((latFade - 0.5) * 18);
      oceanNormalImage.data[i] = THREE.MathUtils.clamp(nx, 0, 255);
      oceanNormalImage.data[i + 1] = THREE.MathUtils.clamp(ny, 0, 255);
      oceanNormalImage.data[i + 2] = 255;
      oceanNormalImage.data[i + 3] = 255;

      const cloudThreshold = THREE.MathUtils.clamp((cloudNoise - 0.54) / 0.21, 0, 1);
      const cloudOpacity = Math.pow(cloudThreshold, 1.5) * (0.42 + latFade * 0.3);
      const cloudTone = 225 + Math.floor(20 * cloudNoise);

      cloudColorImage.data[i] = cloudTone;
      cloudColorImage.data[i + 1] = cloudTone;
      cloudColorImage.data[i + 2] = Math.min(255, cloudTone + 12);
      cloudColorImage.data[i + 3] = 255;

      const cloudAlpha = Math.floor(cloudOpacity * 255);
      cloudAlphaImage.data[i] = cloudAlpha;
      cloudAlphaImage.data[i + 1] = cloudAlpha;
      cloudAlphaImage.data[i + 2] = cloudAlpha;
      cloudAlphaImage.data[i + 3] = 255;
    }
  }

  oceanColorCtx.putImageData(oceanColorImage, 0, 0);
  oceanNormalCtx.putImageData(oceanNormalImage, 0, 0);
  redLineColorCtx.putImageData(redLineColorImage, 0, 0);
  redLineDispCtx.putImageData(redLineDispImage, 0, 0);
  redLineAlphaCtx.putImageData(redLineAlphaImage, 0, 0);
  cloudColorCtx.putImageData(cloudColorImage, 0, 0);
  cloudAlphaCtx.putImageData(cloudAlphaImage, 0, 0);

  const oceanColorMap = new THREE.CanvasTexture(oceanColorCanvas);
  const oceanNormalMap = new THREE.CanvasTexture(oceanNormalCanvas);
  const redLineColorMap = new THREE.CanvasTexture(redLineColorCanvas);
  const redLineDisplacementMap = new THREE.CanvasTexture(redLineDisplacementCanvas);
  const redLineAlphaMap = new THREE.CanvasTexture(redLineAlphaCanvas);
  const cloudColorMap = new THREE.CanvasTexture(cloudColorCanvas);
  const cloudAlphaMap = new THREE.CanvasTexture(cloudAlphaCanvas);

  oceanColorMap.wrapS = THREE.RepeatWrapping;
  oceanColorMap.wrapT = THREE.ClampToEdgeWrapping;
  oceanNormalMap.wrapS = THREE.RepeatWrapping;
  oceanNormalMap.wrapT = THREE.RepeatWrapping;
  cloudColorMap.wrapS = THREE.RepeatWrapping;
  cloudAlphaMap.wrapS = THREE.RepeatWrapping;
  oceanNormalMap.repeat.set(4, 2);
  cloudColorMap.repeat.set(1.4, 1);
  cloudAlphaMap.repeat.set(1.4, 1);

  oceanColorMap.colorSpace = THREE.SRGBColorSpace;
  redLineColorMap.colorSpace = THREE.SRGBColorSpace;
  cloudColorMap.colorSpace = THREE.SRGBColorSpace;
  oceanNormalMap.colorSpace = THREE.NoColorSpace;
  redLineDisplacementMap.colorSpace = THREE.NoColorSpace;
  redLineAlphaMap.colorSpace = THREE.NoColorSpace;
  cloudAlphaMap.colorSpace = THREE.NoColorSpace;

  [oceanColorMap, oceanNormalMap, redLineColorMap, redLineDisplacementMap, redLineAlphaMap, cloudColorMap, cloudAlphaMap].forEach((texture) => {
    texture.needsUpdate = true;
  });

  return {
    oceanColorMap,
    oceanNormalMap,
    redLineColorMap,
    redLineDisplacementMap,
    redLineAlphaMap,
    cloudColorMap,
    cloudAlphaMap,
  };
}

function buildArcPoints(start: Coordinates, end: Coordinates, radius = 1.02, liftFactor = 0.14): THREE.Vector3[] {
  const startPoint = latLonToVector3(start.lat, start.lon, radius);
  const endPoint = latLonToVector3(end.lat, end.lon, radius);
  const angle = startPoint.angleTo(endPoint);
  const lift = 0.1 + angle * liftFactor;
  const middle = startPoint.clone().add(endPoint).multiplyScalar(0.5).normalize().multiplyScalar(1.06 + lift);

  return new THREE.QuadraticBezierCurve3(startPoint, middle, endPoint).getPoints(36);
}

function Atmosphere() {
  return (
    <group>
      <mesh scale={1.12}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshBasicMaterial
          color="#9ce7ff"
          transparent
          opacity={0.09}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.19}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshBasicMaterial
          color="#5fc8ff"
          transparent
          opacity={0.035}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CloudLayer({ textures, toonGradientMap }: { textures: PlanetTextures; toonGradientMap: THREE.DataTexture }) {
  const cloudRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!cloudRef.current) {
      return;
    }

    cloudRef.current.rotation.y = state.clock.elapsedTime * 0.018;
  });

  return (
    <mesh ref={cloudRef}>
      <sphereGeometry args={[1.028, 128, 128]} />
      <meshToonMaterial
        map={textures.cloudColorMap}
        alphaMap={textures.cloudAlphaMap}
        gradientMap={toonGradientMap}
        color="#fff6dd"
        transparent
        opacity={0.46}
        depthWrite={false}
      />
    </mesh>
  );
}

function Planet() {
  const textures = useMemo(() => createPlanetTextures(1024), []);
  const toonGradientMap = useMemo(() => createToonGradientMap(), []);
  const oceanNormalScale = useMemo(() => new THREE.Vector2(0.7, 0.7), []);

  return (
    <group>
      <Atmosphere />

      <mesh>
        <sphereGeometry args={[1, 256, 256]} />
        <meshToonMaterial
          map={textures.oceanColorMap}
          normalMap={textures.oceanNormalMap}
          normalScale={oceanNormalScale}
          gradientMap={toonGradientMap}
          color="#d8f8ff"
          emissive={new THREE.Color("#183d61")}
          emissiveIntensity={0.26}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.006, 256, 256]} />
        <meshStandardMaterial
          map={textures.redLineColorMap}
          alphaMap={textures.redLineAlphaMap}
          displacementMap={textures.redLineDisplacementMap}
          displacementScale={0.22}
          displacementBias={-0.018}
          color="#ba4a2d"
          roughness={0.95}
          metalness={0.03}
          emissive={new THREE.Color("#31110d")}
          emissiveIntensity={0.06}
          opacity={1}
          transparent
          depthWrite
        />
      </mesh>

      <CloudLayer textures={textures} toonGradientMap={toonGradientMap} />
    </group>
  );
}

function makeLabelTexture(text: string, color: string, opacity: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get 2D context for label texture.");
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "700 54px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(7, 12, 20, 0.9)";
  ctx.lineWidth = 12;
  ctx.lineJoin = "round";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type GlobeLabelProps = {
  lat: number;
  lon: number;
  text: string;
  scale: number;
  color: string;
  opacity?: number;
};

function GlobeLabel({ lat, lon, text, scale, color, opacity = 1 }: GlobeLabelProps) {
  const position = useMemo(() => latLonToVector3(lat, lon, 1.25), [lat, lon]);
  const material = useMemo(() => {
    const texture = makeLabelTexture(text, color, opacity);
    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
  }, [color, opacity, text]);

  const aspect = 768 / 128;
  return <sprite position={position} material={material} scale={[scale * aspect, scale, 1]} />;
}

function WorldLabels() {
  return (
    <group>
      <GlobeLabel lat={-49} lon={92} text="EAST BLUE" scale={0.25} color="#acdff6" opacity={0.9} />
      <GlobeLabel lat={-49} lon={-92} text="WEST BLUE" scale={0.25} color="#b5d3f3" opacity={0.9} />
      <GlobeLabel lat={48} lon={-90} text="NORTH BLUE" scale={0.25} color="#a8d9ec" opacity={0.9} />
      <GlobeLabel lat={47} lon={89} text="SOUTH BLUE" scale={0.25} color="#abd7bf" opacity={0.9} />
      <GlobeLabel lat={0} lon={132} text="PARADISE" scale={0.18} color="#d2b6ff" opacity={0.9} />
      <GlobeLabel lat={0} lon={-30} text="NEW WORLD" scale={0.18} color="#f1b28b" opacity={0.92} />
      <GlobeLabel lat={13} lon={88} text="CALM BELT" scale={0.12} color="#d5f0ff" opacity={0.74} />
      <GlobeLabel lat={-13} lon={88} text="CALM BELT" scale={0.12} color="#d5f0ff" opacity={0.74} />
      <GlobeLabel lat={13} lon={-92} text="CALM BELT" scale={0.12} color="#d5f0ff" opacity={0.74} />
      <GlobeLabel lat={-13} lon={-92} text="CALM BELT" scale={0.12} color="#d5f0ff" opacity={0.74} />
      <GlobeLabel lat={40} lon={0} text="RED LINE" scale={0.13} color="#f5ae9d" opacity={0.92} />
      <GlobeLabel lat={-40} lon={0} text="RED LINE" scale={0.13} color="#f5ae9d" opacity={0.92} />
      <GlobeLabel lat={40} lon={180} text="RED LINE" scale={0.13} color="#f5ae9d" opacity={0.92} />
      <GlobeLabel lat={-40} lon={180} text="RED LINE" scale={0.13} color="#f5ae9d" opacity={0.92} />
    </group>
  );
}

function SeaRoutes({ islands }: Pick<OnePieceMapProps, "islands">) {
  const islandMap = useMemo(() => new Map(islands.map((island) => [island.id, island])), [islands]);

  return (
    <group>
      {ROUTES.flatMap((route) =>
        route.ids.slice(0, -1).map((islandId, index) => {
          const from = islandMap.get(islandId);
          const to = islandMap.get(route.ids[index + 1]);

          if (!from || !to) {
            return null;
          }

          const points = buildArcPoints(from.coordinates, to.coordinates);
          const key = `${route.id}-${from.id}-${to.id}`;

          return (
            <group key={key}>
              <Line
                points={points}
                color={route.glowColor}
                lineWidth={route.width * 2.2}
                transparent
                opacity={route.opacity * 0.18}
                depthWrite={false}
              />
              <Line
                points={points}
                color={route.color}
                lineWidth={route.width}
                transparent
                opacity={route.opacity}
                depthWrite={false}
                dashed
                dashScale={24}
                dashSize={0.55}
                gapSize={0.42}
              />
            </group>
          );
        }),
      )}
    </group>
  );
}

function ReverseMountainCurrents() {
  const summit = { lat: 0, lon: 180 };
  const grandLineOutflow = { lat: 0, lon: 154 };
  const inlets: Coordinates[] = [
    { lat: 34, lon: 150 },
    { lat: -34, lon: 150 },
    { lat: 34, lon: -150 },
    { lat: -34, lon: -150 },
  ];

  return (
    <group>
      {inlets.map((entry, index) => {
        const points = buildArcPoints(entry, summit, 1.021, 0.08);

        return (
          <Line
            key={`reverse-mountain-inlet-${index}`}
            points={points}
            color="#95dfff"
            lineWidth={1.3}
            transparent
            opacity={0.84}
            depthWrite={false}
            dashed
            dashScale={22}
            dashSize={0.5}
            gapSize={0.5}
          />
        );
      })}

      <Line
        points={buildArcPoints(summit, grandLineOutflow, 1.023, 0.06)}
        color="#c9f2ff"
        lineWidth={1.8}
        transparent
        opacity={0.95}
        depthWrite={false}
      />
    </group>
  );
}

function ReverseMountainLandmark() {
  const position = useMemo(() => latLonToVector3(0, 180, 1.072), []);
  const normal = useMemo(() => position.clone().normalize(), [position]);
  const rotation = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal),
    [normal],
  );
  const markerTexture = useMemo(() => makeLabelTexture("REVERSE MOUNTAIN", "#f8e9c7", 1), []);
  const markerMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: markerTexture,
        transparent: true,
        depthWrite: false,
      }),
    [markerTexture],
  );

  return (
    <group position={position} quaternion={rotation}>
      <mesh position={[0, -0.014, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.08, 28]} />
        <meshStandardMaterial color="#7f301f" roughness={0.95} metalness={0.02} />
      </mesh>

      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.085, 0.09, 0.024, 28]} />
        <meshStandardMaterial color="#9c3a24" roughness={0.92} metalness={0.03} />
      </mesh>

      <Line points={[[-0.062, 0.043, 0], [0, 0.052, 0]]} color="#8ed9f3" lineWidth={1.4} />
      <Line points={[[0.062, 0.043, 0], [0, 0.052, 0]]} color="#8ed9f3" lineWidth={1.4} />
      <Line points={[[0, 0.043, -0.062], [0, 0.052, 0]]} color="#8ed9f3" lineWidth={1.4} />
      <Line points={[[0, 0.043, 0.062], [0, 0.052, 0]]} color="#8ed9f3" lineWidth={1.4} />
      <Line points={[[0, 0.052, 0], [0.082, 0.06, 0.018]]} color="#d3f3ff" lineWidth={1.6} />

      <sprite position={[0, 0.13, 0]} material={markerMaterial} scale={[0.52, 0.08, 1]} />
    </group>
  );
}

function IslandMarker({
  island,
  isSelected,
  glowTexture,
  onSelectIsland,
}: {
  island: Island;
  isSelected: boolean;
  glowTexture: THREE.CanvasTexture;
  onSelectIsland: (islandId: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const basePosition = useMemo(
    () => latLonToVector3(island.coordinates.lat, island.coordinates.lon, 1.034),
    [island.coordinates.lat, island.coordinates.lon],
  );
  const labelPosition = useMemo(() => basePosition.clone().add(basePosition.clone().normalize().multiplyScalar(0.11)), [basePosition]);
  const glowMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: isSelected ? "#ffd37a" : "#89d8ff",
        transparent: true,
        opacity: isSelected ? 0.95 : 0.36,
        depthWrite: false,
      }),
    [glowTexture, isSelected],
  );
  const labelMaterial = useMemo(() => {
    if (!isSelected) {
      return null;
    }

    const texture = makeLabelTexture(island.name, "#f8edc2", 1);
    return new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
  }, [isSelected, island.name]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    const pulse = Math.sin(state.clock.elapsedTime * (isSelected ? 3.1 : 1.4) + island.coordinates.lon * 0.01);
    const scale = isSelected ? 1.08 + pulse * 0.16 : 0.98 + pulse * 0.03;
    groupRef.current.scale.setScalar(scale);
  });

  return (
    <group>
      <group ref={groupRef} position={basePosition}>
        <sprite material={glowMaterial} scale={isSelected ? [0.18, 0.18, 1] : [0.11, 0.11, 1]} />
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelectIsland(island.id);
          }}
        >
          <sphereGeometry args={[isSelected ? 0.026 : 0.019, 18, 18]} />
          <meshToonMaterial
            color={isSelected ? "#f6d17f" : "#765228"}
            emissive={new THREE.Color(isSelected ? "#f97316" : "#2b190f")}
            emissiveIntensity={isSelected ? 0.58 : 0.16}
          />
        </mesh>
      </group>

      {labelMaterial ? <sprite position={labelPosition} material={labelMaterial} scale={[0.42, 0.07, 1]} /> : null}
    </group>
  );
}

function IslandMarkers({ islands, selectedIslandId, onSelectIsland }: Pick<OnePieceMapProps, "islands" | "selectedIslandId" | "onSelectIsland">) {
  const glowTexture = useMemo(() => createGlowTexture(), []);

  return (
    <group>
      {islands.map((island) => (
        <IslandMarker
          key={island.id}
          island={island}
          isSelected={island.id === selectedIslandId}
          glowTexture={glowTexture}
          onSelectIsland={onSelectIsland}
        />
      ))}
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
    targetPositionRef.current = surfacePoint.clone().multiplyScalar(0.44);
    cameraPositionRef.current = surfacePoint.clone().multiplyScalar(2.3).add(new THREE.Vector3(0, 0.08, 0));
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

function CompassSync({ compassRef }: { compassRef: { current: HTMLDivElement | null } }) {
  const camera = useThree((state) => state.camera);
  const northPole = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!compassRef.current) {
      return;
    }

    scratch.copy(northPole).project(camera);
    let angle = Math.atan2(scratch.x, scratch.y);
    if (scratch.z > 1) {
      angle += Math.PI;
    }

    compassRef.current.style.transform = `rotate(${angle}rad)`;
  });

  return null;
}

function OrbitControlsInteraction({ onInteraction }: { onInteraction: () => void }) {
  const controls = useThree((state) => state.controls as OrbitControlsImpl | undefined);

  useEffect(() => {
    if (!controls) {
      return;
    }

    const handleStart = () => {
      onInteraction();
    };

    controls.addEventListener("start", handleStart);

    return () => {
      controls.removeEventListener("start", handleStart);
    };
  }, [controls, onInteraction]);

  return null;
}

export default function OnePieceMap({ islands, selectedIslandId, onSelectIsland, onGlobeInteraction, focusCoordinates }: OnePieceMapProps) {
  const compassRoseRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-screen w-full">
      <Canvas camera={{ position: [0, 0.34, 2.74], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#07131d"]} />
        <fog attach="fog" args={["#07131d", 3.4, 9]} />

        <Stars radius={30} depth={18} count={2500} factor={3.2} saturation={0} fade speed={0.45} />

        <ambientLight intensity={1.15} />
        <hemisphereLight args={["#d3f6ff", "#17314a", 1.18]} />
        <directionalLight position={[4, 3.6, 2.6]} intensity={1.15} color="#fff3d2" />
        <directionalLight position={[-3.5, -1.2, -2.2]} intensity={0.4} color="#6ecfff" />
        <pointLight position={[0, 2.5, 3]} intensity={0.6} color="#ffe7b3" distance={8} />

        <Planet />
        <WorldLabels />
        <ReverseMountainCurrents />
        <ReverseMountainLandmark />
        <SeaRoutes islands={islands} />
        <IslandMarkers islands={islands} selectedIslandId={selectedIslandId} onSelectIsland={onSelectIsland} />
        <CameraFocus focusCoordinates={focusCoordinates} />
        <CompassSync compassRef={compassRoseRef} />
        <OrbitControlsInteraction onInteraction={onGlobeInteraction} />

        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom
          enableRotate
          enableDamping
          dampingFactor={0.08}
          minDistance={1.38}
          maxDistance={6.8}
          autoRotate
          autoRotateSpeed={0.18}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-6 right-6 z-10 select-none" aria-hidden="true">
        <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full border border-[rgba(244,213,141,0.28)] bg-[rgba(7,22,33,0.78)] shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div ref={compassRoseRef} className="absolute inset-0 flex items-center justify-center transition-transform duration-150">
            <svg viewBox="-1 -1 2 2" width="70" height="70" xmlns="http://www.w3.org/2000/svg">
              <circle cx="0" cy="0" r="0.9" fill="none" stroke="rgba(244,213,141,0.24)" strokeWidth="0.045" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const cx = Math.sin(rad);
                const cy = -Math.cos(rad);
                const isCardinal = deg % 90 === 0;

                return (
                  <line
                    key={deg}
                    x1={cx * 0.76}
                    y1={cy * 0.76}
                    x2={cx * 0.9}
                    y2={cy * 0.9}
                    stroke={isCardinal ? "rgba(244,213,141,0.62)" : "rgba(255,255,255,0.18)"}
                    strokeWidth={isCardinal ? 0.05 : 0.028}
                  />
                );
              })}

              <polygon points="0,-0.66 -0.11,-0.12 0,-0.25 0.11,-0.12" fill="#ef7b5f" />
              <polygon points="0,0.66 -0.11,0.12 0,0.24 0.11,0.12" fill="rgba(255,245,226,0.7)" />
              <polygon points="0.66,0 0.16,-0.06 0.28,0 0.16,0.06" fill="rgba(244,213,141,0.34)" />
              <polygon points="-0.66,0 -0.16,-0.06 -0.28,0 -0.16,0.06" fill="rgba(244,213,141,0.34)" />

              <text x="0" y="-0.68" textAnchor="middle" fontSize="0.26" fill="#ef7b5f" fontFamily="Georgia, serif" fontWeight="bold">N</text>
              <text x="0" y="0.9" textAnchor="middle" fontSize="0.21" fill="rgba(255,245,226,0.5)" fontFamily="Georgia, serif">S</text>
              <text x="0.72" y="0.08" textAnchor="middle" fontSize="0.21" fill="rgba(255,245,226,0.5)" fontFamily="Georgia, serif" dominantBaseline="middle">E</text>
              <text x="-0.72" y="0.08" textAnchor="middle" fontSize="0.21" fill="rgba(255,245,226,0.5)" fontFamily="Georgia, serif" dominantBaseline="middle">W</text>

              <circle cx="0" cy="0" r="0.07" fill="rgba(244,213,141,0.9)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
