import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';
import { Room } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.4/+esm';

const RUNWAY_AVATAR_ID = 'cc3e04c0-5aef-471a-a95b-1cb25f7dc68e';
const AVATAR_BOUNDS = { width: 2.28, height: 3.82 };

const container = document.getElementById('app');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const audioBtn = document.getElementById('audio-btn');

let room = null;
let activeSessionId = null;
let remoteVideoAttached = false;
let remoteAudioEl = null;
let micEnabled = false;

const videoEl = document.createElement('video');
videoEl.playsInline = true;
videoEl.autoplay = true;
videoEl.muted = true;
videoEl.crossOrigin = 'anonymous';
videoEl.addEventListener('loadedmetadata', updateAvatarVideoLayout);
videoEl.addEventListener('resize', updateAvatarVideoLayout);

const sceneState = createScene(container, videoEl);

setStatus('Ready to connect.');
updateAudioButton();
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

    const res = await fetch('/api/runway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarId: RUNWAY_AVATAR_ID, maxDuration: 300 }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(normalizeError(data, res.status));
    }

    if (!data.serverUrl || !data.token) {
      throw new Error('Runway did not return valid LiveKit credentials.');
    }

    activeSessionId = data.sessionId;
    setStatus('Connecting to LiveKit...');
    await connectToRoom(data.serverUrl, data.token);

    stopBtn.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Failed to start session.', 'error');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    audioBtn.disabled = !remoteAudioEl;
  }
}

async function connectToRoom(serverUrl, token) {
  cleanupRoom();

  room = new Room({
    adaptiveStream: true,
    dynacast: true,
  });

  try {
    if (typeof room.startAudio === 'function') {
      await room.startAudio();
    }
  } catch {
    // Browsers are petty tyrants. We fall back to the audio button.
  }

  room.on('connectionStateChanged', (state) => {
    if (state === 'connected') {
      const waitingText = micEnabled
        ? 'Connected. Waiting for Kartupelis video...'
        : 'Connected. Microphone permission still needed.';
      setStatus(waitingText, remoteVideoAttached ? 'live' : 'default');
      stopBtn.disabled = false;
      updateAudioButton();
      return;
    }

    if (state === 'disconnected') {
      if (activeSessionId) {
        setStatus('Disconnected.', 'default');
      }
      updateAudioButton();
      return;
    }

    setStatus(`Connection: ${state}`);
  });

  room.on('trackSubscribed', async (track) => {
    if (track.kind === 'video') {
      attachVideoTrack(track);
    }

    if (track.kind === 'audio') {
      await attachAudioTrack(track);
    }
  });

  room.on('trackUnsubscribed', (track) => {
    if (track.kind === 'video') {
      remoteVideoAttached = false;
      sceneState.material.opacity = 0.0;
      videoEl.srcObject = null;
    }

    if (track.kind === 'audio') {
      detachAudioTrack();
    }

    updateAudioButton();
  });

  await room.connect(serverUrl, token, { autoSubscribe: true });
  await enableMicrophone();
  await attachExistingTracks();
  updateAudioButton();
}

async function attachExistingTracks() {
  if (!room) return;

  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (!publication?.isSubscribed || !publication.track) continue;

      if (publication.track.kind === 'video') {
        attachVideoTrack(publication.track);
      }

      if (publication.track.kind === 'audio') {
        await attachAudioTrack(publication.track);
      }
    }
  }
}

async function enableMicrophone() {
  if (!room) return;

  try {
    await room.localParticipant.setMicrophoneEnabled(true);
    micEnabled = true;

    if (remoteVideoAttached) {
      setStatus('Kartupelis is live. Microphone connected.', 'live');
    } else {
      setStatus('Microphone connected. Waiting for Kartupelis video...');
    }
  } catch (error) {
    micEnabled = false;
    console.error('Microphone error:', error);
    setStatus('Connected, but microphone permission was blocked.', 'error');
  }
}

function attachVideoTrack(track) {
  if (!track?.mediaStreamTrack) return;

  const stream = new MediaStream([track.mediaStreamTrack]);
  videoEl.srcObject = stream;
  videoEl.play().catch(() => {});
  remoteVideoAttached = true;
  sceneState.material.opacity = 1;
  updateAvatarVideoLayout();

  const liveText = micEnabled
    ? 'Kartupelis is live. Microphone connected.'
    : 'Kartupelis is live. Microphone permission still needed.';
  setStatus(liveText, 'live');
}

async function attachAudioTrack(track) {
  detachAudioTrack();

  if (typeof track.attach === 'function') {
    remoteAudioEl = track.attach();
  } else if (track.mediaStreamTrack) {
    remoteAudioEl = document.createElement('audio');
    remoteAudioEl.srcObject = new MediaStream([track.mediaStreamTrack]);
  } else {
    return;
  }

  remoteAudioEl.autoplay = true;
  remoteAudioEl.playsInline = true;
  remoteAudioEl.volume = 1;
  remoteAudioEl.muted = false;

  try {
    if (room && typeof room.startAudio === 'function') {
      await room.startAudio();
    }
  } catch {
    // Leave the enable audio button available.
  }

  remoteAudioEl.play().catch(() => {});
  updateAudioButton();
}

function detachAudioTrack() {
  if (!remoteAudioEl) return;

  if (typeof remoteAudioEl.pause === 'function') {
    remoteAudioEl.pause();
  }
  remoteAudioEl.srcObject = null;
  if (typeof remoteAudioEl.remove === 'function') {
    remoteAudioEl.remove();
  }
  remoteAudioEl = null;
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
    micEnabled = false;
    sceneState.material.opacity = 0.0;
    sceneState.avatarMesh.scale.set(AVATAR_BOUNDS.width, AVATAR_BOUNDS.height, 1);
    setStatus('Session stopped.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateAudioButton();
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

async function toggleAudio() {
  if (!room) return;

  if (room.canPlaybackAudio === false && typeof room.startAudio === 'function') {
    try {
      await room.startAudio();
    } catch {
      setStatus('Browser blocked audio playback. Tap again to allow it.', 'error');
      return;
    }
  }

  if (!remoteAudioEl) return;

  remoteAudioEl.muted = !remoteAudioEl.muted;
  if (!remoteAudioEl.muted) {
    remoteAudioEl.play().catch(() => {});
  }
  updateAudioButton();
}

function updateAudioButton() {
  if (!room) {
    audioBtn.textContent = 'Unmute';
    audioBtn.disabled = true;
    return;
  }

  if (room.canPlaybackAudio === false) {
    audioBtn.textContent = 'Enable audio';
    audioBtn.disabled = false;
    return;
  }

  if (!remoteAudioEl) {
    audioBtn.textContent = 'Waiting for audio';
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

function normalizeError(data, status) {
  if (!data) return `Request failed with ${status}`;

  if (typeof data === 'string') return data;
  if (typeof data.details === 'string') return data.details;
  if (data.details?.failure) return data.details.failure;
  if (data.details?.error) return data.details.error;
  if (data.error) return data.error;

  try {
    return JSON.stringify(data);
  } catch {
    return `Request failed with ${status}`;
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

  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.0,
  });

  const avatarMesh = new THREE.Mesh(geometry, material);
  avatarMesh.position.y = 0.02;
  avatarMesh.scale.set(AVATAR_BOUNDS.width, AVATAR_BOUNDS.height, 1);
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

function updateAvatarVideoLayout() {
  if (!sceneState?.avatarMesh) return;

  const videoWidth = videoEl.videoWidth || 720;
  const videoHeight = videoEl.videoHeight || 1280;
  const aspect = videoWidth / videoHeight;

  let width = AVATAR_BOUNDS.width;
  let height = width / aspect;

  if (height > AVATAR_BOUNDS.height) {
    height = AVATAR_BOUNDS.height;
    width = height * aspect;
  }

  sceneState.avatarMesh.scale.set(width, height, 1);
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
