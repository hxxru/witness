import * as THREE from 'three';

// --- scene setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  75,                                       // FOV
  window.innerWidth / window.innerHeight,   // aspect
  0.1,                                      // near
  5000                                      // far — must contain celestial sphere
);
camera.position.set(0, 10, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// --- handle resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- game loop ---
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();
