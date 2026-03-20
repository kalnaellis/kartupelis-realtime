import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { Room } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.4/+esm';

const RUNWAY_AVATAR_ID = 'cc3e04c0-5aef-471a-a95b-1cb25f7dc68e';

const container = document.getElementById('app');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const audioBtn = document.getElementById('audio-btn');

let room = null;
let activeSessionId = null;
let remoteVideoAttached = false;
let remoteAudioTrack = null;
let remoteAudioEl = null;

const videoEl = document.createElement('video');
videoEl.playsInline = true;
videoEl.autoplay = true;
videoEl.muted = true;
videoEl.crossOrigin = 'anonymous';

const sceneState = createScene(container, videoEl);

setStatus('Ready to connect.');
animate();

startBtn.addEventListener('click', startCharacter);
stopBtn.addEventListener('click', stopCharacter);
audioBtn.addEventListener('click', toggleAudio);

async function startCharacter() {
  startBtn.disabled = true;
  audioBtn.disabled = true;
  stopBtn.disabled = true;

  try {
    setStatus('Creating Runway session...');
    const payload = { avatarId: RUNWAY_AVATAR_ID, maxDuration: 300 };

    const res = await fetch('/api/runway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.details || data.error || `Request failed with ${res.status}`);
    }

    if (!data.serverUrl || !data.token) {
      throw new Error('Runway did not return LiveKit credentials.');
    }

    activeSessionId = data.sessionId;
    setStatus('Connecting to LiveKit...');
    await connectToRoom(data.serverUrl, data.token);

    stopBtn.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Failed to start session.', 'error');
    startBtn.disabled = false;
  }
}

async function connectToRoom(serverUrl, token) {
  cleanupRoom();

  room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  room.on('connectionStateChanged', (state) => {
    if (state === 'connected') {
      setStatus('Connected. Waiting for Kartupelis video...', remoteVideoAttached ? 'live' : 'default');
      stopBtn.disabled = false;
      audioBtn.disabled = false;
      return;
    }

    if (state === 'disconnected') {
      if (activeSessionId) {
        setStatus('Disconnected.', 'default');
      }
      return;
    }

    setStatus(`Connection: ${state}`);
  });

  room.on('trackSubscribed', (track) => {
    if (track.kind === 'video') {
      attachVideoTrack(track);
    }

    if (track.kind === 'audio') {
      attachAudioTrack(track);
    }
  });

  room.on('trackUnsubscribed', (track) => {
    if (track.kind === 'video') {
      remoteVideoAttached = false;
      sceneState.material.opacity = 0.0;
    }

    if (track.kind === 'audio') {
      detachAudioTrack();
    }
  });

  await room.connect(serverUrl, token, { autoSubscribe: true });
}

function attachVideoTrack(track) {
  const stream = new MediaStream([track.mediaStreamTrack]);
  videoEl.srcObject = stream;
  videoEl.play().catch(() => {});
  remoteVideoAttached = true;
  sceneState.material.opacity = 1;
  setStatus('Kartupelis is live.', 'live');
}

function attachAudioTrack(track) {
  detachAudioTrack();

  remoteAudioTrack = track.mediaStreamTrack;
  remoteAudioEl = document.createElement('audio');
  remoteAudioEl.autoplay = true;
  remoteAudioEl.playsInline = true;
  remoteAudioEl.srcObject = new MediaStream([remoteAudioTrack]);
  remoteAudioEl.volume = 1;
  remoteAudioEl.muted = true;
  remoteAudioEl.play().catch(() => {});
  updateAudioButton();
}

function detachAudioTrack() {
  if (remoteAudioEl) {
    remoteAudioEl.pause();
    remoteAudioEl.srcObject = null;
    remoteAudioEl.remove();
    remoteAudioEl = null;
  }

  remoteAudioTrack = null;
  updateAudioButton();
}

async function stopCharacter() {
  stopBtn.disabled = true;

  try {
    if (activeSessionId) {
      await fetch('/api/runway-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      }).catch(() => {});
    }
  } finally {
    cleanupRoom();
    activeSessionId = null;
    remoteVideoAttached = false;
    sceneState.material.opacity = 0.0;
    setStatus('Session stopped.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    audioBtn.disabled = true;
  }
}

function cleanupRoom() {
  if (room) {
    room.disconnect();
    room = null;
  }

  detachAudioTrack();
  videoEl.pause();
  videoEl.srcObject = null;
}

function toggleAudio() {
  if (!remoteAudioEl) return;

  remoteAudioEl.muted = !remoteAudioEl.muted;
  remoteAudioEl.play().catch(() => {});
  updateAudioButton();
}

function updateAudioButton() {
  if (!remoteAudioEl) {
    audioBtn.textContent = 'Unmute';
    audioBtn.disabled = true;
    return;
  }

  audioBtn.disabled = false;
  audioBtn.textContent = remoteAudioEl.muted ? 'Unmute' : 'Mute';
}

function setStatus(text, mode = 'default') {
  statusText.textContent = text;
  statusDot.classList.remove('is-live', 'is-error');

  if (mode === 'live') {
    statusDot.classList.add('is-live');
  } else if (mode === 'error') {
    statusDot.classList.add('is-error');
  }
}

function createScene(target, video) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    target.clientWidth / target.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0.1, 5.4);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(target.clientWidth, target.clientHeight);
  target.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambient);

  const point = new THREE.PointLight(0xffffff, 1.4, 20);
  point.position.set(2.2, 2.8, 4.5);
  scene.add(point);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 4.15, 0.14),
    new THREE.MeshPhysicalMaterial({
      color: 0x11151d,
      transparent: true,
      opacity: 0.6,
      roughness: 0.44,
      metalness: 0.16,
      clearcoat: 0.7,
      clearcoatRoughness: 0.3,
    })
  );
  frame.position.z = -0.08;
  scene.add(frame);

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const geometry = new THREE.PlaneGeometry(2.28, 3.82, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.0,
  });

  const avatarMesh = new THREE.Mesh(geometry, material);
  avatarMesh.position.y = 0.02;
  scene.add(avatarMesh);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.05, 0.02, 12, 120),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.42 })
  );
  ring.rotation.x = Math.PI / 2.9;
  ring.position.y = -1.35;
  scene.add(ring);

  const particles = createParticles();
  scene.add(particles);

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  });

  window.addEventListener('resize', () => {
    camera.aspect = target.clientWidth / target.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(target.clientWidth, target.clientHeight);
  });

  return {
    scene,
    camera,
    renderer,
    avatarMesh,
    material,
    frame,
    ring,
    particles,
    pointer,
  };
}

function createParticles() {
  const count = 180;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = 2.4 + Math.random() * 2.6;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 5.8;

    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 0.028,
    color: 0xfff2b0,
    transparent: true,
    opacity: 0.72,
  });

  return new THREE.Points(geometry, material);
}

function animate(time = 0) {
  requestAnimationFrame(animate);

  const t = time * 0.001;
  const { scene, camera, renderer, avatarMesh, frame, ring, particles, pointer } = sceneState;

  avatarMesh.rotation.y += ((pointer.x * 0.18) - avatarMesh.rotation.y) * 0.03;
  avatarMesh.rotation.x += ((-pointer.y * 0.08) - avatarMesh.rotation.x) * 0.03;
  avatarMesh.position.y = Math.sin(t * 1.25) * 0.02;

  frame.rotation.y += ((pointer.x * 0.09) - frame.rotation.y) * 0.025;
  frame.rotation.x += ((-pointer.y * 0.05) - frame.rotation.x) * 0.025;

  ring.rotation.z = t * 0.18;
  particles.rotation.y = t * 0.05;
  particles.rotation.x = Math.sin(t * 0.16) * 0.04;

  renderer.render(scene, camera);
}
