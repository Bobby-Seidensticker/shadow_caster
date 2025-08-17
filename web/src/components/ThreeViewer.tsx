import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { 
  generateShadowCasterGeometry, 
  createThreeGeometry, 
  calculateSceneBounds
} from '../utils/geometryGenerator';
import type { ProcessedImageData } from '../utils/imageProcessing';
import type { ComputedImageConfig } from '../types/ImageConfig';
import type { ShadowCasterGeometry } from '../utils/geometryGenerator';

interface ThreeViewerProps {
  horizImageData: ProcessedImageData | null;
  vertImageData: ProcessedImageData | null;
  config: ComputedImageConfig;
  onGeometryReady?: (geometry: ShadowCasterGeometry) => void;
}

export function ThreeViewer({ 
  horizImageData, 
  vertImageData, 
  config, 
  onGeometryReady 
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const geometryGroupRef = useRef<THREE.Group | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxDistance = 200;
    controlsRef.current = controls;

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(20);
    scene.add(axesHelper);

    mountRef.current.appendChild(renderer.domElement);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current || (!horizImageData && !vertImageData)) {
      return;
    }

    setIsLoading(true);

    // Remove existing geometry
    if (geometryGroupRef.current) {
      sceneRef.current.remove(geometryGroupRef.current);
    }

    try {
      // Generate geometry
      const shadowCasterGeometry = generateShadowCasterGeometry(
        horizImageData,
        vertImageData,
        config
      );

      // Create Three.js objects
      const geometryGroup = createThreeGeometry(shadowCasterGeometry);
      geometryGroupRef.current = geometryGroup;

      // Enable shadows
      geometryGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      sceneRef.current.add(geometryGroup);

      // Calculate bounds and adjust camera
      const bounds = calculateSceneBounds(shadowCasterGeometry);
      
      if (cameraRef.current && controlsRef.current) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;

        // Position camera to view the entire model
        const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
        const distance = maxDimension * 1.5;
        
        camera.position.set(
          bounds.center.x + distance * 0.7,
          bounds.center.y + distance * 0.7,
          bounds.center.z + distance * 0.7
        );
        
        controls.target.copy(bounds.center);
        controls.update();
      }

      // Notify parent component
      onGeometryReady?.(shadowCasterGeometry);

    } catch (error) {
      console.error('Error generating geometry:', error);
    } finally {
      setIsLoading(false);
    }
  }, [horizImageData, vertImageData, config, onGeometryReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="text-lg">Generating 3D model...</div>
        </div>
      )}
      {!horizImageData && !vertImageData && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          Upload images to see 3D preview
        </div>
      )}
    </div>
  );
}