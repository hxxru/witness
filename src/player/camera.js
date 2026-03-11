import * as THREE from 'three';
import { tuning } from '../ui/debug-panel.js';

const MAX_LOOK_UP = THREE.MathUtils.degToRad(85);
const MAX_LOOK_DOWN = THREE.MathUtils.degToRad(-60);
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothingFactor(rate, deltaTime) {
  return 1 - Math.exp(-rate * deltaTime);
}

function applyCameraRotation(player) {
  player.camera.rotation.order = 'YXZ';
  player.camera.rotation.x = player.pitch;
  player.camera.rotation.y = player.yaw;
  player.camera.rotation.z = 0;
}

function updateLookFromPointer(player, movementX, movementY) {
  player.yaw += movementX * tuning.player.lookSensitivity;
  player.pitch = clamp(
    player.pitch + movementY * tuning.player.lookSensitivity,
    MAX_LOOK_DOWN,
    MAX_LOOK_UP
  );
  applyCameraRotation(player);
}

function movementInputForPlayer(player) {
  const forward = (player.keys.backward ? 1 : 0) - (player.keys.forward ? 1 : 0);
  const strafe = (player.keys.left ? 1 : 0) - (player.keys.right ? 1 : 0);

  player.moveInput.set(strafe, forward);

  if (player.moveInput.lengthSq() > 1) {
    player.moveInput.normalize();
  }

  return player.moveInput;
}

function tryJump(player) {
  if (!player.grounded) {
    return;
  }

  player.verticalVelocity = Math.sqrt(2 * tuning.player.gravity * tuning.player.jumpHeight);
  player.verticalOffset = Math.max(player.verticalOffset, 0.01);
  player.grounded = false;
}

export function createPlayerCamera(camera, domElement) {
  const player = {
    camera,
    domElement,
    looking: false,
    lookPointerId: null,
    lastPointerX: 0,
    lastPointerY: 0,
    yaw: 0,
    pitch: 0,
    mode: 'land',
    eyeHeight: 0,
    bounds: null,
    keys: {
      forward: false,
      backward: false,
      left: false,
      right: false,
    },
    velocity: new THREE.Vector2(),
    moveInput: new THREE.Vector2(),
    moveDelta: new THREE.Vector3(),
    verticalOffset: 0,
    verticalVelocity: 0,
    grounded: true,
  };

  const clearMovementKeys = () => {
    player.keys.forward = false;
    player.keys.backward = false;
    player.keys.left = false;
    player.keys.right = false;
  };

  const onPointerMove = (event) => {
    if (!player.looking || event.pointerId !== player.lookPointerId) {
      return;
    }

    const movementX = event.clientX - player.lastPointerX;
    const movementY = event.clientY - player.lastPointerY;
    player.lastPointerX = event.clientX;
    player.lastPointerY = event.clientY;

    updateLookFromPointer(player, movementX, movementY);
  };

  const onKeyChange = (pressed) => (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (!MOVEMENT_KEYS.has(event.code)) {
      if (pressed && event.code === 'Space') {
        const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
          return;
        }

        tryJump(player);
        event.preventDefault();
      }

      return;
    }

    const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
      return;
    }

    if (event.code === 'KeyW') {
      player.keys.forward = pressed;
    } else if (event.code === 'KeyS') {
      player.keys.backward = pressed;
    } else if (event.code === 'KeyA') {
      player.keys.left = pressed;
    } else if (event.code === 'KeyD') {
      player.keys.right = pressed;
    }

    event.preventDefault();
  };

  const onCanvasPointerDown = (event) => {
    if (event.button !== 2) {
      return;
    }

    player.looking = true;
    player.lookPointerId = event.pointerId;
    player.lastPointerX = event.clientX;
    player.lastPointerY = event.clientY;
    domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const stopLooking = (event) => {
    if (event.pointerId !== player.lookPointerId) {
      return;
    }

    player.looking = false;
    player.lookPointerId = null;

    if (domElement.hasPointerCapture?.(event.pointerId)) {
      domElement.releasePointerCapture(event.pointerId);
    }
  };

  const onContextMenu = (event) => {
    event.preventDefault();
  };

  const onWindowBlur = () => {
    clearMovementKeys();
    player.looking = false;
    player.lookPointerId = null;
  };

  const onKeyDown = onKeyChange(true);
  const onKeyUp = onKeyChange(false);

  domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  domElement.addEventListener('pointerdown', onCanvasPointerDown);
  domElement.addEventListener('pointerup', stopLooking);
  domElement.addEventListener('pointercancel', stopLooking);
  domElement.addEventListener('contextmenu', onContextMenu);

  applyCameraRotation(player);

  player.dispose = () => {
    domElement.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    domElement.removeEventListener('pointerdown', onCanvasPointerDown);
    domElement.removeEventListener('pointerup', stopLooking);
    domElement.removeEventListener('pointercancel', stopLooking);
    domElement.removeEventListener('contextmenu', onContextMenu);
  };

  return player;
}

export function setPlayerSpawn(player, spawnState) {
  player.mode = spawnState.mode;
  player.eyeHeight = spawnState.cameraLocalOffset.y;
  player.bounds = spawnState.bounds;
  player.velocity.set(0, 0);
  player.moveInput.set(0, 0);
  player.verticalOffset = 0;
  player.verticalVelocity = 0;
  player.grounded = true;

  if (spawnState.mode === 'land') {
    player.camera.position.set(
      spawnState.worldOrigin.x + spawnState.cameraLocalOffset.x,
      spawnState.worldOrigin.y + spawnState.cameraLocalOffset.y,
      spawnState.worldOrigin.z + spawnState.cameraLocalOffset.z
    );
    return;
  }

  player.camera.position.set(
    spawnState.cameraLocalOffset.x,
    spawnState.cameraLocalOffset.y,
    spawnState.cameraLocalOffset.z
  );
}

export function lookPlayerAt(player, observerPosition, targetPosition) {
  const direction = targetPosition.clone().sub(observerPosition).normalize();
  player.pitch = clamp(Math.asin(clamp(direction.y, -1, 1)), MAX_LOOK_DOWN, MAX_LOOK_UP);
  player.yaw = Math.atan2(direction.x, direction.z);
  applyCameraRotation(player);
}

export function updatePlayer(player, { terrain = null, spawnState = null, deltaTime = 0 } = {}) {
  if (!spawnState) {
    return;
  }

  const input = movementInputForPlayer(player);
  const desiredVelocity = new THREE.Vector2(
    input.x * tuning.player.moveSpeed,
    input.y * tuning.player.moveSpeed
  );

  if (input.lengthSq() > 0) {
    player.velocity.lerp(desiredVelocity, smoothingFactor(tuning.player.acceleration, deltaTime));
  } else {
    player.velocity.multiplyScalar(Math.exp(-tuning.player.damping * deltaTime));
  }

  const forwardX = Math.sin(player.yaw);
  const forwardZ = Math.cos(player.yaw);
  const rightX = -Math.cos(player.yaw);
  const rightZ = Math.sin(player.yaw);

  player.moveDelta.set(
    (rightX * player.velocity.x + forwardX * player.velocity.y) * deltaTime,
    0,
    (rightZ * player.velocity.x + forwardZ * player.velocity.y) * deltaTime
  );

  if (!player.grounded) {
    player.verticalVelocity -= tuning.player.gravity * deltaTime;
    player.verticalOffset += player.verticalVelocity * deltaTime;
  }

  if (spawnState.mode === 'land') {
    const nextX = player.camera.position.x + player.moveDelta.x;
    const nextZ = player.camera.position.z + player.moveDelta.z;
    const groundY = terrain ? terrain.heightAt(nextX, nextZ) : 0;
    const nextY = groundY + player.eyeHeight + player.verticalOffset;

    if (nextY <= groundY + player.eyeHeight) {
      player.verticalOffset = 0;
      player.verticalVelocity = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    player.camera.position.set(nextX, groundY + player.eyeHeight + player.verticalOffset, nextZ);
    return;
  }

  const bounds = player.bounds ?? spawnState.bounds;
  const unclampedX = player.camera.position.x + player.moveDelta.x;
  const unclampedZ = player.camera.position.z + player.moveDelta.z;
  const clampedX = clamp(unclampedX, bounds.minX, bounds.maxX);
  const clampedZ = clamp(unclampedZ, bounds.minZ, bounds.maxZ);

  if (clampedX !== unclampedX) {
    player.velocity.x = 0;
  }

  if (clampedZ !== unclampedZ) {
    player.velocity.y = 0;
  }

  if (player.eyeHeight + player.verticalOffset <= player.eyeHeight) {
    player.verticalOffset = 0;
    player.verticalVelocity = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  player.camera.position.set(clampedX, player.eyeHeight + player.verticalOffset, clampedZ);
}
