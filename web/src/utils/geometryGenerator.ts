import * as THREE from 'three';
import { roundToLayerHeight } from './imageProcessing';
import type { ProcessedImageData } from './imageProcessing';
import type { ComputedImageConfig } from '../types/ImageConfig';

export interface WallGeometry {
  position: [number, number, number];
  size: [number, number, number];
}

export interface ShadowCasterGeometry {
  base: WallGeometry;
  leftWalls: WallGeometry[];
  upWalls: WallGeometry[];
}

export function generateShadowCasterGeometry(
  horizImageData: ProcessedImageData | null,
  vertImageData: ProcessedImageData | null,
  config: ComputedImageConfig
): ShadowCasterGeometry {
  const leftWalls: WallGeometry[] = [];
  const upWalls: WallGeometry[] = [];

  // Generate left walls (horizontal shadow image)
  if (horizImageData && config.doHorizImage) {
    for (let y = 0; y < horizImageData.height; y++) {
      for (let x = 0; x < horizImageData.width; x++) {
        const val = horizImageData.data[y][x];
        const wallHeight = roundToLayerHeight(
          (1 - val / 256) * (config.maxHeight - config.layerHeight),
          config.layerHeight
        );

        const posX = config.border + (x + 1) * config.cellSize + 
          (config.shouldDoPlusWalls ? 0.5 * (config.cellSize - config.wallWidth) : 0);
        const posY = config.border + (horizImageData.height - y) * config.cellSize;
        const posZ = config.bottomThk + wallHeight / 2 + config.layerHeight / 2;

        leftWalls.push({
          position: [posX, posY, posZ],
          size: [
            config.wallWidth + 0.01,
            config.cellSize + 0.01,
            wallHeight + config.layerHeight
          ]
        });
      }
    }
  }

  // Generate up walls (vertical shadow image)
  if (vertImageData && config.doVertImage) {
    for (let y = 0; y < vertImageData.height; y++) {
      for (let x = 0; x < vertImageData.width; x++) {
        const val = vertImageData.data[y][x];
        const wallHeight = roundToLayerHeight(
          (1 - val / 256) * (config.maxHeight - config.layerHeight),
          config.layerHeight
        );

        const posX = config.border + (x + 1) * config.cellSize;
        const posY = config.border + (vertImageData.height - y) * config.cellSize + 
          (config.shouldDoPlusWalls ? 0.5 * (config.cellSize - config.wallWidth) : 0);
        const posZ = config.bottomThk + wallHeight / 2 + config.layerHeight / 2;

        upWalls.push({
          position: [posX, posY, posZ],
          size: [
            config.cellSize + 0.01,
            config.wallWidth + 0.01,
            wallHeight + config.layerHeight
          ]
        });
      }
    }
  }

  // Calculate base dimensions
  const imageWidth = Math.max(
    horizImageData?.width || 0,
    vertImageData?.width || 0
  );
  const imageHeight = Math.max(
    horizImageData?.height || 0,
    vertImageData?.height || 0
  );

  const baseWidth = config.border * 2 + config.cellSize * (imageWidth + 2);
  const baseHeight = config.border * 2 + config.cellSize * (imageHeight + 2);

  const base: WallGeometry = {
    position: [baseWidth / 2, baseHeight / 2, config.bottomThk / 2],
    size: [baseWidth, baseHeight, config.bottomThk]
  };

  return {
    base,
    leftWalls,
    upWalls
  };
}

// Material cache to reuse materials
const materialCache = new Map<string, THREE.Material>();

function getMaterial(color: number): THREE.Material {
  const key = color.toString();
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({ color }));
  }
  return materialCache.get(key)!;
}

export function createThreeGeometry(geometry: ShadowCasterGeometry): THREE.Group {
  const group = new THREE.Group();

  // Create base
  const baseGeometry = new THREE.BoxGeometry(...geometry.base.size);
  const baseMaterial = getMaterial(0x888888);
  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  baseMesh.position.set(...geometry.base.position);
  group.add(baseMesh);

  // Get wall material (reused for all walls)
  const wallMaterial = getMaterial(0xcccccc);

  // Create left walls
  geometry.leftWalls.forEach(wall => {
    const wallGeometry = new THREE.BoxGeometry(...wall.size);
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.set(...wall.position);
    group.add(wallMesh);
  });

  // Create up walls
  geometry.upWalls.forEach(wall => {
    const wallGeometry = new THREE.BoxGeometry(...wall.size);
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.set(...wall.position);
    group.add(wallMesh);
  });

  return group;
}

export function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Dispose geometry
      if (child.geometry) {
        child.geometry.dispose();
      }
      
      // Note: We don't dispose materials here since they're cached
      // Materials will be disposed when disposeMaterialCache is called
    }
  });
  
  // Remove all children
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
}

export function disposeMaterialCache(): void {
  materialCache.forEach(material => material.dispose());
  materialCache.clear();
}

export function calculateSceneBounds(geometry: ShadowCasterGeometry): {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  size: THREE.Vector3;
} {
  const allGeometries = [geometry.base, ...geometry.leftWalls, ...geometry.upWalls];
  
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  allGeometries.forEach(wall => {
    const [x, y, z] = wall.position;
    const [w, h, d] = wall.size;
    
    minX = Math.min(minX, x - w/2);
    maxX = Math.max(maxX, x + w/2);
    minY = Math.min(minY, y - h/2);
    maxY = Math.max(maxY, y + h/2);
    minZ = Math.min(minZ, z - d/2);
    maxZ = Math.max(maxZ, z + d/2);
  });

  const min = new THREE.Vector3(minX, minY, minZ);
  const max = new THREE.Vector3(maxX, maxY, maxZ);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const size = max.clone().sub(min);

  return { min, max, center, size };
}