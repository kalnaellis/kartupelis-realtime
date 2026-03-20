import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js';
import { Room } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.3.0/+esm';

const RUNWAY_AVATAR_ID = 'cc3e04c0-5aef-471a-a95b-1cb25f7dc68e';

const container = document.getElementById('app');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');

// Video element for Runway output
const video = document.createElement('video');
video.autoplay = true;
video.playsInline = true;
video.muted = true; // unmute after user interaction

const { scene, camera, renderer } = createScene(container);
createAvatar(scene, video);

startBtn.addEventListener('click', start);

animate();

async function start() {
  overlay.innerText = 'Starting Runway realtime session...';
  startBtn.disabled = true;

  try {
    const res = await fetch('/api/runway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarId: RUNWAY_AVATAR_ID })
    });

    if (!res.ok) throw new Error('Runway API failed: ' + res.status);

    const creds = await res.json();

    const serverUrl = creds.serverUrl || creds.server_url || creds.url;
    if (!serverUrl) throw new Error('Missing server URL');

    overlay.innerText = 'Connecting to LiveKit...';

    const room = new Room();

    room.on('trackSubscribed', (track) => {
      if (track.kind !== 'video') return;

      const stream = new MediaStream([track.mediaStreamTrack]);
      video.srcObject = stream;
      overlay.innerText = 'Connected';

      // Runway requires user gesture before audio can play
      video.muted = false;
    });

    room.on('connectionStateChanged', (state) => {
      overlay.innerText = `Connection: ${state}`;
    });

    await room.connect(serverUrl, creds.token, { autoSubscribe: true });
  } catch (err) {
    overlay.innerText = 'Error: ' + err.message;
    startBtn.disabled = false;
  }
}

function createScene(container) {
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

function createAvatar(scene, videoEl) {
  const texture = new THREE.VideoTexture(videoEl);

  const geometry = new THREE.PlaneGeometry(1.5, 2);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
