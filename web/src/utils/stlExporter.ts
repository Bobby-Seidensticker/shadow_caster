import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';
import type { ShadowCasterGeometry } from './geometryGenerator';
import type { ComputedImageConfig } from '../types/ImageConfig';

export function exportToSTL(
  geometry: ShadowCasterGeometry,
  config: ComputedImageConfig,
  filename?: string
): void {
  // Create a temporary group with all the geometry
  const group = new THREE.Group();

  // Add base
  const baseGeometry = new THREE.BoxGeometry(...geometry.base.size);
  const baseMesh = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial());
  baseMesh.position.set(...geometry.base.position);
  group.add(baseMesh);

  // Add left walls
  geometry.leftWalls.forEach(wall => {
    const wallGeometry = new THREE.BoxGeometry(...wall.size);
    const wallMesh = new THREE.Mesh(wallGeometry, new THREE.MeshBasicMaterial());
    wallMesh.position.set(...wall.position);
    group.add(wallMesh);
  });

  // Add up walls
  geometry.upWalls.forEach(wall => {
    const wallGeometry = new THREE.BoxGeometry(...wall.size);
    const wallMesh = new THREE.Mesh(wallGeometry, new THREE.MeshBasicMaterial());
    wallMesh.position.set(...wall.position);
    group.add(wallMesh);
  });

  // Merge all geometries into a single geometry for better STL export
  const mergedGeometry = mergeGeometries(group);

  // Export to STL
  const exporter = new STLExporter();
  
  // Create a temporary mesh for the exporter
  const tempMesh = new THREE.Mesh(mergedGeometry, new THREE.MeshBasicMaterial());
  const stlData = exporter.parse(tempMesh, { binary: true });

  // Create download (binary STL files are much smaller)
  const blob = new Blob([stlData], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || config.outputFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function mergeGeometries(group: THREE.Group): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
      // Clone geometry and apply the mesh's transform
      const geometry = child.geometry.clone();
      
      // Apply the mesh's matrix to the geometry
      const matrix = new THREE.Matrix4();
      matrix.compose(child.position, child.quaternion, child.scale);
      geometry.applyMatrix4(matrix);
      
      geometries.push(geometry);
    }
  });

  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  // Use BufferGeometryUtils.mergeGeometries if available, otherwise merge manually
  return mergeBufferGeometries(geometries);
}

function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  if (geometries.length === 1) {
    return geometries[0];
  }

  // Simple merge implementation
  const merged = new THREE.BufferGeometry();
  
  let vertexCount = 0;
  let indexCount = 0;

  // Count total vertices and indices
  geometries.forEach(geometry => {
    const positions = geometry.getAttribute('position');
    if (positions) {
      vertexCount += positions.count;
    }
    
    const index = geometry.getIndex();
    if (index) {
      indexCount += index.count;
    } else {
      // Non-indexed geometry
      indexCount += positions ? positions.count : 0;
    }
  });

  // Create merged arrays
  const mergedPositions = new Float32Array(vertexCount * 3);
  const mergedNormals = new Float32Array(vertexCount * 3);
  const mergedIndices = new Uint32Array(indexCount);

  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  geometries.forEach(geometry => {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const index = geometry.getIndex();

    if (positions) {
      mergedPositions.set(positions.array as Float32Array, positionOffset);
      positionOffset += positions.array.length;
    }

    if (normals) {
      mergedNormals.set(normals.array as Float32Array, normalOffset);
      normalOffset += normals.array.length;
    }

    if (index) {
      // Indexed geometry
      for (let i = 0; i < index.count; i++) {
        mergedIndices[indexOffset + i] = index.getX(i) + vertexOffset;
      }
      indexOffset += index.count;
      vertexOffset += positions ? positions.count : 0;
    } else {
      // Non-indexed geometry
      const count = positions ? positions.count : 0;
      for (let i = 0; i < count; i++) {
        mergedIndices[indexOffset + i] = vertexOffset + i;
      }
      indexOffset += count;
      vertexOffset += count;
    }
  });

  merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

  return merged;
}