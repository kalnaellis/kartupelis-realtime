import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';

const container = document.getElementById('app');

// Video element for Runway output
const video = document.createElement('video');
video.autoplay = true;
video.playsInline = true;
video.muted = true; // autoplay-friendly; unmute after user interaction

function createScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { scene, camera, renderer };
}

function createAvatar(scene) {
  const texture = new THREE.VideoTexture(video);

  const geometry = new THREE.PlaneGeometry(1.6, 2.1);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

async function startStream() {
  try {
    const res = await fetch('/api/runway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: 'kartupelis', mode: 'realtime' })
    });

    const data = await res.json();
    if (data.stream_url) {
      video.src = data.stream_url;
      await video.play().catch(() => {});
    } else {
      console.warn('No stream_url returned from /api/runway');
    }
  } catch (e) {
    console.error('Failed to start Runway stream', e);
  }
}

const { scene, camera, renderer } = createScene();
const mesh = createAvatar(scene);

// Subtle idle motion
function animate() {
  requestAnimationFrame(animate);
  mesh.rotation.y = Math.sin(Date.now() * 0.001) * 0.15;
  renderer.render(scene, camera);
}
animate();

startStream();
