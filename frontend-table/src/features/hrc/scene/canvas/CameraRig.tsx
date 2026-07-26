import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

/**
 * Fixed cinematic camera — premium 3/4 top-down perspective.
 * No orbit controls. The camera is positioned to show:
 * - all 10 seats clearly
 * - the full board card area
 * - the pot center
 * - depth and dimensionality of the table structure
 */
export function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 38;
      camera.near = 0.1;
      camera.far = 50;
      camera.updateProjectionMatrix();
    }

    // Premium 3/4 top-down angle
    // Slightly elevated, slightly in front, looking at table center
    camera.position.set(0, 5.2, 3.8);
    camera.lookAt(0, 0, -0.2);
  }, [camera]);

  return null;
}
