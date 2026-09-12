import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { COLORS, GLOBE_RADIUS } from '../config';

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    // Brightest where the surface turns away from the camera: a thin rim halo.
    float rim = pow(1.0 - clamp(abs(dot(normalize(vNormal), viewDir)), 0.0, 1.0), uPower);
    vec3 color = uColor * rim * uStrength;
    gl_FragColor = vec4(color, rim);
  }
`;

/**
 * One additive back-side shell that produces a subtle atmospheric halo around
 * the globe. Deliberately the only custom shader of the project.
 */
export function createAtmosphere(): Mesh {
  const geometry = new SphereGeometry(GLOBE_RADIUS * 1.09, 64, 48);
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(COLORS.atmosphere) },
      uPower: { value: 3.4 },
      uStrength: { value: 0.9 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    side: BackSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 6;
  return mesh;
}