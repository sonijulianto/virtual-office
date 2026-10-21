/**
 * Virtual Office AI Agent - Realistic Isometric Cutaway 3D Office
 * Fixed & Calibrated:
 * - Exact Chair & Sofa World-Matrix Seat Anchors (characters sit centered on chairs facing laptops)
 * - Articulated 2-segment legs (Thigh + Knee + Lower Leg) for realistic 90-degree seated posture
 * - Hands positioned directly over laptop keyboards when typing
 */

let scene, camera, renderer, controls;
let targetCameraPos = null, targetCameraLookAt = null;
let activeRoom = "overview";
let forceBreakMode = false;

const avatars = {};
const deskSeats = [];
const sofaSeats = [];

// Socket.io Client
const socket = io({ path: "/socket.io" });

// Camera Presets
const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(-22, 24, 24),
    target: new THREE.Vector3(0, 1.5, 0)
  },
  devroom: {
    pos: new THREE.Vector3(-4.5, 12, 8.5),
    target: new THREE.Vector3(-1.6, 1.8, -6.9)
  },
  workspace: {
    pos: new THREE.Vector3(-4.5, 12, 8.5),
    target: new THREE.Vector3(-1.6, 1.8, -6.9)
  },
  manager: {
    pos: new THREE.Vector3(2, 11, 8),
    target: new THREE.Vector3(10.8, 2.0, -7.2)
  },
  lounge: {
    pos: new THREE.Vector3(-14, 10, 18),
    target: new THREE.Vector3(-4, 1.5, 8)
  },
  pantry: {
    pos: new THREE.Vector3(-6, 10, -1),
    target: new THREE.Vector3(-12, 1.8, -9)
  }
};

// Office Activity Destinations for Autonomous Walking (Jalan-Jalan)
let ROAM_SPOTS = [];

/* =========================================================================
   1. PROCEDURAL WOOD FLOOR TEXTURE & MATERIALS
   ========================================================================= */
function createWoodFloorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ead2b3";
  ctx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const plankH = 512 / rows;
  const tones = ["#ead2b3", "#e5c9a6", "#efdac0", "#dfc19b", "#e8cfa9"];

  for (let r = 0; r < rows; r++) {
    const y = r * plankH;
    const cols = 4;
    const offset = (r % 2) * 64;

    for (let c = -1; c < cols + 1; c++) {
      const x = c * 128 + offset;
      ctx.fillStyle = tones[(r * 3 + c + 10) % tones.length];
      ctx.fillRect(x, y, 128, plankH);

      ctx.strokeStyle = "rgba(160, 120, 80, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + plankH * 0.35);
      ctx.lineTo(x + 128, y + plankH * 0.4);
      ctx.moveTo(x, y + plankH * 0.7);
      ctx.lineTo(x + 128, y + plankH * 0.65);
      ctx.stroke();

      ctx.strokeStyle = "rgba(130, 95, 60, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, 128, plankH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  return tex;
}

function mat(colorHex, roughness = 0.75, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color: colorHex, roughness, metalness });
}

/* =========================================================================
   2. THREE.JS SCENE & DYNAMIC TIME-OF-DAY ATMOSPHERE SYSTEM
   ========================================================================= */
let hemiLight, sunLight, fillLight;
let pantryLight, loungeLight, officeCenterLight, managerLight;
let starfieldPoints, starfieldMat;
let currentAtmosphereMode = "auto"; // "auto" | "morning" | "noon" | "sunset" | "night"
let activeAtmosphereKey = "sunset";

const ATMOSPHERE_PRESETS = {
  morning: {
    id: "morning",
    name: "Pagi",
    icon: "🌅",
    tagline: "Pagi Cerah & Sejuk (06:00 - 11:00)",
    skyColor: new THREE.Color(0xdcecfb),
    hemiSky: new THREE.Color(0xdbeafe),
    hemiGround: new THREE.Color(0xfef3c7),
    hemiIntensity: 0.85,
    sunColor: new THREE.Color(0xffeed6),
    sunIntensity: 1.25,
    sunPos: new THREE.Vector3(-22, 18, 14),
    fillColor: new THREE.Color(0xbfdbfe),
    fillIntensity: 0.5,
    indoorColor: new THREE.Color(0xffedd5),
    indoorIntensity: 0.65,
    exposure: 1.15,
    starsOpacity: 0.0
  },
  noon: {
    id: "noon",
    name: "Siang",
    icon: "☀️",
    tagline: "Siang Terang Benderang (11:00 - 15:30)",
    skyColor: new THREE.Color(0x93c5fd),
    hemiSky: new THREE.Color(0xffffff),
    hemiGround: new THREE.Color(0xe2e8f0),
    hemiIntensity: 0.95,
    sunColor: new THREE.Color(0xffffff),
    sunIntensity: 1.45,
    sunPos: new THREE.Vector3(-16, 30, 16),
    fillColor: new THREE.Color(0xe0f2fe),
    fillIntensity: 0.55,
    indoorColor: new THREE.Color(0xfff7ed),
    indoorIntensity: 0.5,
    exposure: 1.2,
    starsOpacity: 0.0
  },
  sunset: {
    id: "sunset",
    name: "Sore",
    icon: "🌇",
    tagline: "Senja / Golden Hour (15:30 - 18:45)",
    skyColor: new THREE.Color(0xfb923c),
    hemiSky: new THREE.Color(0xfdba74),
    hemiGround: new THREE.Color(0x9a3412),
    hemiIntensity: 0.75,
    sunColor: new THREE.Color(0xff7043),
    sunIntensity: 1.35,
    sunPos: new THREE.Vector3(-26, 12, 18),
    fillColor: new THREE.Color(0xf472b6),
    fillIntensity: 0.6,
    indoorColor: new THREE.Color(0xffedd5),
    indoorIntensity: 1.15,
    exposure: 1.1,
    starsOpacity: 0.0
  },
  night: {
    id: "night",
    name: "Malam",
    icon: "🌙",
    tagline: "Malam Tenang & Cozy Lampu Kantor (18:45 - 06:00)",
    skyColor: new THREE.Color(0x060b18),
    hemiSky: new THREE.Color(0x1e293b),
    hemiGround: new THREE.Color(0x0f172a),
    hemiIntensity: 0.28,
    sunColor: new THREE.Color(0x93c5fd),
    sunIntensity: 0.38,
    sunPos: new THREE.Vector3(-14, 24, 12),
    fillColor: new THREE.Color(0x1e3a8a),
    fillIntensity: 0.25,
    indoorColor: new THREE.Color(0xfef08a),
    indoorIntensity: 1.85,
    exposure: 1.05,
    starsOpacity: 0.95
  }
};

function getAtmosphereFromCurrentTime(date = new Date()) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const decimalHour = hours + minutes / 60;

  if (decimalHour >= 5.5 && decimalHour < 11.0) {
    return "morning";
  } else if (decimalHour >= 11.0 && decimalHour < 15.5) {
    return "noon";
  } else if (decimalHour >= 15.5 && decimalHour < 18.75) {
    return "sunset";
  } else {
    return "night";
  }
}

function init3D() {
  const container = document.getElementById("canvas-container");

  activeAtmosphereKey = getAtmosphereFromCurrentTime();
  const initPreset = ATMOSPHERE_PRESETS[activeAtmosphereKey];

  scene = new THREE.Scene();
  scene.background = initPreset.skyColor.clone();

  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 150);
  camera.position.copy(CAMERA_PRESETS.overview.pos);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = initPreset.exposure;
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 5;
  controls.maxDistance = 60;
  controls.target.copy(CAMERA_PRESETS.overview.target);

  setupOfficeLighting();
  buildCutawayOffice();
  initRoamSpots();
  spawnOfficeCharacters();
  updateAtmosphereUI();

  window.addEventListener("resize", onWindowResize);
  animate();
}

function setupOfficeLighting() {
  const initPreset = ATMOSPHERE_PRESETS[activeAtmosphereKey];

  hemiLight = new THREE.HemisphereLight(initPreset.hemiSky, initPreset.hemiGround, initPreset.hemiIntensity);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(initPreset.sunColor, initPreset.sunIntensity);
  sunLight.position.copy(initPreset.sunPos);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 70;
  sunLight.shadow.camera.left = -22;
  sunLight.shadow.camera.right = 22;
  sunLight.shadow.camera.top = 22;
  sunLight.shadow.camera.bottom = -22;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.radius = 2.5;
  scene.add(sunLight);

  fillLight = new THREE.DirectionalLight(initPreset.fillColor, initPreset.fillIntensity);
  fillLight.position.set(20, 16, -15);
  scene.add(fillLight);

  pantryLight = new THREE.PointLight(initPreset.indoorColor, initPreset.indoorIntensity, 16);
  pantryLight.position.set(-12, 4.5, -9);
  scene.add(pantryLight);

  loungeLight = new THREE.PointLight(initPreset.indoorColor, initPreset.indoorIntensity, 16);
  loungeLight.position.set(-6, 4.5, 8);
  scene.add(loungeLight);

  // Lampu gantung tengah kantor & ruang manager
  officeCenterLight = new THREE.PointLight(initPreset.indoorColor, initPreset.indoorIntensity, 24);
  officeCenterLight.position.set(0, 5.0, 0);
  scene.add(officeCenterLight);

  managerLight = new THREE.PointLight(initPreset.indoorColor, initPreset.indoorIntensity, 16);
  managerLight.position.set(8.5, 4.5, -6.5);
  scene.add(managerLight);

  // Taburan bintang di langit malam (muncul lembut saat malam hari)
  const starsGeo = new THREE.BufferGeometry();
  const starCount = 380;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * (Math.PI / 2.3);
    const radius = 42 + Math.random() * 22;
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) + 4;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starfieldMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.65,
    transparent: true,
    opacity: initPreset.starsOpacity,
    sizeAttenuation: true
  });
  starfieldPoints = new THREE.Points(starsGeo, starfieldMat);
  scene.add(starfieldPoints);
}

function updateAtmosphere(delta) {
  const now = new Date();
  const clockEl = document.getElementById("atmosphere-clock");
  if (clockEl) {
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    clockEl.innerText = `${hh}:${mm} WIB`;
  }

  if (currentAtmosphereMode === "auto") {
    const key = getAtmosphereFromCurrentTime(now);
    if (key !== activeAtmosphereKey) {
      activeAtmosphereKey = key;
      updateAtmosphereUI();
    }
  }

  const preset = ATMOSPHERE_PRESETS[activeAtmosphereKey];
  if (!preset || !scene || !hemiLight || !sunLight) return;

  const lerpRate = Math.min(1, delta * 2.8);

  // 1. Warna Langit (Scene Background)
  scene.background.lerp(preset.skyColor, lerpRate);

  // 2. Cahaya Hemisphere (Langit & Pantulan Tanah)
  hemiLight.color.lerp(preset.hemiSky, lerpRate);
  hemiLight.groundColor.lerp(preset.hemiGround, lerpRate);
  hemiLight.intensity = dampVal(hemiLight.intensity, preset.hemiIntensity, 2.8, delta);

  // 3. Sinar Matahari / Bulan Utama & Posisi Sudut
  sunLight.color.lerp(preset.sunColor, lerpRate);
  sunLight.intensity = dampVal(sunLight.intensity, preset.sunIntensity, 2.8, delta);
  sunLight.position.lerp(preset.sunPos, lerpRate);

  // 4. Fill Light
  if (fillLight) {
    fillLight.color.lerp(preset.fillColor, lerpRate);
    fillLight.intensity = dampVal(fillLight.intensity, preset.fillIntensity, 2.8, delta);
  }

  // 5. Lampu Interior Ruangan Kantor (Pantry, Lounge, Center, Manager Room)
  if (pantryLight) {
    pantryLight.color.lerp(preset.indoorColor, lerpRate);
    pantryLight.intensity = dampVal(pantryLight.intensity, preset.indoorIntensity, 2.8, delta);
  }
  if (loungeLight) {
    loungeLight.color.lerp(preset.indoorColor, lerpRate);
    loungeLight.intensity = dampVal(loungeLight.intensity, preset.indoorIntensity, 2.8, delta);
  }
  if (officeCenterLight) {
    officeCenterLight.color.lerp(preset.indoorColor, lerpRate);
    officeCenterLight.intensity = dampVal(officeCenterLight.intensity, preset.indoorIntensity, 2.8, delta);
  }
  if (managerLight) {
    managerLight.color.lerp(preset.indoorColor, lerpRate);
    managerLight.intensity = dampVal(managerLight.intensity, preset.indoorIntensity, 2.8, delta);
  }

  // 6. Taburan Bintang di Langit Malam
  if (starfieldMat && starfieldPoints) {
    starfieldMat.opacity = dampVal(starfieldMat.opacity, preset.starsOpacity, 2.8, delta);
    if (starfieldMat.opacity > 0.02) {
      starfieldPoints.rotation.y += delta * 0.003;
    }
  }

  // 7. Kamera Exposure
  if (renderer) {
    renderer.toneMappingExposure = dampVal(renderer.toneMappingExposure, preset.exposure, 2.8, delta);
  }
}

function updateAtmosphereUI() {
  const preset = ATMOSPHERE_PRESETS[activeAtmosphereKey];
  if (!preset) return;

  const iconEl = document.getElementById("atmosphere-icon");
  if (iconEl) iconEl.innerText = preset.icon;

  const pillEl = document.getElementById("atmosphere-pill");
  if (pillEl) {
    pillEl.className = `status-pill atmosphere-pill mode-${activeAtmosphereKey}`;
    pillEl.title = `Suasana Kantor: ${preset.name} (${preset.tagline})`;
  }
}

/* =========================================================================
   3. CUTAWAY OFFICE ARCHITECTURE
   ========================================================================= */
function buildCutawayOffice() {
  const woodTex = createWoodFloorTexture();
  const floorTopMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.65, metalness: 0.05 });
  const slabSideMat = mat(0xd6c7b2, 0.9);

  const floorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.6, 26),
    [slabSideMat, slabSideMat, floorTopMat, slabSideMat, slabSideMat, slabSideMat]
  );
  floorSlab.position.set(0, -0.3, 0);
  floorSlab.receiveShadow = true;
  scene.add(floorSlab);

  buildExteriorWallsWithWindows();
  buildBlackGlassPartitions();
  buildDeveloperRoom();
  buildOpenWorkstations();
  buildManagerRoom();
  buildConferenceRoom();
  buildPantryArea();
  buildBilliardAndSofaLounge();
  buildDecorAndPlants();
}

function buildExteriorWallsWithWindows() {
  const wallMat = mat(0xf7f4ef, 0.85);
  const frameMat = mat(0x27272a, 0.4, 0.5);
  const skyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.35,
    roughness: 0.1,
    transmission: 0.6
  });

  // BACK WALL (z = -13)
  const backLow = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 0.4), wallMat);
  backLow.position.set(0, 0.6, -13);
  backLow.castShadow = true;
  backLow.receiveShadow = true;
  scene.add(backLow);

  const backHigh = new THREE.Mesh(new THREE.BoxGeometry(34, 1.0, 0.4), wallMat);
  backHigh.position.set(0, 5.0, -13);
  backHigh.castShadow = true;
  scene.add(backHigh);

  [-16.5, -6, 5, 16.5].forEach(px => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.3, 0.42), wallMat);
    pillar.position.set(px, 2.85, -13);
    pillar.castShadow = true;
    scene.add(pillar);
  });

  [[-11.25, 9.5], [-0.5, 10.0], [10.75, 10.5]].forEach(([wx, ww]) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(ww, 3.3, 0.1), skyGlassMat);
    glass.position.set(wx, 2.85, -13);
    scene.add(glass);

    const topF = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.1, 0.18), frameMat);
    topF.position.set(wx, 4.45, -13);
    scene.add(topF);
    const botF = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.1, 0.18), frameMat);
    botF.position.set(wx, 1.25, -13);
    scene.add(botF);

    for (let i = -1; i <= 1; i++) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.3, 0.16), frameMat);
      mullion.position.set(wx + i * (ww / 3), 2.85, -13);
      scene.add(mullion);
    }
  });

  // LEFT WALL (x = -17)
  const leftLow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 26), wallMat);
  leftLow.position.set(-17, 0.6, 0);
  leftLow.castShadow = true;
  leftLow.receiveShadow = true;
  scene.add(leftLow);

  const leftHigh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 26), wallMat);
  leftHigh.position.set(-17, 5.0, 0);
  scene.add(leftHigh);

  [-12.5, -2, 12.5].forEach(pz => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 3.3, 1.0), wallMat);
    pillar.position.set(-17, 2.85, pz);
    pillar.castShadow = true;
    scene.add(pillar);
  });

  [[-7.25, 9.5], [5.25, 13.5]].forEach(([wz, wd]) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.3, wd), skyGlassMat);
    glass.position.set(-17, 2.85, wz);
    scene.add(glass);

    const topF = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, wd), frameMat);
    topF.position.set(-17, 4.45, wz);
    scene.add(topF);
    const botF = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, wd), frameMat);
    botF.position.set(-17, 1.25, wz);
    scene.add(botF);
  });
}

/* =========================================================================
   4. BLACK-FRAMED GLASS PARTITIONS (SEKAT KACA)
   ========================================================================= */
function buildBlackGlassPartitions() {
  // Manager Room West Wall along x = 5.5 (Directly facing the wide 3.1m East Corridor):
  // North section: z = -13.0 to -8.0
  createFramedGlassWall(5.5, -10.5, 5.0, "z");
  // South section: z = -5.5 to -1.5
  createFramedGlassWall(5.5, -3.5, 4.0, "z");
  // (Note: Open doorway between z = -8.0 and -5.5 gives Budi unobstructed, direct access to the East Corridor!)

  // Conference Room West Wall along x = 5.5 (z = 1.0 to 12.0):
  createFramedGlassWall(5.5, 6.5, 11.0, "z");

  // Manager Room / Conference Room Divider Wall along z = -1.5:
  createFramedGlassWall(11.15, -1.5, 11.3, "x");

  // Conference Room South Wall along z = 12.5:
  createFramedGlassWall(10.0, 12.5, 9.0, "x");
}

function createFramedGlassWall(cx, cz, length, axis) {
  const h = 3.8;
  const frameMat = mat(0x18181b, 0.3, 0.7);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.28,
    roughness: 0.08,
    transmission: 0.75
  });

  const group = new THREE.Group();
  const isX = axis === "x";
  const w = isX ? length : 0.08;
  const d = isX ? 0.08 : length;

  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat);
  glass.position.y = h / 2;
  group.add(glass);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(isX ? length : 0.14, 0.1, isX ? 0.14 : length), frameMat);
  topRail.position.y = h;
  group.add(topRail);

  const botRail = new THREE.Mesh(new THREE.BoxGeometry(isX ? length : 0.14, 0.1, isX ? 0.14 : length), frameMat);
  botRail.position.y = 0.05;
  group.add(botRail);

  const segments = Math.max(2, Math.round(length / 2.5));
  for (let i = 0; i <= segments; i++) {
    const offset = -length / 2 + (i * length) / segments;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), frameMat);
    post.position.set(isX ? offset : 0, h / 2, isX ? 0 : offset);
    post.castShadow = true;
    group.add(post);
  }

  group.position.set(cx, 0, cz);
  scene.add(group);
}

/* =========================================================================
   5. CALIBRATED DESK & CHAIR UNITS (RETURNS EXACT WORLD SEAT MATRIX)
   ========================================================================= */
function createWoodenDeskUnit(x, z, rotY = 0) {
  const group = new THREE.Group();
  const oakMat = mat(0xdcb88e, 0.65);
  const legMat = mat(0xc8a276, 0.7);

  // Tabletop (y = 1.45)
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.35), oakMat);
  top.position.y = 1.45;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // 4 Wooden Legs
  [[-1.15, -0.55], [1.15, -0.55], [-1.15, 0.55], [1.15, 0.55]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.45, 0.12), legMat);
    leg.position.set(lx, 0.725, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  // Black Laptop on Desk (Keyboard closer to +z where user sits, screen at -z facing +z)
  const laptopMat = mat(0x18181b, 0.4, 0.3);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

  const lBase = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.45), laptopMat);
  lBase.position.set(0, 1.53, 0.22);
  group.add(lBase);

  const lLid = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.44, 0.04), laptopMat);
  lLid.position.set(0, 1.74, 0.0);
  lLid.rotation.x = -0.18;
  lLid.castShadow = true;
  group.add(lLid);

  const lGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), screenMat);
  lGlow.position.set(0, 1.74, 0.025);
  lGlow.rotation.x = -0.18;
  group.add(lGlow);

  // White Notepad on Desk
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.42), mat(0xffffff, 0.9));
  pad.position.set(0.72, 1.52, 0.22);
  group.add(pad);

  // Rolling Black Office Chair placed at local (0, 0, +0.86) facing the desk (-z)
  const chair = createRollingOfficeChair();
  chair.position.set(0, 0, 0.86);
  // Chair's backrest is built at +z, so rotation.y = 0 makes the chair face -z (towards the laptop!)
  chair.rotation.y = 0;
  group.add(chair);

  // Exact Seat Anchor Marker right on the center of the chair cushion
  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0, 0.82); // Slightly forward of backrest, centered on seat cushion
  group.add(seatAnchor);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  // Compute exact world coordinates of the chair seat
  group.updateMatrixWorld(true);
  const worldSeatPos = new THREE.Vector3();
  seatAnchor.getWorldPosition(worldSeatPos);

  // Character faces local +z, so to look towards desk (-z in desk space), character rotation is rotY + Math.PI
  const worldSeatRotY = rotY + Math.PI;

  return {
    seatPos: worldSeatPos,
    seatRotY: worldSeatRotY
  };
}

function createRollingOfficeChair() {
  const chair = new THREE.Group();
  const blackFabric = mat(0x273549, 0.85);
  const metalMat = mat(0x1e293b, 0.3, 0.7);

  // Seat cushion (centered at 0, 0.85, 0 -> top surface at y = 0.91)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.82), blackFabric);
  seat.position.y = 0.85;
  seat.castShadow = true;
  seat.receiveShadow = true;
  chair.add(seat);

  // Backrest at +z (+0.36) so the chair opens towards -z (the desk)!
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.95, 0.12), blackFabric);
  back.position.set(0, 1.38, 0.36);
  back.rotation.x = 0.08;
  back.castShadow = true;
  chair.add(back);

  // Armrests
  [-0.44, 0.44].forEach(ax => {
    const armV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), metalMat);
    armV.position.set(ax, 1.02, 0.05);
    chair.add(armV);
    const armH = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.46), blackFabric);
    armH.position.set(ax, 1.18, 0.05);
    chair.add(armH);
  });

  // Hydraulic post & 5-star wheel base
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 10), metalMat);
  post.position.y = 0.48;
  chair.add(post);

  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.45), metalMat);
    leg.position.set(Math.sin(angle) * 0.2, 0.12, Math.cos(angle) * 0.2);
    leg.rotation.y = angle;
    chair.add(leg);

    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), metalMat);
    wheel.position.set(Math.sin(angle) * 0.4, 0.06, Math.cos(angle) * 0.4);
    chair.add(wheel);
  }

  return chair;
}

/* =========================================================================
   5. PROCEDURAL TEXTURES FOR DEV LAB & WORKSTATIONS
   ========================================================================= */
function createDevCodeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");

  // VS Code / JetBrains Dark Theme
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, 0, 512, 320);

  // Tab & Header Bar
  ctx.fillStyle = "#181825";
  ctx.fillRect(0, 0, 512, 28);
  
  // Mac-style Window Buttons
  ctx.fillStyle = "#f38ba8";
  ctx.beginPath(); ctx.arc(14, 14, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f9e2af";
  ctx.beginPath(); ctx.arc(28, 14, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a6e3a1";
  ctx.beginPath(); ctx.arc(42, 14, 5, 0, Math.PI * 2); ctx.fill();

  // Active Tab
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(60, 4, 140, 24);
  ctx.fillStyle = "#89b4fa";
  ctx.font = "bold 11px monospace";
  ctx.fillText("📄 main.dart", 74, 20);

  // Inactive Tab
  ctx.fillStyle = "#6c7086";
  ctx.font = "11px monospace";
  ctx.fillText("api_service.dart", 215, 20);

  // Line Numbers Gutter
  ctx.fillStyle = "#181825";
  ctx.fillRect(0, 28, 36, 268);
  ctx.fillStyle = "#585b70";
  ctx.font = "10px monospace";
  for (let i = 1; i <= 14; i++) {
    ctx.fillText(i < 10 ? ` ${i}` : `${i}`, 8, 32 + i * 18);
  }

  // Syntax Highlighted Code Lines
  const lines = [
    { text: "import 'package:flutter/material.dart';", color: "#a6e3a1" },
    { text: "import 'package:hermes/engine.dart';", color: "#a6e3a1" },
    { text: "", color: "#cdd6f4" },
    { text: "class DevWorkspace extends State {", color: "#cba6f7" },
    { text: "  final hermes = HermesAgent.local();", color: "#89b4fa" },
    { text: "  late final StreamSocket client;", color: "#89b4fa" },
    { text: "", color: "#cdd6f4" },
    { text: "  @override", color: "#fab387" },
    { text: "  void initState() {", color: "#f9e2af" },
    { text: "    super.initState();", color: "#cdd6f4" },
    { text: "    hermes.connectWorkspace(port: 8000);", color: "#89dceb" },
    { text: "    hermes.onToolExecution((tool) => {", color: "#a6e3a1" },
    { text: "      print('[Hermes] Tool: ${tool.name}');", color: "#fab387" },
    { text: "    });", color: "#cdd6f4" }
  ];

  lines.forEach((line, idx) => {
    ctx.fillStyle = line.color;
    ctx.font = "11px monospace";
    ctx.fillText(line.text, 44, 48 + idx * 18);
  });

  // Bottom Status Bar
  ctx.fillStyle = "#89b4fa";
  ctx.fillRect(0, 296, 512, 24);
  ctx.fillStyle = "#11111b";
  ctx.font = "bold 11px monospace";
  ctx.fillText("⚡ HERMES DEV • BRANCH: main* • DART 3.4.2 • UTF-8", 12, 312);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createDevTerminalTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");

  // Terminal Background
  ctx.fillStyle = "#0c1017";
  ctx.fillRect(0, 0, 256, 400);

  // Terminal Header
  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, 256, 24);
  ctx.fillStyle = "#58a6ff";
  ctx.font = "bold 10px monospace";
  ctx.fillText("🖥️ bash - flutter run (macos)", 10, 16);

  const logs = [
    { text: "$ cd /Users/magnatech/project", color: "#7ee787" },
    { text: "$ flutter run -d macos", color: "#7ee787" },
    { text: "Building macOS app...", color: "#8b949e" },
    { text: "✓ Built build/macos/Debug", color: "#58a6ff" },
    { text: "Syncing files to device...", color: "#8b949e" },
    { text: "Flutter run key commands:", color: "#d29922" },
    { text: "r Hot reload • R Hot restart", color: "#d29922" },
    { text: "----------------------------", color: "#30363d" },
    { text: "[Hermes AI Core] Connected", color: "#3fb950" },
    { text: "[Socket.IO] :8000 ACK", color: "#58a6ff" },
    { text: "Agent: Faisal -> One-Asco OK", color: "#79c0ff" },
    { text: "Agent: Syaugi -> TPF POS OK", color: "#79c0ff" },
    { text: "Agent: Guntara -> Pivore OK", color: "#79c0ff" },
    { text: "Agent: Alex -> Lead System OK", color: "#bc8cff" },
    { text: "Listening on ws://0.0.0.0:8000", color: "#56d364" },
    { text: "[Watchdog] 0 errors, 0 lint", color: "#3fb950" },
    { text: "Dev Lab is ready ⚡", color: "#f0883e" },
    { text: "user@hermes-dev:~$ █", color: "#58a6ff" }
  ];

  logs.forEach((log, idx) => {
    ctx.fillStyle = log.color;
    ctx.font = "9.5px monospace";
    ctx.fillText(log.text, 8, 42 + idx * 19);
  });

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function formatRupiahJs(num) {
  return "Rp " + Math.round(num || 0).toLocaleString("id-ID");
}

let lisaScreenMat1 = null;
let lisaScreenMat2 = null;

function updateLisaDeskMonitors(summary, latestTrx) {
  if (lisaScreenMat1) {
    lisaScreenMat1.map = createFinanceDeskTexture(summary);
    lisaScreenMat1.needsUpdate = true;
  }
  if (lisaScreenMat2) {
    lisaScreenMat2.map = createFinanceLedgerTexture(summary, latestTrx);
    lisaScreenMat2.needsUpdate = true;
  }
}

function createFinanceDeskTexture(summary = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");

  // Modern Fintech Dark Canvas
  ctx.fillStyle = "#0a1912";
  ctx.fillRect(0, 0, 512, 320);

  // Header Bar with Emerald Accent
  ctx.fillStyle = "#064e3b";
  ctx.fillRect(0, 0, 512, 32);

  ctx.fillStyle = "#34d399";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("💰 BANK RECONCILIATION DASHBOARD • BCA & BRI", 12, 21);

  ctx.fillStyle = "#a7f3d0";
  ctx.font = "10px monospace";
  ctx.fillText("sonijulianto@gmail.com | Auto-Sync", 320, 21);

  const incAmt = summary ? (summary.total_incoming || 0) : 0;
  const outAmt = summary ? (summary.total_outgoing || 0) : 0;
  const netAmt = summary ? (summary.net_cashflow || 0) : 0;

  // KPI Card 1: Pemasukan (Green)
  ctx.fillStyle = "#065f46";
  ctx.fillRect(12, 42, 155, 52);
  ctx.fillStyle = "#6ee7b7";
  ctx.font = "bold 10px sans-serif";
  ctx.fillText("TOTAL PEMASUKAN", 18, 57);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.fillText(formatRupiahJs(incAmt), 18, 80);

  // KPI Card 2: Pengeluaran (Red)
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(177, 42, 155, 52);
  ctx.fillStyle = "#fca5a5";
  ctx.font = "bold 10px sans-serif";
  ctx.fillText("TOTAL PEMBAYARAN", 183, 57);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.fillText(formatRupiahJs(outAmt), 183, 80);

  // KPI Card 3: Net Cashflow (Cyan/Gold)
  ctx.fillStyle = "#0f3a3a";
  ctx.fillRect(342, 42, 158, 52);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 10px sans-serif";
  ctx.fillText("NET SURPLUS", 348, 57);
  ctx.fillStyle = netAmt >= 0 ? "#34d399" : "#f87171";
  ctx.font = "bold 14px monospace";
  ctx.fillText((netAmt > 0 ? "+" : "") + formatRupiahJs(netAmt), 348, 80);

  // Transaction Ledger Table
  ctx.fillStyle = "#064e3b";
  ctx.fillRect(12, 102, 488, 20);
  ctx.fillStyle = "#d1fae5";
  ctx.font = "bold 10px monospace";
  ctx.fillText("BANK   KATEGORI / DESKRIPSI              NOMINAL       WAKTU", 16, 116);

  let trxs = [];
  if (summary && Array.isArray(summary.all_transactions) && summary.all_transactions.length > 0) {
    trxs = summary.all_transactions.slice(0, 4).map(t => ({
      bank: t.bank || "BCA",
      desc: (t.sender_receiver || t.description || "").slice(0, 24),
      amt: (t.type === "masuk" ? "+" : "-") + formatRupiahJs(t.amount),
      time: (t.time || "").split(" ")[1] || "17:00",
      color: t.type === "masuk" ? "#34d399" : "#f87171"
    }));
  }

  if (trxs.length === 0) {
    // Tampilan Bersih (0 Transaksi)
    ctx.fillStyle = "#0c2419";
    ctx.fillRect(12, 126, 488, 140);
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("✨ Buku Mutasi Bersih — Siaga Transaksi Nyata", 90, 175);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px monospace";
    ctx.fillText("Menunggu email notifikasi perbankan BCA & BRI di sonijulianto@gmail.com", 32, 205);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "10px monospace";
    ctx.fillText("⚡ Real-Time Watcher: Aktif via IMAP SSL (Auto-Sync)", 105, 230);
  } else {
    trxs.forEach((t, i) => {
      ctx.fillStyle = i % 2 === 0 ? "#0c2419" : "#0f2f21";
      ctx.fillRect(12, 126 + i * 36, 488, 32);

      ctx.fillStyle = t.bank === "BCA" ? "#60a5fa" : "#fbbf24";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`[${t.bank}]`, 18, 146 + i * 36);

      ctx.fillStyle = "#f3f4f6";
      ctx.font = "11px sans-serif";
      ctx.fillText(t.desc, 65, 146 + i * 36);

      ctx.fillStyle = t.color;
      ctx.font = "bold 11px monospace";
      ctx.fillText(t.amt, 305, 146 + i * 36);

      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px monospace";
      ctx.fillText(t.time, 425, 146 + i * 36);
    });
  }

  // Footer WhatsApp Sync Info
  ctx.fillStyle = "#022c22";
  ctx.fillRect(0, 288, 512, 32);
  ctx.fillStyle = "#10b981";
  ctx.font = "bold 10px monospace";
  ctx.fillText("📲 WA REPORT: JAM 22:00 WIB • Target: 089516789565", 14, 308);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createFinanceLedgerTexture(summary = null, latestTrx = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  // Dark Mail Inbox Surface
  ctx.fillStyle = "#0b1320";
  ctx.fillRect(0, 0, 320, 512);

  // Email App Header
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 320, 42);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("📧 INBOX sonijulianto@gmail.com", 12, 26);

  let emails = [];
  if (summary && Array.isArray(summary.all_transactions) && summary.all_transactions.length > 0) {
    emails = summary.all_transactions.slice(0, 6).map(t => ({
      sender: t.email_sender || `notifikasi@${t.bank.toLowerCase()}.co.id`,
      title: `${t.type === "masuk" ? "Transfer Masuk" : "Transaksi Debit"} ${formatRupiahJs(t.amount)}`,
      tag: `${t.bank} ${t.type === "masuk" ? "CR" : "DB"}`,
      color: t.type === "masuk" ? "#34d399" : "#f87171",
      time: (t.time || "").split(" ")[1] || "17:00"
    }));
  }

  if (emails.length === 0) {
    // Tampilan Inbox Bersih
    ctx.fillStyle = "#111c2e";
    ctx.fillRect(8, 50, 304, 220);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("📬 Inbox Bersih (0 Mutasi)", 65, 120);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText("Belum ada email mutasi yang terdeteksi.", 30, 150);
    ctx.fillStyle = "#34d399";
    ctx.font = "10px monospace";
    ctx.fillText("🟢 Lisa AI Siaga Memantau Email Masuk...", 25, 180);
  } else {
    emails.forEach((em, i) => {
      ctx.fillStyle = i === 0 ? "#1e2d42" : "#111c2e";
      ctx.fillRect(8, 50 + i * 72, 304, 66);

      ctx.fillStyle = em.color;
      ctx.fillRect(10, 52 + i * 72, 4, 62);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px monospace";
      ctx.fillText(em.sender, 22, 68 + i * 72);

      ctx.fillStyle = "#64748b";
      ctx.font = "9px monospace";
      ctx.fillText(em.time, 275, 68 + i * 72);

      ctx.fillStyle = "#f1f5f9";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(em.title, 22, 88 + i * 72);

      ctx.fillStyle = em.color;
      ctx.font = "bold 9px monospace";
      ctx.fillText(`[${em.tag}] • Verified by Lisa AI`, 22, 106 + i * 72);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createWhiteboardCanvasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");

  // Ultra-clean Frosted Glass Board Surface
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 1024, 640);

  // Blueprint Grid Lines
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let x = 0; x < 1024; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 640); ctx.stroke();
  }
  for (let y = 0; y < 640; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }

  // Header Title
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("⚡ DEV LAB • SYSTEM ARCHITECTURE & SPRINT BOARD", 28, 42);

  // Left Section: Architecture Diagram
  ctx.fillStyle = "#0284c7";
  ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("SYSTEM ARCHITECTURE PIPELINE", 32, 85);

  function drawArchBox(x, y, w, h, title, subtitle, color, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = color;
    ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(title, x + 12, y + 24);
    if (subtitle) {
      ctx.fillStyle = "#475569";
      ctx.font = "11px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText(subtitle, x + 12, y + 42);
    }
  }

  function drawArrow(x1, y1, x2, y2, color = "#0284c7") {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const headlen = 8;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // Box 1: Web & Mobile Frontends
  drawArchBox(32, 110, 420, 56, "📱 Frontend Clients (Flutter & WebGL 3D)", "Three.js Canvas + Flutter Apps (One-Asco, POS, Pivore)", "#0284c7", "#f0f9ff");
  drawArrow(242, 166, 242, 210);

  // Box 2: FastAPI & Socket Gateway
  drawArchBox(32, 210, 420, 56, "🌐 API Gateway & Socket Server (:8000)", "FastAPI • WebSocket Engine • Real-time Event Stream", "#0d9488", "#f0fdfa");
  drawArrow(130, 266, 130, 310);
  drawArrow(242, 266, 242, 310);
  drawArrow(354, 266, 354, 310);

  // Sub-services
  drawArchBox(32, 310, 130, 80, "🧠 Hermes Core", "Gemini Flash\nReasoning Tool", "#7c3aed", "#f5f3ff");
  drawArchBox(177, 310, 130, 80, "🗄️ Memory Store", "Chat Logs &\nLocal State", "#ea580c", "#fff7ed");
  drawArchBox(322, 310, 130, 80, "📂 Workspaces", "Multi-Project\nLocal FS Watch", "#16a34a", "#f0fdf4");

  // Dev Team Matrix
  ctx.fillStyle = "#334155";
  ctx.font = "bold 13px 'Segoe UI', sans-serif";
  ctx.fillText("DEV SQUAD RESPONSIBILITY MATRIX:", 32, 440);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#0369a1";
  ctx.fillText("• Faisal Ravaneli  -> one-asco-ecosystem/mobile", 32, 470);
  ctx.fillStyle = "#0f766e";
  ctx.fillText("• Syaugi Askar    -> tpf_pos_mobile", 32, 498);
  ctx.fillStyle = "#b45309";
  ctx.fillText("• Guntara Gumelar -> pivore_mobile", 32, 526);
  ctx.fillStyle = "#6d28d9";
  ctx.fillText("• Alex (Tech Lead)-> Core System & Tool Execution", 32, 554);

  // Divider Line
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(480, 75);
  ctx.lineTo(480, 600);
  ctx.stroke();

  // Right Section: Kanban Sprint Board
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("SPRINT KANBAN BOARD", 504, 85);

  const colWidth = 158;
  const cols = [
    { name: "TODO", color: "#64748b", bg: "#f1f5f9", x: 504 },
    { name: "IN PROGRESS", color: "#0284c7", bg: "#e0f2fe", x: 674 },
    { name: "DONE ✓", color: "#16a34a", bg: "#dcfce7", x: 844 }
  ];

  cols.forEach(col => {
    ctx.fillStyle = col.bg;
    ctx.fillRect(col.x, 105, colWidth, 495);
    ctx.strokeStyle = col.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(col.x, 105, colWidth, 495);

    ctx.fillStyle = col.color;
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.fillText(col.name, col.x + 12, 126);
  });

  function drawStickyNote(x, y, w, h, text, author, bg, textCol = "#1e293b") {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = textCol;
    ctx.font = "bold 11px 'Segoe UI', sans-serif";
    ctx.fillText(text, x + 8, y + 20);
    ctx.fillStyle = "#475569";
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.fillText(author, x + 8, y + 38);
  }

  // Sticky Notes
  drawStickyNote(512, 140, 142, 54, "Offline SQLite Sync", "@syaugi • POS", "#fef08a");
  drawStickyNote(512, 206, 142, 54, "Push Notification V2", "@guntara • Pivore", "#fbcfe8");

  drawStickyNote(682, 140, 142, 54, "Auth Token Refresh", "@faisal • One-Asco", "#bae6fd");
  drawStickyNote(682, 206, 142, 54, "Tool Execution Safety", "@alex • Hermes", "#fed7aa");

  drawStickyNote(852, 140, 142, 54, "Ruang Khusus Dev Lab", "✓ Dedicated Room", "#bbf7d0");
  drawStickyNote(852, 206, 142, 54, "Warna Langit Jam (WIB)", "✓ Pagi/Siang/Malam", "#bbf7d0");
  drawStickyNote(852, 272, 142, 54, "Duduk Meja saat Tugas", "✓ Focus Seated Task", "#bbf7d0");

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createDevSignCanvasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Dark Brushed Titanium Panel
  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, 512, 128);

  // Glowing Neon Cyan Border
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 116);

  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, 488, 104);

  // Glowing Icon & Text
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 28px 'Segoe UI', system-ui, monospace";
  ctx.fillText("⚡ DEV LAB • ENGINEERING", 28, 54);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("HERMES MULTI-AGENT DEV TEAM • 4 FULLSTACK NODES", 30, 84);

  // Green Active Status Dot
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(470, 48, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 10px monospace";
  ctx.fillText("ONLINE", 450, 72);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createServerFrontTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b0f19";
  ctx.fillRect(0, 0, 256, 512);

  // 7 Server & Switch Units
  for (let s = 0; s < 7; s++) {
    const y = 14 + s * 70;
    
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(8, y, 240, 62);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, y, 240, 62);

    ctx.fillStyle = "#0f172a";
    for (let v = 0; v < 14; v++) {
      ctx.fillRect(16 + v * 7, y + 8, 4, 18);
    }

    for (let d = 0; d < 4; d++) {
      ctx.fillStyle = "#334155";
      ctx.fillRect(125 + d * 28, y + 8, 24, 20);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(127 + d * 28, y + 24, 20, 2);
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(16, y + 36, 120, 18);
    for (let p = 0; p < 8; p++) {
      ctx.fillStyle = (s % 2 === 0 ? (p % 2 === 0 ? "#22c55e" : "#0284c7") : (p % 3 === 0 ? "#38bdf8" : "#22c55e"));
      ctx.fillRect(20 + p * 14, y + 42, 6, 6);
    }

    ctx.fillStyle = "#22c55e";
    ctx.beginPath(); ctx.arc(225, y + 18, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = (s === 2 || s === 5 ? "#f59e0b" : "#38bdf8");
    ctx.beginPath(); ctx.arc(238, y + 18, 3.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#64748b";
    ctx.font = "8px monospace";
    ctx.fillText(s === 0 ? "HERMES CORE 42U" : (s === 1 ? "SWITCH GBE-24" : `NODE 0${s-1} CLUSTER`), 148, y + 48);
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/* =========================================================================
   6. HIGH-TECH DUAL-MONITOR DEVELOPER WORKSTATIONS
   ========================================================================= */
function createDeveloperDeskUnit(x, z, rotY = 0, devName = "", accentColor = 0x0ea5e9) {
  const group = new THREE.Group();
  
  // Tabletop: Dark slate oak with beveled profile (2.6 x 0.12 x 1.35)
  const topMat = mat(0x1a2230, 0.45, 0.1);
  const legMat = mat(0x0f172a, 0.3, 0.8);
  const accentMat = mat(accentColor, 0.3, 0.6);

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.35), topMat);
  top.position.y = 1.45;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // Matte Black Chamfered Steel Legs
  [[-1.15, -0.55], [1.15, -0.55], [-1.15, 0.55], [1.15, 0.55]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.45, 0.12), legMat);
    leg.position.set(lx, 0.725, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  // Crossbar reinforcement
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.06), legMat);
  crossbar.position.set(0, 0.45, -0.55);
  group.add(crossbar);

  // Extended RGB Desk Mat with glowing colored border
  const matBorder = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.015, 0.70), accentMat);
  matBorder.position.set(0.0, 1.51, 0.22);
  group.add(matBorder);
  const deskMatMesh = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.018, 0.66), mat(0x0b0f19, 0.9));
  deskMatMesh.position.set(0.0, 1.52, 0.22);
  deskMatMesh.receiveShadow = true;
  group.add(deskMatMesh);

  // Heavy-duty Dual-Arm Monitor Desk Mount (Clamped to back edge)
  const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 12), legMat);
  standPole.position.set(-0.15, 1.77, -0.42);
  standPole.castShadow = true;
  group.add(standPole);

  const armCross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), legMat);
  armCross.position.set(-0.15, 1.95, -0.38);
  group.add(armCross);

  // SCREEN 1: Primary 27" Landscape Monitor (Right of Center)
  const screenMat1 = new THREE.MeshBasicMaterial({ map: createDevCodeTexture() });
  const monFrame1 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.035), legMat);
  monFrame1.position.set(0.18, 1.95, -0.25);
  monFrame1.castShadow = true;
  group.add(monFrame1);

  const monDisplay1 = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.52), screenMat1);
  monDisplay1.position.set(0.18, 1.95, -0.23);
  group.add(monDisplay1);

  // SCREEN 2: Secondary 24" Portrait/Vertical Monitor (Left of Center, Angled 18° Inward)
  const screenMat2 = new THREE.MeshBasicMaterial({ map: createDevTerminalTexture() });
  const monGroup2 = new THREE.Group();
  monGroup2.position.set(-0.58, 2.02, -0.22);
  monGroup2.rotation.y = 0.28;

  const monFrame2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.78, 0.035), legMat);
  monFrame2.castShadow = true;
  monGroup2.add(monFrame2);

  const monDisplay2 = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.74), screenMat2);
  monDisplay2.position.set(0, 0, 0.02);
  monGroup2.add(monDisplay2);
  group.add(monGroup2);

  // Mechanical Keyboard (Compact 75%)
  const kbBase = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.03, 0.18), mat(0x18181b, 0.5));
  kbBase.position.set(0.08, 1.54, 0.28);
  group.add(kbBase);
  const kbKeys = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.16), mat(0x27272a, 0.7));
  kbKeys.position.set(0.08, 1.56, 0.28);
  group.add(kbKeys);

  // Ergonomic Wireless Mouse
  const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.13), mat(0x18181b, 0.4));
  mouse.position.set(0.56, 1.545, 0.28);
  group.add(mouse);

  // High-Performance PC Workstation Tower (on floor beside desk)
  const pcGroup = new THREE.Group();
  pcGroup.position.set(1.08, 0.45, 0.15);

  const pcCase = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 0.56), mat(0x0f172a, 0.3, 0.8));
  pcCase.castShadow = true;
  pcGroup.add(pcCase);

  const rgbMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.50, 0.42), accentMat);
  rgbMesh.position.set(-0.13, 0.0, 0.0);
  pcGroup.add(rgbMesh);
  group.add(pcGroup);

  // Ceramic Coffee Mug ("Code Fuel")
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.12, 12), mat(0xf8fafc, 0.4));
  mug.position.set(0.68, 1.57, -0.12);
  mug.castShadow = true;
  group.add(mug);
  const coffeeLiquid = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), mat(0x3e2723, 0.9));
  coffeeLiquid.position.set(0.68, 1.62, -0.12);
  group.add(coffeeLiquid);

  // Studio Headphones on Aluminum Stand
  const hpStand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 8), mat(0x94a3b8, 0.2, 0.8));
  hpStand.position.set(-1.05, 1.67, 0.15);
  group.add(hpStand);
  const hpBaseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), mat(0x334155, 0.4));
  hpBaseMesh.position.set(-1.05, 1.52, 0.15);
  group.add(hpBaseMesh);
  const hpBand = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 16, Math.PI), mat(0x18181b, 0.6));
  hpBand.position.set(-1.05, 1.83, 0.15);
  hpBand.rotation.x = Math.PI / 2;
  group.add(hpBand);

  // Developer Nameplate badge on desk
  if (devName) {
    const npCanvas = document.createElement("canvas");
    npCanvas.width = 256; npCanvas.height = 64;
    const npCtx = npCanvas.getContext("2d");
    npCtx.fillStyle = "#0f172a";
    npCtx.fillRect(0, 0, 256, 64);
    npCtx.strokeStyle = "#38bdf8";
    npCtx.lineWidth = 3;
    npCtx.strokeRect(4, 4, 248, 56);
    npCtx.fillStyle = "#ffffff";
    npCtx.font = "bold 16px sans-serif";
    npCtx.fillText(devName, 14, 28);
    npCtx.fillStyle = "#38bdf8";
    npCtx.font = "11px monospace";
    npCtx.fillText("DEV WORKSTATION", 14, 48);

    const npTex = new THREE.CanvasTexture(npCanvas);
    const npMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.03), new THREE.MeshBasicMaterial({ map: npTex }));
    npMesh.position.set(-0.85, 1.55, 0.55);
    group.add(npMesh);
  }

  // Rolling Black Office Chair placed at local (0, 0, +0.86) facing the desk (-z)
  const chair = createRollingOfficeChair();
  chair.position.set(0, 0, 0.86);
  chair.rotation.y = 0;
  group.add(chair);

  // Exact Seat Anchor Marker right on the center of the chair cushion
  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0, 0.82);
  group.add(seatAnchor);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  // Compute exact world coordinates of the chair seat
  group.updateMatrixWorld(true);
  const worldSeatPos = new THREE.Vector3();
  seatAnchor.getWorldPosition(worldSeatPos);
  const worldSeatRotY = rotY + Math.PI;

  return {
    seatPos: worldSeatPos,
    seatRotY: worldSeatRotY
  };
}

function createFinanceDeskUnit(x, z, rotY = 0, name = "Lisa (Finance)", accentColor = 0x10b981) {
  const group = new THREE.Group();

  // Premium Oak Tabletop with Emerald Green trim
  const topMat = mat(0x132e22, 0.45, 0.1);
  const legMat = mat(0x0f172a, 0.3, 0.8);
  const accentMat = mat(accentColor, 0.3, 0.6);

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.35), topMat);
  top.position.y = 1.45;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // Matte Black Chamfered Steel Legs
  [[-1.15, -0.55], [1.15, -0.55], [-1.15, 0.55], [1.15, 0.55]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.45, 0.12), legMat);
    leg.position.set(lx, 0.725, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  // Crossbar reinforcement
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.06), legMat);
  crossbar.position.set(0, 0.45, -0.55);
  group.add(crossbar);

  // Emerald Desk Mat with leather feel
  const matBorder = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.015, 0.70), accentMat);
  matBorder.position.set(0.0, 1.51, 0.22);
  group.add(matBorder);
  const deskMatMesh = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.018, 0.66), mat(0x06281e, 0.9));
  deskMatMesh.position.set(0.0, 1.52, 0.22);
  deskMatMesh.receiveShadow = true;
  group.add(deskMatMesh);

  // Dual Monitor Mount
  const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 12), legMat);
  standPole.position.set(-0.15, 1.77, -0.42);
  standPole.castShadow = true;
  group.add(standPole);

  const armCross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), legMat);
  armCross.position.set(-0.15, 1.95, -0.38);
  group.add(armCross);

  // SCREEN 1: 27" Landscape Monitor - Bank Mutasi Dashboard BCA & BRI
  const screenMat1 = new THREE.MeshBasicMaterial({ map: createFinanceDeskTexture() });
  lisaScreenMat1 = screenMat1;
  const monFrame1 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.56, 0.035), legMat);
  monFrame1.position.set(0.18, 1.95, -0.25);
  monFrame1.castShadow = true;
  group.add(monFrame1);

  const monDisplay1 = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.52), screenMat1);
  monDisplay1.position.set(0.18, 1.95, -0.23);
  group.add(monDisplay1);

  // SCREEN 2: 24" Portrait Monitor - Email sonijulianto@gmail.com Inbox Monitor
  const screenMat2 = new THREE.MeshBasicMaterial({ map: createFinanceLedgerTexture() });
  lisaScreenMat2 = screenMat2;
  const monGroup2 = new THREE.Group();
  monGroup2.position.set(-0.58, 2.02, -0.22);
  monGroup2.rotation.y = 0.28;

  const monFrame2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.78, 0.035), legMat);
  monFrame2.castShadow = true;
  monGroup2.add(monFrame2);

  const monDisplay2 = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.74), screenMat2);
  monDisplay2.position.set(0, 0, 0.02);
  monGroup2.add(monDisplay2);
  group.add(monGroup2);

  // Keyboard and Mouse
  const kbBase = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.03, 0.18), mat(0x18181b, 0.5));
  kbBase.position.set(0.08, 1.54, 0.28);
  group.add(kbBase);
  const kbKeys = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.16), mat(0x27272a, 0.7));
  kbKeys.position.set(0.08, 1.56, 0.28);
  group.add(kbKeys);

  const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.13), mat(0x18181b, 0.4));
  mouse.position.set(0.56, 1.545, 0.28);
  group.add(mouse);

  // Financial Desktop Calculator
  const calcGroup = new THREE.Group();
  calcGroup.position.set(-0.62, 1.53, 0.26);
  calcGroup.rotation.y = 0.18;
  const calcBase = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.28), mat(0x1e293b, 0.6));
  calcGroup.add(calcBase);
  const calcLcd = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.06), mat(0x6ee7b7, 0.2, 0.1));
  calcLcd.position.set(0, 0.015, -0.09);
  calcGroup.add(calcLcd);
  group.add(calcGroup);

  // Invoice / Finance Ledger Binder
  const binder = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.42), mat(0x065f46, 0.8));
  binder.position.set(0.72, 1.53, -0.15);
  binder.rotation.y = -0.22;
  group.add(binder);

  // Ceramic Coffee Cup
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.12, 12), mat(0x10b981, 0.4));
  mug.position.set(0.82, 1.57, 0.25);
  mug.castShadow = true;
  group.add(mug);

  // Nameplate: Lisa - Finance Specialist (BCA & BRI)
  const npCanvas = document.createElement("canvas");
  npCanvas.width = 256; npCanvas.height = 64;
  const npCtx = npCanvas.getContext("2d");
  npCtx.fillStyle = "#064e3b";
  npCtx.fillRect(0, 0, 256, 64);
  npCtx.strokeStyle = "#34d399";
  npCtx.lineWidth = 3;
  npCtx.strokeRect(4, 4, 248, 56);
  npCtx.fillStyle = "#ffffff";
  npCtx.font = "bold 15px sans-serif";
  npCtx.fillText("Lisa (Finance Specialist)", 12, 28);
  npCtx.fillStyle = "#a7f3d0";
  npCtx.font = "11px monospace";
  npCtx.fillText("BCA & BRI RECONCILIATION", 12, 48);

  const npTex = new THREE.CanvasTexture(npCanvas);
  const npMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.03), new THREE.MeshBasicMaterial({ map: npTex }));
  npMesh.position.set(-0.82, 1.55, 0.55);
  group.add(npMesh);

  // Rolling Black Office Chair placed at local (0, 0, +0.86) facing the desk (-z)
  const chair = createRollingOfficeChair();
  chair.position.set(0, 0, 0.86);
  chair.rotation.y = 0;
  group.add(chair);

  // Exact Seat Anchor Marker right on the center of the chair cushion
  const seatAnchor = new THREE.Object3D();
  seatAnchor.position.set(0, 0, 0.82);
  group.add(seatAnchor);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  group.updateMatrixWorld(true);
  const worldSeatPos = new THREE.Vector3();
  seatAnchor.getWorldPosition(worldSeatPos);
  const worldSeatRotY = rotY + Math.PI;

  return {
    seatPos: worldSeatPos,
    seatRotY: worldSeatRotY
  };
}

/* =========================================================================
   7. DEDICATED DEVELOPER ROOM (DEV LAB & ENGINEERING CORE)
   ========================================================================= */
function createServerRackTower(x, z, rotY = 0) {
  const group = new THREE.Group();
  const rackMat = mat(0x0f172a, 0.35, 0.7);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.32,
    roughness: 0.1,
    transmission: 0.7
  });

  // Outer 42U Steel Chassis (0.95 x 2.35 x 0.95)
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.35, 0.95), rackMat);
  cabinet.position.y = 1.175;
  cabinet.castShadow = true;
  group.add(cabinet);

  // Front recessed faceplate with server units
  const frontTex = createServerFrontTexture();
  const frontFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 2.22),
    new THREE.MeshBasicMaterial({ map: frontTex })
  );
  frontFace.position.set(0, 1.175, 0.476);
  group.add(frontFace);

  // Front Smoked Glass Door with black frame
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.25, 0.03), glassMat);
  doorGlass.position.set(0, 1.175, 0.495);
  group.add(doorGlass);

  const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.05), mat(0x94a3b8, 0.2, 0.8));
  doorHandle.position.set(0.38, 1.175, 0.52);
  group.add(doorHandle);

  // Internal Blue/Cyan Glow Light
  const serverLight = new THREE.PointLight(0x0284c7, 0.75, 4.2);
  serverLight.position.set(0, 1.2, 0.6);
  group.add(serverLight);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createArchitectureWhiteboard(x, z, rotY = 0) {
  const group = new THREE.Group();
  const frameMat = mat(0x1e293b, 0.3, 0.8);

  // Mobile stand inverted T-feet with casters
  [[-1.0, 0], [1.0, 0]].forEach(([fx, _]) => {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.65), frameMat);
    foot.position.set(fx, 0.05, 0);
    foot.castShadow = true;
    group.add(foot);

    [-0.26, 0.26].forEach(cz => {
      const caster = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat(0x0f172a, 0.5));
      caster.position.set(fx, 0.04, cz);
      group.add(caster);
    });

    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.05, 0.07), frameMat);
    upright.position.set(fx, 1.05, 0);
    upright.castShadow = true;
    group.add(upright);
  });

  const crossTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.06), frameMat);
  crossTop.position.set(0, 2.08, 0);
  group.add(crossTop);
  const crossBot = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.06), frameMat);
  crossBot.position.set(0, 0.72, 0);
  group.add(crossBot);

  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.12), mat(0x94a3b8, 0.4, 0.6));
  tray.position.set(0, 0.70, 0.06);
  group.add(tray);

  const boardTex = createWhiteboardCanvasTexture();
  const boardFace = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.32, 0.02),
    new THREE.MeshBasicMaterial({ map: boardTex })
  );
  boardFace.position.set(0, 1.40, 0);
  group.add(boardFace);

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);
  return group;
}

function createDevRoomSignboard(x = -1.5, y = 2.95, z = -0.75) {
  const group = new THREE.Group();
  const panelMat = mat(0x090d16, 0.4, 0.6);
  const neonMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.65,
    roughness: 0.2
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.55, 0.06), panelMat);
  base.castShadow = true;
  group.add(base);

  const neonOutline = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.61, 0.02), neonMat);
  neonOutline.position.z = -0.01;
  group.add(neonOutline);

  const signTex = createDevSignCanvasTexture();
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(2.46, 0.51),
    new THREE.MeshBasicMaterial({ map: signTex })
  );
  signFace.position.z = 0.032;
  group.add(signFace);

  const signLight = new THREE.PointLight(0x38bdf8, 0.55, 3.8);
  signLight.position.set(0, -0.4, 0.3);
  group.add(signLight);

  group.position.set(x, y, z);
  scene.add(group);
  return group;
}

function buildDeveloperRoom() {
  // 1. Tech Slate Charcoal Carpet Inlay with Neon Cyan Trim
  // Completely enclosed inside Dev Room (x: -5.5 to 2.3, z: -12.8 to -0.9)
  const carpetMat = mat(0x111622, 0.85, 0.05);
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.02, 11.9), carpetMat);
  carpet.position.set(-1.6, 0.01, -6.85);
  carpet.receiveShadow = true;
  scene.add(carpet);

  // Cyan perimeter line around Dev Room floor
  const neonTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.3
  });
  const borderNorth = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.025, 0.06), neonTrimMat);
  borderNorth.position.set(-1.6, 0.015, -12.8);
  scene.add(borderNorth);
  const borderSouth = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.025, 0.06), neonTrimMat);
  borderSouth.position.set(-1.6, 0.015, -0.9);
  scene.add(borderSouth);
  const borderWest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 11.9), neonTrimMat);
  borderWest.position.set(-5.5, 0.015, -6.85);
  scene.add(borderWest);
  const borderEast = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 11.9), neonTrimMat);
  borderEast.position.set(2.3, 0.015, -6.85);
  scene.add(borderEast);

  // 2. East Partition Wall (separating Dev Room from Budi's 3.1m East Corridor):
  // Runs along x = 2.4 from z = -13.0 to -0.8 (length = 12.2m)
  createFramedGlassWall(2.4, -6.9, 12.2, "z");

  // 3. West Partition Wall (separating Dev Room from 3.4m West Corridor):
  // Runs along x = -5.6 from z = -13.0 to -0.8 (length = 12.2m)
  createFramedGlassWall(-5.6, -6.9, 12.2, "z");

  // Modern Acoustic Wood Slat Accent Panel on section of west wall (x = -5.52, z = -7.5)
  const slatBacking = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.2, 4.2), mat(0x18181b, 0.9));
  slatBacking.position.set(-5.52, 1.8, -7.5);
  scene.add(slatBacking);
  const slatMat = mat(0xd4a373, 0.6);
  for (let i = 0; i < 14; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.2, 0.12), slatMat);
    slat.position.set(-5.50, 1.8, -9.3 + i * 0.28);
    slat.castShadow = true;
    scene.add(slat);
  }

  // 4. South Entrance Glass Partitions & Open Doorway (at z = -0.8, total span width = 8.0m):
  // Left panel: x: -5.6 to -2.6 (length 3.0m, center x = -4.1)
  createFramedGlassWall(-4.1, -0.8, 3.0, "x");
  // Right panel: x: -0.4 to 2.4 (length 2.8m, center x = 1.0)
  createFramedGlassWall(1.0, -0.8, 2.8, "x");

  // Doorway Framing: width 2.2m (from x = -2.6 to -0.4, center x = -1.5)
  const frameMat = mat(0x18181b, 0.3, 0.7);
  const doorPostL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 0.12), frameMat);
  doorPostL.position.set(-2.6, 1.35, -0.8);
  doorPostL.castShadow = true;
  scene.add(doorPostL);

  const doorPostR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 0.12), frameMat);
  doorPostR.position.set(-0.4, 1.35, -0.8);
  doorPostR.castShadow = true;
  scene.add(doorPostR);

  // Doorway Overhead Lintel Beam at y = 2.7
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), frameMat);
  lintel.position.set(-1.5, 2.7, -0.8);
  scene.add(lintel);

  // Transom Glass above doorway from y = 2.76 to 3.8
  const transomGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.28,
    roughness: 0.08,
    transmission: 0.75
  });
  const transomGlass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.08), transomGlassMat);
  transomGlass.position.set(-1.5, 3.26, -0.8);
  scene.add(transomGlass);

  const transomTopRail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.14), frameMat);
  transomTopRail.position.set(-1.5, 3.8, -0.8);
  scene.add(transomTopRail);

  // Illuminated Entrance Signboard above doorway
  createDevRoomSignboard(-1.5, 2.95, -0.75);

  // 5. Server Rack Cabinet (Northeast Corner of Dev Room)
  createServerRackTower(1.6, -11.5, -Math.PI / 2);

  // 6. Glass Architecture & Sprint Whiteboard (West Wall of Dev Room)
  createArchitectureWhiteboard(-5.0, -2.2, Math.PI / 2);

  // 7. Ceiling LED Track Lighting in Dev Room
  [-3.5, 0.4].forEach(lx => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 9.5), frameMat);
    rail.position.set(lx, 3.8, -6.8);
    scene.add(rail);

    [-9.5, -6.8, -4.0].forEach(sz => {
      const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12), frameMat);
      spot.position.set(lx, 3.7, sz);
      scene.add(spot);
    });
  });

  // Soft Ambient Point Light inside Dev Room
  const devAmbient = new THREE.PointLight(0x38bdf8, 0.5, 8.5);
  devAmbient.position.set(-1.6, 3.2, -6.8);
  scene.add(devAmbient);

  // 8. Modern Tech Plants in Dev Room
  createIndoorPlant(1.6, -1.8, 0.95);
  createIndoorPlant(-5.0, -11.5, 0.95);
}

function buildOpenWorkstations() {
  deskSeats.length = 0; // Clear while preserving array reference

  // Index 0: Clara (Creative & Marketing) -> Outside Dev Room in Creative Studio (West Corridor)
  const claraSeat = createWoodenDeskUnit(-7.5, -2.0, -Math.PI / 4);
  deskSeats.push(claraSeat);

  // Index 1: Syaugi Askar (Fullstack • TPF POS Mobile) -> Dev Room Front-Left
  const syaugiSeat = createDeveloperDeskUnit(-3.5, -3.6, -Math.PI / 4, "Syaugi Askar", 0x14b8a6);
  deskSeats.push(syaugiSeat);

  // Index 2: Sarah (Front Desk / Receptionist) -> Lobby Front Desk
  const sarahSeat = createWoodenDeskUnit(-6.0, 4.0, -Math.PI / 4);
  deskSeats.push(sarahSeat);

  // Index 3: Faisal Ravaneli (Fullstack • One-Asco Mobile) -> Dev Room Back-Right
  const faisalSeat = createDeveloperDeskUnit(0.4, -8.2, -Math.PI / 4, "Faisal Ravaneli", 0x0ea5e9);
  deskSeats.push(faisalSeat);

  // Index 4: Alex (Tech Lead • Developer) -> Dev Room Back-Left
  const alexSeat = createDeveloperDeskUnit(-3.5, -8.2, -Math.PI / 4, "Alex (Tech Lead)", 0x8a5cf6);
  deskSeats.push(alexSeat);

  // Index 5: Guntara Gumelar (Fullstack • Pivore Mobile) -> Dev Room Front-Right
  const guntaraSeat = createDeveloperDeskUnit(0.4, -3.6, -Math.PI / 4, "Guntara Gumelar", 0xf59e0b);
  deskSeats.push(guntaraSeat);

  // Index 6: Lisa (Finance & Bank Reconciliation) -> West Corridor Finance Station
  const lisaSeat = createFinanceDeskUnit(-7.5, -6.0, -Math.PI / 4, "Lisa (Finance)", 0x10b981);
  deskSeats.push(lisaSeat);
}

function buildManagerRoom() {
  // Index 7: Budi's Executive Desk
  const budiSeat = createWoodenDeskUnit(10.8, -7.2, -Math.PI / 4);
  deskSeats.push(budiSeat);

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 4.2), mat(0xd4a373, 0.7));
  shelf.position.set(16.2, 1.1, -7.5);
  shelf.castShadow = true;
  scene.add(shelf);

  createIndoorPlant(15.2, -11.5, 1.1);
}

function buildConferenceRoom() {
  const oakMat = mat(0xdcb88e, 0.6);
  const confTable = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 6.8), oakMat);
  confTable.position.set(11.2, 1.45, 5.5);
  confTable.castShadow = true;
  confTable.receiveShadow = true;
  scene.add(confTable);

  [[-1.2, -2.6], [1.2, -2.6], [-1.2, 2.6], [1.2, 2.6]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.45, 0.16), mat(0x27272a, 0.5));
    leg.position.set(11.2 + lx, 0.725, 5.5 + lz);
    leg.castShadow = true;
    scene.add(leg);
  });

  createSmallTablePlant(11.2, 1.52, 5.5);

  // 6 Rolling Chairs facing inward towards the conference table
  [-2.0, 0, 2.0].forEach(cz => {
    const cLeft = createRollingOfficeChair();
    cLeft.position.set(8.9, 0, 5.5 + cz);
    cLeft.rotation.y = -Math.PI / 2; // Backrest at -x, facing +x (table)
    scene.add(cLeft);

    const cRight = createRollingOfficeChair();
    cRight.position.set(13.5, 0, 5.5 + cz);
    cRight.rotation.y = Math.PI / 2; // Backrest at +x, facing -x (table)
    scene.add(cRight);
  });
}

/* =========================================================================
   6. PANTRY, BILLIARD TABLE & REALISTIC CUSHIONED SOFA LOUNGE
   ========================================================================= */
function buildPantryArea() {
  const counterMat = mat(0xd4a373, 0.7);
  const marbleMat = mat(0xf8fafc, 0.25, 0.05);

  const backCabinet = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.6, 1.3), counterMat);
  backCabinet.position.set(-12.5, 0.8, -11.9);
  backCabinet.castShadow = true;
  backCabinet.receiveShadow = true;
  scene.add(backCabinet);

  const backTop = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.1, 1.4), marbleMat);
  backTop.position.set(-12.5, 1.65, -11.9);
  scene.add(backTop);

  // Silver Double-Door Refrigerator
  const fridgeMat = mat(0xcbd5e1, 0.3, 0.6);
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.4, 1.4), fridgeMat);
  fridge.position.set(-15.8, 1.7, -11.8);
  fridge.castShadow = true;
  scene.add(fridge);

  const handleMat = mat(0x475569, 0.3, 0.8);
  [-15.88, -15.72].forEach(hx => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.08), handleMat);
    h.position.set(hx, 2.1, -11.06);
    scene.add(h);
  });

  // Espresso Coffee Machine
  const coffeeMachine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.75, 0.65), mat(0x1e293b, 0.3, 0.5));
  coffeeMachine.position.set(-13.5, 2.08, -11.8);
  coffeeMachine.castShadow = true;
  scene.add(coffeeMachine);

  // Water Dispenser
  const dispenser = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.0, 0.65), mat(0xf1f5f9, 0.4));
  dispenser.position.set(-8.6, 1.0, -11.9);
  dispenser.castShadow = true;
  scene.add(dispenser);

  const gallon = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.75, 14), new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8, transparent: true, opacity: 0.65, roughness: 0.1
  }));
  gallon.position.set(-8.6, 2.38, -11.9);
  scene.add(gallon);

  // Pantry Island Bar & 3 Bar Stools
  const island = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 3.8), counterMat);
  island.position.set(-10.8, 0.85, -7.8);
  island.castShadow = true;
  island.receiveShadow = true;
  scene.add(island);

  const islandTop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 4.0), marbleMat);
  islandTop.position.set(-10.8, 1.75, -7.8);
  scene.add(islandTop);

  [-9.0, -7.8, -6.6].forEach(sz => {
    const stool = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 14), mat(0x334155, 0.8));
    seat.position.y = 1.25;
    seat.castShadow = true;
    stool.add(seat);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 10), mat(0x1e293b, 0.4, 0.6));
    pole.position.y = 0.6;
    stool.add(pole);

    stool.position.set(-9.6, 0, sz);
    scene.add(stool);
  });
}

function buildBilliardAndSofaLounge() {
  // 1. BILLIARD TABLE (x = -12.2, z = 8.2)
  const poolGroup = new THREE.Group();
  const woodRailMat = mat(0x5c3a21, 0.55);
  const greenFeltMat = mat(0x15803d, 0.9);
  const pocketMat = mat(0x09090b, 0.9);

  const bed = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 2.7), greenFeltMat);
  bed.position.y = 1.42;
  bed.receiveShadow = true;
  poolGroup.add(bed);

  const body = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.45, 3.0), woodRailMat);
  body.position.y = 1.22;
  body.castShadow = true;
  poolGroup.add(body);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 0.22), woodRailMat);
  topRail.position.set(0, 1.52, -1.45);
  poolGroup.add(topRail);

  const botRail = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 0.22), woodRailMat);
  botRail.position.set(0, 1.52, 1.45);
  poolGroup.add(botRail);

  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 3.1), woodRailMat);
  leftRail.position.set(-2.5, 1.52, 0);
  poolGroup.add(leftRail);

  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 3.1), woodRailMat);
  rightRail.position.set(2.5, 1.52, 0);
  poolGroup.add(rightRail);

  [
    [-2.35, -1.3], [0, -1.35], [2.35, -1.3],
    [-2.35, 1.3], [0, 1.35], [2.35, 1.3]
  ].forEach(([px, pz]) => {
    const pocket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 12), pocketMat);
    pocket.position.set(px, 1.46, pz);
    poolGroup.add(pocket);
  });

  [[-2.1, -1.1], [2.1, -1.1], [-2.1, 1.1], [2.1, 1.1]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 1.1, 12), woodRailMat);
    leg.position.set(lx, 0.55, lz);
    leg.castShadow = true;
    poolGroup.add(leg);
  });

  const ballData = [
    [-1.2, 0, 0xffffff],
    [0.8, 0, 0xeab308],
    [0.98, -0.12, 0xef4444],
    [0.98, 0.12, 0x2563eb],
    [1.16, -0.22, 0x9333ea],
    [1.16, 0, 0x18181b],
    [1.16, 0.22, 0xf97316],
    [0.2, 0.5, 0x16a34a]
  ];
  ballData.forEach(([bx, bz, bcol]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), mat(bcol, 0.2, 0.1));
    ball.position.set(bx, 1.59, bz);
    ball.castShadow = true;
    poolGroup.add(ball);
  });

  const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 2.4, 8), mat(0xd4a373, 0.5));
  cue.rotation.z = Math.PI / 2;
  cue.rotation.y = 0.25;
  cue.position.set(-1.3, 1.58, 0.6);
  poolGroup.add(cue);

  poolGroup.position.set(-12.2, 0, 8.2);
  scene.add(poolGroup);

  // 2. REALISTIC PLUSH SOFA LOUNGE
  createRealisticSofaGroup(-1.8, 9.8, -Math.PI / 2);
}

function createRealisticSofaGroup(x, z, rotY) {
  const lounge = new THREE.Group();

  const rug = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.03, 6.4), mat(0xf1ece1, 0.95));
  rug.position.set(-1.2, 0.015, 0);
  rug.receiveShadow = true;
  lounge.add(rug);

  const sofaFabric = mat(0x7c8c6e, 0.92);
  const cushionFabric = mat(0x849476, 0.9);
  const pillowMat = mat(0xf8fafc, 0.85);
  const woodLegMat = mat(0x5c3a21, 0.6);

  const sofa = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 3.8), sofaFabric);
  base.position.y = 0.35;
  base.castShadow = true;
  base.receiveShadow = true;
  sofa.add(base);

  const sofaAnchors = [];

  [-0.85, 0.85].forEach(cz => {
    const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.28, 1.62), cushionFabric);
    seatCushion.position.set(0.05, 0.64, cz);
    seatCushion.castShadow = true;
    seatCushion.receiveShadow = true;
    sofa.add(seatCushion);

    const backCushion = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.78, 1.6), cushionFabric);
    backCushion.position.set(-0.52, 1.12, cz);
    backCushion.rotation.z = 0.1;
    backCushion.castShadow = true;
    sofa.add(backCushion);

    // Seat marker on each sofa cushion (backrest is at -x in sofa space, so sitting person faces +x)
    const anchor = new THREE.Object3D();
    anchor.position.set(0.12, 0, cz);
    sofa.add(anchor);
    sofaAnchors.push(anchor);
  });

  const backFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.15, 3.8), sofaFabric);
  backFrame.position.set(-0.68, 0.85, 0);
  backFrame.castShadow = true;
  sofa.add(backFrame);

  [-1.78, 1.78].forEach(az => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.72, 0.28), sofaFabric);
    arm.position.set(0, 0.78, az);
    arm.castShadow = true;
    sofa.add(arm);
  });

  const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.52, 0.52), pillowMat);
  pillow1.position.set(-0.28, 0.98, 1.32);
  pillow1.rotation.z = 0.25;
  pillow1.rotation.y = -0.3;
  pillow1.castShadow = true;
  sofa.add(pillow1);

  const pillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.48, 0.48), mat(0xe2e8f0, 0.85));
  pillow2.position.set(-0.28, 0.96, -1.32);
  pillow2.rotation.z = 0.22;
  pillow2.rotation.y = 0.25;
  pillow2.castShadow = true;
  sofa.add(pillow2);

  [[-0.6, -1.7], [0.6, -1.7], [-0.6, 1.7], [0.6, 1.7]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.2, 8), woodLegMat);
    leg.position.set(lx, 0.1, lz);
    sofa.add(leg);
  });

  sofa.position.set(0.8, 0, 0);
  sofa.rotation.y = Math.PI;
  lounge.add(sofa);

  // Round Coffee Table
  const coffeeTable = new THREE.Group();
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 24), mat(0xdcb88e, 0.6));
  tableTop.position.y = 0.68;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  coffeeTable.add(tableTop);

  [[-0.5, -0.5], [0.5, -0.5], [0, 0.6]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.68, 8), mat(0x27272a, 0.6));
    leg.position.set(lx, 0.34, lz);
    leg.castShadow = true;
    coffeeTable.add(leg);
  });

  createSmallTablePlant(0, 0.74, 0.15, coffeeTable);
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.28), mat(0xffffff, 0.9));
  book.position.set(-0.28, 0.76, -0.25);
  book.rotation.y = 0.4;
  coffeeTable.add(book);

  coffeeTable.position.set(-1.5, 0, 1.3);
  lounge.add(coffeeTable);

  lounge.position.set(x, 0, z);
  lounge.rotation.y = rotY;
  scene.add(lounge);

  // Compute exact world positions for the two sofa cushions
  lounge.updateMatrixWorld(true);
  sofaAnchors.forEach(anchor => {
    const wp = new THREE.Vector3();
    anchor.getWorldPosition(wp);
    // In sofa local space, sitter faces +x. Sofa has rotY = Math.PI, Lounge has rotY = -Math.PI/2 -> Sitter faces -z (Math.PI)
    sofaSeats.push({ pos: wp, rotY: Math.PI });
  });
}

/* =========================================================================
   8. OFFICE NAVIGATION GRAPH & COLLISION-FREE WAYPOINT PATHFINDING
   ========================================================================= */
const NAV_NODES = {
  // Manager Zone & East Corridor (Separated from Dev Room)
  budi_desk: { x: 10.8, z: -7.2 },
  budi_door: { x: 5.5, z: -6.75 },
  corridor_east_n: { x: 3.9, z: -6.75 },
  corridor_east_s: { x: 3.9, z: 1.5 },
  conference_door: { x: 3.9, z: 5.0 },

  // Central Cross-Hallway
  crossway_center: { x: -1.5, z: 1.5 },
  crossway_west: { x: -7.5, z: 1.5 },

  // Developer Room Zone (Independent Enclosed Pavilion)
  dev_door_out: { x: -1.5, z: 0.2 },
  dev_door_in: { x: -1.5, z: -1.8 },
  dev_aisle_front: { x: -1.5, z: -3.6 },
  dev_aisle_back: { x: -1.5, z: -8.2 },
  alex_desk: { x: -3.5, z: -8.2 },
  faisal_desk: { x: 0.4, z: -8.2 },
  syaugi_desk: { x: -3.5, z: -3.6 },
  guntara_desk: { x: 0.4, z: -3.6 },
  dev_server: { x: 0.6, z: -11.5 },
  dev_whiteboard: { x: -4.0, z: -2.2 },

  // West Corridor & Creative / Front Desk / Finance
  clara_desk: { x: -7.5, z: -2.0 },
  sarah_desk: { x: -6.0, z: 4.0 },
  corridor_west_mid: { x: -7.5, z: -4.0 },
  lisa_desk: { x: -7.5, z: -6.0 },
  corridor_west_n: { x: -7.5, z: -8.0 },
  window_look: { x: -7.5, z: -11.5 },

  // Pantry
  pantry_entrance: { x: -8.5, z: -5.5 },
  pantry_aisle: { x: -12.0, z: -5.5 },
  pantry_coffee: { x: -13.5, z: -10.2 },
  pantry_bar: { x: -9.5, z: -7.8 },

  // Lounge & Sofas
  lounge_center: { x: -8.0, z: 5.0 },
  billiard_1: { x: -12.2, z: 5.5 },
  billiard_2: { x: -8.8, z: 8.2 },
  sofa_center: { x: -1.8, z: 8.0 }
};

const NAV_EDGES = [
  // Budi -> East Corridor (completely separated from Dev Room)
  ["budi_desk", "budi_door"],
  ["budi_door", "corridor_east_n"],
  ["corridor_east_n", "corridor_east_s"],
  ["corridor_east_s", "conference_door"],

  // Central Crossway connecting East Corridor, Dev Room Door, and West Corridor
  ["corridor_east_s", "crossway_center"],
  ["crossway_center", "crossway_west"],
  ["crossway_center", "sofa_center"],

  // Dev Room Entry & Aisle
  ["crossway_center", "dev_door_out"],
  ["dev_door_out", "dev_door_in"],
  ["dev_door_in", "dev_aisle_front"],
  ["dev_aisle_front", "dev_aisle_back"],
  ["dev_aisle_front", "syaugi_desk"],
  ["dev_aisle_front", "guntara_desk"],
  ["dev_aisle_front", "dev_whiteboard"],
  ["dev_aisle_back", "alex_desk"],
  ["dev_aisle_back", "faisal_desk"],
  ["dev_aisle_back", "dev_server"],

  // West Corridor & Finance
  ["crossway_west", "clara_desk"],
  ["crossway_west", "sarah_desk"],
  ["crossway_west", "corridor_west_mid"],
  ["corridor_west_mid", "lisa_desk"],
  ["lisa_desk", "corridor_west_n"],
  ["corridor_west_n", "window_look"],
  ["corridor_west_mid", "pantry_entrance"],
  ["pantry_entrance", "pantry_aisle"],
  ["pantry_aisle", "pantry_coffee"],
  ["pantry_aisle", "pantry_bar"],

  // Lounge & Billiard
  ["crossway_west", "lounge_center"],
  ["lounge_center", "billiard_1"],
  ["lounge_center", "billiard_2"],
  ["lounge_center", "sofa_center"]
];

function findNavPath(startPos, endPos) {
  let startNode = null;
  let minDistS = Infinity;
  for (const [id, node] of Object.entries(NAV_NODES)) {
    const d = Math.hypot(node.x - startPos.x, node.z - startPos.z);
    if (d < minDistS) {
      minDistS = d;
      startNode = id;
    }
  }

  let endNode = null;
  let minDistE = Infinity;
  for (const [id, node] of Object.entries(NAV_NODES)) {
    const d = Math.hypot(node.x - endPos.x, node.z - endPos.z);
    if (d < minDistE) {
      minDistE = d;
      endNode = id;
    }
  }

  if (!startNode || !endNode || startNode === endNode) {
    return [new THREE.Vector3(endPos.x, 0, endPos.z)];
  }

  const adj = {};
  for (const id of Object.keys(NAV_NODES)) adj[id] = [];
  for (const [a, b] of NAV_EDGES) {
    if (adj[a] && adj[b]) {
      adj[a].push(b);
      adj[b].push(a);
    }
  }

  const queue = [startNode];
  const visited = new Set([startNode]);
  const parent = {};

  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === endNode) {
      found = true;
      break;
    }
    for (const neighbor of adj[curr]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent[neighbor] = curr;
        queue.push(neighbor);
      }
    }
  }

  if (!found) {
    return [new THREE.Vector3(endPos.x, 0, endPos.z)];
  }

  const pathKeys = [];
  let curr = endNode;
  while (curr) {
    pathKeys.unshift(curr);
    curr = parent[curr];
  }

  if (pathKeys.length > 1 && Math.hypot(NAV_NODES[pathKeys[0]].x - startPos.x, NAV_NODES[pathKeys[0]].z - startPos.z) < 0.6) {
    pathKeys.shift();
  }

  const waypoints = pathKeys.map(k => new THREE.Vector3(NAV_NODES[k].x, 0, NAV_NODES[k].z));
  waypoints.push(new THREE.Vector3(endPos.x, 0, endPos.z));
  return waypoints;
}

function initRoamSpots() {
  ROAM_SPOTS = [
    { id: "pantry_coffee", pos: new THREE.Vector3(-13.5, 0, -10.2), rotY: Math.PI, label: "Membuat kopi di Pantry", pose: "stand" },
    { id: "pantry_bar", pos: new THREE.Vector3(-9.5, 0, -7.8), rotY: -Math.PI / 2, label: "Istirahat di bar Pantry", pose: "stand" },
    { id: "billiard_1", pos: new THREE.Vector3(-12.2, 0, 5.5), rotY: 0, label: "Main billiard di area santai", pose: "billiard" },
    { id: "billiard_2", pos: new THREE.Vector3(-8.8, 0, 8.2), rotY: -Math.PI / 2, label: "Menonton game billiard", pose: "stand" },
    { id: "sofa_1", pos: sofaSeats[0] ? sofaSeats[0].pos : new THREE.Vector3(-1.8, 0, 8.8), rotY: sofaSeats[0] ? sofaSeats[0].rotY : Math.PI, label: "Duduk santai di Sofa Lounge", pose: "sit_sofa" },
    { id: "sofa_2", pos: sofaSeats[1] ? sofaSeats[1].pos : new THREE.Vector3(-1.8, 0, 10.8), rotY: sofaSeats[1] ? sofaSeats[1].rotY : Math.PI, label: "Istirahat di Sofa Lounge", pose: "sit_sofa" },
    { id: "window_look", pos: new THREE.Vector3(-7.5, 0, -11.5), rotY: Math.PI, label: "Melihat pemandangan jendela", pose: "stand" },
    { id: "visit_budi", pos: new THREE.Vector3(3.9, 0, -6.75), rotY: Math.PI / 2, label: "Menuju koridor ruangan Budi", pose: "stand" },
    { id: "meeting_check", pos: new THREE.Vector3(3.9, 0, 5.0), rotY: Math.PI / 2, label: "Mengecek ruang rapat", pose: "stand" },
    { id: "dev_whiteboard", pos: new THREE.Vector3(-4.0, 0, -2.2), rotY: -Math.PI / 2, label: "Diskusi arsitektur di Whiteboard Dev", pose: "stand" },
    { id: "dev_server", pos: new THREE.Vector3(0.6, 0, -11.5), rotY: 0, label: "Mengecek status Server Rack", pose: "stand" }
  ];
}

function buildDecorAndPlants() {
  const credenza = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.15, 0.95), mat(0xdcb88e, 0.65));
  credenza.position.set(-6.8, 0.58, 11.2);
  credenza.castShadow = true;
  credenza.receiveShadow = true;
  scene.add(credenza);

  createSmallTablePlant(-6.3, 1.16, 11.2);

  createIndoorPlant(-8.8, 5.2, 1.0);
  createIndoorPlant(2.5, 11.5, 1.05);
  createIndoorPlant(-15.5, 2.0, 1.0);
  createIndoorPlant(4.2, -11.5, 0.95);
}

function createIndoorPlant(x, z, scale = 1.0) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.75, 16), mat(0xf8fafc, 0.4));
  pot.position.y = 0.38;
  pot.castShadow = true;
  group.add(pot);

  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.05, 16), mat(0x451a03, 0.95));
  soil.position.y = 0.74;
  group.add(soil);

  const leafMat = mat(0x2d6a4f, 0.7);
  const leafMatLight = mat(0x40916c, 0.7);
  [0, 1.1, 2.2, 3.3, 4.4, 5.5].forEach((ang, idx) => {
    const leafPivot = new THREE.Group();
    leafPivot.position.y = 0.75;
    leafPivot.rotation.y = ang;
    leafPivot.rotation.z = 0.35 + (idx % 2) * 0.2;

    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      idx % 2 === 0 ? leafMat : leafMatLight
    );
    leaf.scale.set(0.35, 1.8, 0.85);
    leaf.position.y = 0.45;
    leaf.castShadow = true;
    leafPivot.add(leaf);
    group.add(leafPivot);
  });

  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  scene.add(group);
}

function createSmallTablePlant(x, y, z, parent = scene) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.28, 12), mat(0xffffff, 0.4));
  pot.position.y = 0.14;
  pot.castShadow = true;
  group.add(pot);

  const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), mat(0x2d6a4f, 0.8));
  foliage.position.y = 0.36;
  foliage.castShadow = true;
  group.add(foliage);

  group.position.set(x, y, z);
  parent.add(group);
}

/* =========================================================================
   7. CHARACTER BUILDER (PORTED DARI kantor-ai-agent-local-main/src/character.js)
   ========================================================================= */
const SKIN_PALETTE = ["#f3d2b3", "#e3b48a", "#c98f62", "#a97047", "#8a5a38"];
const PANTS_PALETTE = ["#2f3a4a", "#3b3b4f", "#4a3f35", "#2a2f3a", "#454a57"];

const charMatCache = new Map();
function charMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!charMatCache.has(key)) {
    charMatCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  }
  return charMatCache.get(key);
}

const charGeoCache = new Map();
function charGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!charGeoCache.has(key)) {
    charGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
  }
  return charGeoCache.get(key);
}

function charBox(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(
    charGeo(w, h, d),
    typeof color === "string" ? charMat(color, opts) : color
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const clampVal = (v, a, b) => Math.min(b, Math.max(a, v));
const dampVal = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const lerpVal = (a, b, t) => a + (b - a) * t;

function shadeHex(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

function buildHair(head, look, hairColor) {
  const hair = new THREE.Group();
  hair.add(charBox(0.5, 0.14, 0.5, hairColor, 0, 0.47, 0));
  hair.add(charBox(0.5, 0.07, 0.07, hairColor, 0, 0.42, 0.235));
  hair.add(charBox(0.5, 0.3, 0.1, hairColor, 0, 0.32, -0.22));
  if (look.style === "long") {
    hair.add(charBox(0.5, 0.6, 0.12, hairColor, 0, 0.14, -0.22));
    hair.add(charBox(0.07, 0.3, 0.3, hairColor, 0.245, 0.3, -0.05));
    hair.add(charBox(0.07, 0.3, 0.3, hairColor, -0.245, 0.3, -0.05));
  } else if (look.style === "bun") {
    hair.add(charBox(0.2, 0.2, 0.2, hairColor, 0, 0.64, -0.12));
  } else {
    hair.add(charBox(0.07, 0.2, 0.3, hairColor, 0.245, 0.34, -0.05));
    hair.add(charBox(0.07, 0.2, 0.3, hairColor, -0.245, 0.34, -0.05));
  }
  head.add(hair);
}

function buildHijab(head, color) {
  const g = new THREE.Group();
  const dark = shadeHex(color, -0.08);
  g.add(charBox(0.56, 0.16, 0.56, color, 0, 0.47, -0.01));
  g.add(charBox(0.56, 0.52, 0.16, color, 0, 0.2, -0.22));
  g.add(charBox(0.08, 0.46, 0.4, color, 0.255, 0.26, -0.02));
  g.add(charBox(0.08, 0.46, 0.4, color, -0.255, 0.26, -0.02));
  g.add(charBox(0.2, 0.06, 0.06, dark, 0, 0.44, 0.255));
  g.add(charBox(0.58, 0.2, 0.5, dark, 0, -0.04, -0.02));
  head.add(g);
}

const characterPickables = [];

function spawnOfficeCharacters() {
  // 1. Sarah (Front Desk) -> Desk Index 2 (Left-Front) — Hijab Lavender seperti Siti di kantor-ai-agent-local-main
  avatars["receptionist"] = createCharacter({
    id: "receptionist",
    name: "Sarah",
    divisionColor: "#2fbf71",
    index: 0,
    leader: false,
    look: { skin: 1, hair: "#000000", style: "long", hijab: "#e8d5f2" },
    deskSeatPos: deskSeats[2].seatPos,
    deskRotY: deskSeats[2].seatRotY,
    workLabel: "Mengecek jadwal tamu",
    initialState: "working",
    roamDelay: 11
  });

  // 2. Clara (Marketing) -> Desk Index 0 (Left-Back) — Bun + Glasses seperti Rina/Dewi di kantor-ai-agent-local-main
  avatars["marketing"] = createCharacter({
    id: "marketing",
    name: "Clara",
    divisionColor: "#ff5fa2",
    index: 1,
    leader: false,
    look: { skin: 1, hair: "#5a3a22", style: "bun", glasses: true },
    deskSeatPos: deskSeats[0].seatPos,
    deskRotY: deskSeats[0].seatRotY,
    workLabel: "Menyusun ide Reels viral",
    initialState: "working",
    roamDelay: 14
  });

  // 3. Alex (Tech Dev) -> Desk Index 4 (Right-Mid) — Tech Lead (Leader pakai dasi + kacamata seperti Arief)
  avatars["developer"] = createCharacter({
    id: "developer",
    name: "Alex",
    divisionColor: "#8a5cf6",
    index: 2,
    leader: true,
    look: { skin: 2, hair: "#1c1c1c", style: "short", glasses: true },
    deskSeatPos: deskSeats[4].seatPos,
    deskRotY: deskSeats[4].seatRotY,
    workLabel: "Optimasi API & Socket",
    initialState: "working",
    roamDelay: 17
  });

  // 4. Budi (Manager) -> Desk Index 7 (Executive Glass Room) — Head Leader pakai dasi + kacamata
  avatars["manager"] = createCharacter({
    id: "manager",
    name: "Budi",
    divisionColor: "#4f7cff",
    index: 3,
    leader: true,
    look: { skin: 2, hair: "#222222", style: "short", glasses: true },
    deskSeatPos: deskSeats[7].seatPos,
    deskRotY: deskSeats[7].seatRotY,
    workLabel: "Menyampaikan arahan",
    initialState: "working",
    roamDelay: 20
  });

  // 5. Faisal Ravaneli (Fullstack • one-asco-ecosystem/mobile) -> Desk Index 3 (Right-Back)
  avatars["faisal"] = createCharacter({
    id: "faisal",
    name: "Faisal Ravaneli",
    divisionColor: "#0ea5e9",
    index: 4,
    leader: true,
    look: { skin: 2, hair: "#1c1c1c", style: "short", glasses: true },
    deskSeatPos: deskSeats[3].seatPos,
    deskRotY: deskSeats[3].seatRotY,
    workLabel: "Coding one-asco/mobile",
    initialState: "working",
    roamDelay: 16
  });

  // 6. Syaugi Askar (Fullstack • tpf_pos_mobile) -> Desk Index 1 (Left-Mid)
  avatars["syaugi"] = createCharacter({
    id: "syaugi",
    name: "Syaugi Askar",
    divisionColor: "#14b8a6",
    index: 5,
    leader: true,
    look: { skin: 1, hair: "#2b1d16", style: "short" },
    deskSeatPos: deskSeats[1].seatPos,
    deskRotY: deskSeats[1].seatRotY,
    workLabel: "Coding tpf_pos_mobile",
    initialState: "working",
    roamDelay: 19
  });

  // 7. Guntara Gumelar (Fullstack • pivore_mobile) -> Desk Index 5 (Right-Front)
  avatars["guntara"] = createCharacter({
    id: "guntara",
    name: "Guntara Gumelar",
    divisionColor: "#f59e0b",
    index: 6,
    leader: true,
    look: { skin: 3, hair: "#18181b", style: "short", glasses: true },
    deskSeatPos: deskSeats[5].seatPos,
    deskRotY: deskSeats[5].seatRotY,
    workLabel: "Coding pivore_mobile",
    initialState: "working",
    roamDelay: 22
  });

  // 8. Lisa (Finance Specialist • Rekonsiliasi BCA & BRI) -> Desk Index 6 (West Corridor Finance Station)
  avatars["lisa"] = createCharacter({
    id: "lisa",
    name: "Lisa",
    divisionColor: "#10b981",
    index: 7,
    leader: false,
    look: { skin: 1, hair: "#1c1917", style: "ponytail", glasses: true },
    deskSeatPos: deskSeats[6].seatPos,
    deskRotY: deskSeats[6].seatRotY,
    workLabel: "Rekonsiliasi BCA & BRI",
    initialState: "working",
    roamDelay: 15
  });
}

function createCharacter(cfg) {
  const look = cfg.look || { skin: 1, hair: "#1c1c1c", style: "short" };
  const skin = SKIN_PALETTE[look.skin ?? 1];
  const hairColor = look.hair || "#1c1c1c";
  const leader = Boolean(cfg.leader);
  const divisionColor = cfg.divisionColor || "#4f7cff";
  const index = cfg.index || 0;

  const shirt = leader ? "#2d3748" : shadeHex(divisionColor, [-0.06, 0.0, 0.08, -0.12][index % 4]);
  const pants = PANTS_PALETTE[(cfg.name.length + index) % PANTS_PALETTE.length];

  const root = new THREE.Group();
  root.name = cfg.id;
  root.position.copy(cfg.deskSeatPos);
  root.rotation.y = cfg.deskRotY;

  // Green Selection Ring on Floor
  const ringGeo = new THREE.RingGeometry(0.55, 0.65, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
  const floorRing = new THREE.Mesh(ringGeo, ringMat);
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.y = 0.02;
  root.add(floorRing);

  // Scale wrapper agar proporsi karakter kantor-ai-agent-local-main pas dengan ukuran meja & kursi kantor kita
  const scaleGroup = new THREE.Group();
  scaleGroup.scale.setScalar(1.38);
  root.add(scaleGroup);

  const hips = new THREE.Group();
  scaleGroup.add(hips);

  // Torso (Persis dari kantor-ai-agent-local-main/src/character.js)
  hips.add(charBox(0.52, 0.6, 0.3, shirt, 0, 0.3, 0));
  if (leader) {
    // Kerah putih & dasi warna divisi untuk Leader
    hips.add(charBox(0.14, 0.34, 0.02, "#f5f5f5", 0, 0.38, 0.16));
    hips.add(charBox(0.07, 0.3, 0.02, divisionColor, 0, 0.36, 0.17));
  } else {
    // Tali lanyard & ID Card untuk Anggota Tim
    hips.add(charBox(0.05, 0.3, 0.02, "#f4f4f4", 0.1, 0.36, 0.16));
    hips.add(charBox(0.12, 0.14, 0.02, "#ffffff", 0.1, 0.2, 0.16));
  }

  // Head (Persis dari kantor-ai-agent-local-main/src/character.js)
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0);
  hips.add(head);
  head.add(charBox(0.46, 0.46, 0.46, skin, 0, 0.25, 0));
  head.add(charBox(0.1, 0.1, 0.1, skin, 0, 0.02, 0));
  head.add(charBox(0.07, 0.08, 0.02, "#1b1b1b", 0.11, 0.28, 0.235));
  head.add(charBox(0.07, 0.08, 0.02, "#1b1b1b", -0.11, 0.28, 0.235));
  head.add(charBox(0.1, 0.03, 0.02, "#8a4545", 0, 0.12, 0.235));

  if (look.glasses) {
    const lens = charMat("#9ec5ff", { transparent: true, opacity: 0.35 });
    head.add(charBox(0.16, 0.13, 0.02, lens, 0.11, 0.28, 0.245));
    head.add(charBox(0.16, 0.13, 0.02, lens, -0.11, 0.28, 0.245));
    head.add(charBox(0.4, 0.02, 0.02, "#202020", 0, 0.3, 0.255));
  }
  if (look.hijab) buildHijab(head, look.hijab);
  else buildHair(head, look, hairColor);

  // Legs (2-segmen: thigh & knee + sepatu, persis dari kantor-ai-agent-local-main/src/character.js)
  const legs = [];
  for (const side of [1, -1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.13, 0, 0);
    thigh.add(charBox(0.2, 0.4, 0.2, pants, 0, -0.2, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.4, 0);
    knee.add(charBox(0.2, 0.4, 0.2, pants, 0, -0.2, 0));
    knee.add(charBox(0.22, 0.08, 0.3, "#1f1f24", 0, -0.42, 0.05));
    thigh.add(knee);
    hips.add(thigh);
    legs.push({ thigh, knee });
  }

  // Arms (Persis dari kantor-ai-agent-local-main/src/character.js)
  const arms = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.35, 0.53, 0);
    pivot.add(charBox(0.17, 0.34, 0.17, shirt, 0, -0.17, 0));
    pivot.add(charBox(0.14, 0.14, 0.14, skin, 0, -0.41, 0));
    hips.add(pivot);
    arms.push(pivot);
  }

  // Hit area (klik karakter lebih gampang)
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.2, 1.0),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.set(0, 1.1, 0.1);
  hit.userData.agentId = cfg.id;
  root.add(hit);
  characterPickables.push(hit);

  scene.add(root);

  const seed = (index + 1) * 1.7 + cfg.name.length;

  const charObj = {
    ...cfg,
    root,
    hips,
    headPivot: head,
    legs,
    arms,
    floorRing,
    hit,
    sit: cfg.initialState === "roaming" ? 0 : 1,
    sitTarget: cfg.initialState === "roaming" ? 0 : 1,
    walk: 0,
    heading: cfg.deskRotY,
    action: null,
    actionT: 0,
    phase: Math.random() * 6,
    seed,
    state: "working",
    pose: "sit_desk",
    targetPos: null,
    targetRotY: cfg.deskRotY,
    waypoints: [],
    nextActionTimer: cfg.roamDelay,
    talkTimer: 0,
    activeTask: false,
    isBusy: false,
    taskLabel: null,
    headWorldPos: new THREE.Vector3(),
    wave() {
      this.action = "wave";
      this.actionT = 1.6;
    },
    stretch() {
      this.action = "stretch";
      this.actionT = 1.8;
    }
  };

  if (cfg.initialState === "roaming") {
    startRoamingToRandomSpot(charObj);
  } else {
    updateCharacterCardUI(charObj, cfg.workLabel, "working");
  }

  return charObj;
}

/* =========================================================================
   8. AUTONOMOUS ROUTINE & ANIMATION ENGINE (TASK-FOCUSED DESK SITTING)
   ========================================================================= */

/**
 * Memastikan karakter duduk di kursi meja kerjanya.
 * Jika sedang berada di luar (pantry / sofa), suruh jalan kembali ke meja.
 * Jika sudah di meja kerja, posisikan duduk rapi tanpa jeda/glitch.
 */
function ensureSeatedAtWorkDesk(avatar) {
  if (!avatar) return;
  const dx = avatar.deskSeatPos.x - avatar.root.position.x;
  const dz = avatar.deskSeatPos.z - avatar.root.position.z;
  const dist = Math.hypot(dx, dz);

  if (dist > 0.35) {
    returnToWorkDesk(avatar);
  } else {
    avatar.root.position.copy(avatar.deskSeatPos);
    avatar.heading = avatar.deskRotY;
    avatar.root.rotation.y = avatar.deskRotY;
    avatar.targetPos = null;
    avatar.walk = 0;
    avatar.state = "working";
    avatar.pose = "sit_desk";
    avatar.sitTarget = 1;
    avatar.currentSpot = { label: avatar.workLabel, pose: "sit_desk", isDesk: true };
  }
}

/**
 * Memberikan tugas aktif kepada karakter.
 * Karakter langsung kembali & duduk di mejanya, dan TIDAK AKAN jalan-jalan selama bertugas.
 */
function assignTaskToAvatar(agentId, taskLabel) {
  const avatar = avatars[agentId];
  if (!avatar) return;
  avatar.activeTask = true;
  avatar.isBusy = true;
  avatar.taskLabel = taskLabel || avatar.workLabel;
  ensureSeatedAtWorkDesk(avatar);
  updateCharacterCardUI(avatar, avatar.taskLabel, "busy");
}

/**
 * Menandai tugas telah selesai.
 * Karakter tetap duduk di meja kerja menyelesaikan catatan, lalu kembali ke rutinitas kerja normal.
 */
function completeTaskForAvatar(agentId, finalLabel) {
  const avatar = avatars[agentId];
  if (!avatar) return;
  avatar.taskLabel = finalLabel || avatar.workLabel;
  updateCharacterCardUI(avatar, avatar.taskLabel, "talking");
  ensureSeatedAtWorkDesk(avatar);

  setTimeout(() => {
    if (avatar && (avatar.taskLabel === finalLabel || !avatar.taskLabel)) {
      avatar.activeTask = false;
      avatar.isBusy = false;
      avatar.taskLabel = null;
      avatar.state = "working";
      avatar.pose = "sit_desk";
      avatar.sitTarget = 1;
      updateCharacterCardUI(avatar, avatar.workLabel, "working");
    }
  }, 7000);
}

function navigateAvatarToDestination(avatar, finalTargetPos, finalRotY) {
  avatar.waypoints = findNavPath(avatar.root.position, finalTargetPos);
  avatar.targetPos = avatar.waypoints.shift();
  avatar.targetRotY = finalRotY;
}

function startRoamingToRandomSpot(avatar) {
  // ATURAN UTAMA: Karakter yang sedang mengerjakan tugas DILARANG jalan-jalan / roaming!
  if (avatar.activeTask || avatar.isBusy) {
    ensureSeatedAtWorkDesk(avatar);
    return;
  }
  const spot = ROAM_SPOTS[Math.floor(Math.random() * ROAM_SPOTS.length)];
  avatar.state = "walking";
  avatar.pose = "stand";
  avatar.sitTarget = 0;
  avatar.currentSpot = spot;
  avatar.nextActionTimer = 12 + Math.random() * 8;
  navigateAvatarToDestination(avatar, spot.pos, spot.rotY);

  updateCharacterCardUI(avatar, spot.label, "roaming");
}

function returnToWorkDesk(avatar) {
  if (!avatar) return;
  const dx = avatar.deskSeatPos.x - avatar.root.position.x;
  const dz = avatar.deskSeatPos.z - avatar.root.position.z;
  const dist = Math.hypot(dx, dz);

  // Jika sudah dekat/di meja kerja, langsung duduk tanpa animasi berdiri
  if (dist < 0.25) {
    avatar.root.position.copy(avatar.deskSeatPos);
    avatar.heading = avatar.deskRotY;
    avatar.root.rotation.y = avatar.deskRotY;
    avatar.targetPos = null;
    avatar.waypoints = [];
    avatar.walk = 0;
    avatar.state = "working";
    avatar.pose = "sit_desk";
    avatar.sitTarget = 1;
    avatar.currentSpot = { label: avatar.workLabel, pose: "sit_desk", isDesk: true };
    const label = avatar.activeTask ? (avatar.taskLabel || avatar.workLabel) : avatar.workLabel;
    updateCharacterCardUI(avatar, label, avatar.activeTask ? "busy" : "working");
    return;
  }

  // Jika memang sedang di area lain (sofa / pantry), berjalan santai kembali ke meja kerja
  avatar.state = "walking";
  avatar.pose = "stand";
  avatar.sitTarget = 0;
  avatar.currentSpot = { label: avatar.workLabel, pose: "sit_desk", isDesk: true };
  avatar.nextActionTimer = 14 + Math.random() * 10;
  navigateAvatarToDestination(avatar, avatar.deskSeatPos, avatar.deskRotY);

  updateCharacterCardUI(avatar, "Kembali ke meja kerja", "roaming");
}

function updateCharacterCardUI(avatar, activityText, statusType) {
  const actEl = document.getElementById(`act-${avatar.id}`);
  const dotEl = document.getElementById(`dot-${avatar.id}`);
  if (actEl) actEl.innerText = activityText;
  if (dotEl) {
    dotEl.className = "agent-card-dot";
    if (avatar.activeTask || statusType === "busy") {
      dotEl.classList.add("busy");
    } else if (statusType === "roaming") {
      dotEl.classList.add("roaming");
    } else if (statusType === "talking") {
      dotEl.classList.add("talking");
    }
  }
}

function updateCharacterBehaviorAndAnimation(avatar, dt, t) {
  // 1. Hitung talkTimer jika aktif
  if (avatar.talkTimer > 0) {
    avatar.talkTimer -= dt;
  }

  // 2. Navigasi jalan kaki (jika sedang bergerak ke titik target tertentu)
  if (avatar.targetPos) {
    avatar.sitTarget = 0;
    const dx = avatar.targetPos.x - avatar.root.position.x;
    const dz = avatar.targetPos.z - avatar.root.position.z;
    const dist = Math.hypot(dx, dz);
    const step = 2.6 * dt;

    if (dist > 0.22) {
      avatar.root.position.x += (dx / dist) * step;
      avatar.root.position.z += (dz / dist) * step;
      const want = Math.atan2(dx, dz);
      let diff = want - avatar.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      avatar.heading += diff * Math.min(1, dt * 9);
      avatar.root.rotation.y = avatar.heading;
      avatar.walk = dampVal(avatar.walk, 1, 10, dt);
    } else {
      // Periksa apakah masih ada waypoint berikutnya sebelum sampai tujuan akhir
      if (avatar.waypoints && avatar.waypoints.length > 0) {
        avatar.targetPos = avatar.waypoints.shift();
        return;
      }

      // Telah sampai di posisi tujuan akhir
      avatar.root.position.copy(avatar.targetPos);
      avatar.heading = avatar.targetRotY;
      avatar.root.rotation.y = avatar.targetRotY;
      avatar.targetPos = null;
      avatar.walk = dampVal(avatar.walk, 0, 12, dt);

      if (avatar.currentSpot && avatar.currentSpot.isDesk) {
        avatar.state = "working";
        avatar.pose = "sit_desk";
        avatar.sitTarget = 1;
        const currentLabel = avatar.activeTask ? (avatar.taskLabel || avatar.workLabel) : avatar.workLabel;
        updateCharacterCardUI(avatar, currentLabel, avatar.activeTask ? "busy" : "working");
      } else {
        avatar.state = "resting";
        avatar.pose = avatar.currentSpot ? avatar.currentSpot.pose : "stand";
        avatar.sitTarget = avatar.pose.startsWith("sit") ? 1 : 0;
        updateCharacterCardUI(avatar, avatar.currentSpot ? avatar.currentSpot.label : "Sedang istirahat", "roaming");
      }
    }
  } else {
    // Tidak sedang berjalan kaki
    avatar.walk = dampVal(avatar.walk, 0, 12, dt);
    const isSitting = avatar.pose.startsWith("sit");
    avatar.sitTarget = isSitting ? 1 : 0;

    // Transisi jika status bicara selesai
    if (avatar.state === "talking" && avatar.talkTimer <= 0) {
      if (avatar.activeTask) {
        avatar.state = "working";
        avatar.pose = "sit_desk";
        avatar.sitTarget = 1;
        updateCharacterCardUI(avatar, avatar.taskLabel || avatar.workLabel, "busy");
      } else if (avatar.currentSpot && !avatar.currentSpot.isDesk) {
        avatar.state = "resting";
        updateCharacterCardUI(avatar, avatar.currentSpot.label, "roaming");
      } else {
        avatar.state = "working";
        avatar.pose = "sit_desk";
        avatar.sitTarget = 1;
        updateCharacterCardUI(avatar, avatar.workLabel, "working");
      }
    }

    avatar.nextActionTimer -= dt;
    if (avatar.nextActionTimer <= 0) {
      if (avatar.activeTask) {
        // SEDANG MENGERJAKAN TUGAS / HERMES AKTIF:
        // Karakter WAJIB TETAP DUDUK di meja kerjanya menghadap laptop!
        // DILARANG JALAN-JALAN sampai tugas selesai.
        if (Math.random() < 0.28) {
          avatar.stretch();
        }
        avatar.nextActionTimer = 14 + Math.random() * 12;
      } else if (forceBreakMode) {
        // Mode istirahat kantor sedang dinyalakan
        startRoamingToRandomSpot(avatar);
      } else if (avatar.state === "working") {
        // KONDISI NORMAL (TIDAK ADA TUGAS AKTIF DARI USER / HERMES):
        // Karakter TETAP BISA JALAN-JALAN santai keliling kantor (Pantry, Sofa Lounge, Billiard, Jendela)
        if (Math.random() < 0.45) {
          startRoamingToRandomSpot(avatar);
        } else {
          // Sesekali regangkan badan di kursi
          avatar.stretch();
          avatar.nextActionTimer = 12 + Math.random() * 10;
        }
      } else {
        // Jika sedang di luar meja saat jam santai habis, berjalan santai kembali ke meja kerja
        returnToWorkDesk(avatar);
      }
    }
  }

  // 3. Smooth Damped Pose Calculation
  avatar.sit = dampVal(avatar.sit, avatar.sitTarget, 7, dt);
  const sitting = avatar.sit;

  // Tinggi pinggul: berdiri 0.84, duduk di kursi meja 0.74 (pas di atas bantalan kursi), duduk di sofa 0.64
  const sitHipTarget = avatar.pose === "sit_sofa" ? 0.64 : 0.74;
  const hipY = lerpVal(0.84, sitHipTarget, sitting);
  const breathe = Math.sin(t * 2 + avatar.seed) * 0.008;
  avatar.hips.position.y = hipY + breathe;

  // Ayunan kaki jalan & tekukan lutut 90 derajat saat duduk
  const swing = Math.sin(t * 8 + avatar.phase) * 0.7 * avatar.walk;
  avatar.legs[0].thigh.rotation.x = (-Math.PI / 2) * sitting + swing * (1 - sitting);
  avatar.legs[1].thigh.rotation.x = (-Math.PI / 2) * sitting - swing * (1 - sitting);
  avatar.legs[0].knee.rotation.x = (Math.PI / 2) * sitting + Math.max(0, -swing) * 0.6;
  avatar.legs[1].knee.rotation.x = (Math.PI / 2) * sitting + Math.max(0, swing) * 0.6;

  // Gerakan tangan mengetik / bicara / mengayun saat jalan / wave / stretch
  const isWorkingAtDesk = (avatar.state === "working" || avatar.activeTask) && sitting > 0.5;
  const isTalking = avatar.talkTimer > 0;
  const typeSpeed = avatar.activeTask ? 15 : (isTalking ? 13 : (isWorkingAtDesk ? 10 : 5));
  const typeAmp = avatar.activeTask ? 0.14 : (isTalking ? 0.15 : (isWorkingAtDesk ? 0.08 : 0.03));
  const armsSeated = avatar.pose === "sit_sofa" ? -0.55 : -1.1;

  let aL = lerpVal(0, armsSeated + Math.sin(t * typeSpeed + 1) * typeAmp, sitting);
  let aR = lerpVal(0, armsSeated + Math.sin(t * typeSpeed + 3) * typeAmp, sitting);
  aL += -swing * 0.9 * (1 - sitting);
  aR += swing * 0.9 * (1 - sitting);
  let zL = 0;
  let zR = 0;

  if (avatar.action) {
    avatar.actionT -= dt;
    const k = clampVal(Math.min(avatar.actionT, 1.4 - avatar.actionT + 0.2) * 3, 0, 1);
    if (avatar.action === "wave") {
      zR = (2.4 + Math.sin(t * 11) * 0.3) * k;
      aR = lerpVal(aR, 0, k);
    } else if (avatar.action === "stretch") {
      aL = lerpVal(aL, -3.0, k);
      aR = lerpVal(aR, -3.0, k);
    }
    if (avatar.actionT <= 0) avatar.action = null;
  }

  avatar.arms[0].rotation.set(aR, 0, zR);
  avatar.arms[1].rotation.set(aL, 0, -zL);

  // Gerakan kepala menoleh halus & menatap layar monitor laptop saat duduk mengetik
  const headLook = Math.sin(t * 0.55 + avatar.seed) * (isWorkingAtDesk ? 0.08 : 0.25);
  avatar.headPivot.rotation.y = dampVal(avatar.headPivot.rotation.y, headLook, 5, dt);
  avatar.headPivot.rotation.x = dampVal(
    avatar.headPivot.rotation.x,
    (isWorkingAtDesk || avatar.activeTask) && sitting > 0.5 ? 0.18 : 0.03,
    5,
    dt
  );

  // Anchor posisi kartu putih di atas kepala
  avatar.headPivot.getWorldPosition(avatar.headWorldPos);
  avatar.headWorldPos.y += 0.88;
}

/* =========================================================================
   9. 2D SCREEN PROJECTION FOR WHITE FLOATING CARDS & SPEECH BUBBLES
   ========================================================================= */
function updateScreenOverlays() {
  Object.values(avatars).forEach(avatar => {
    const screenPos = avatar.headWorldPos.clone().project(camera);
    const isVisible = screenPos.z <= 1;
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

    const cardEl = document.getElementById(`card-${avatar.id}`);
    if (cardEl) {
      if (!isVisible) {
        cardEl.style.display = "none";
      } else {
        cardEl.style.display = "block";
        cardEl.style.left = `${x}px`;
        cardEl.style.top = `${y}px`;
      }
    }

    const bubbleEl = document.getElementById(`bubble-${avatar.id}`);
    if (bubbleEl && bubbleEl.classList.contains("show")) {
      if (!isVisible) {
        bubbleEl.style.display = "none";
      } else {
        bubbleEl.style.display = "block";
        bubbleEl.style.left = `${x}px`;
        bubbleEl.style.top = `${y - 52}px`;
      }
    }
  });
}

function showSpeechBubble(agentId, text) {
  const bubbleEl = document.getElementById(`bubble-${agentId}`);
  if (!bubbleEl) return;

  const textEl = bubbleEl.querySelector(".bubble-text");
  textEl.innerText = text;
  bubbleEl.classList.add("show");

  const duration = Math.max(5500, text.length * 75);
  clearTimeout(bubbleEl._hideTimeout);
  bubbleEl._hideTimeout = setTimeout(() => {
    bubbleEl.classList.remove("show");
  }, duration);
}

/* =========================================================================
   10. CAMERA TRANSITIONS & MAIN RENDER LOOP
   ========================================================================= */
function switchRoom(roomName) {
  activeRoom = roomName;
  const preset = CAMERA_PRESETS[roomName] || CAMERA_PRESETS.overview;
  targetCameraPos = preset.pos.clone();
  targetCameraLookAt = preset.target.clone();

  document.querySelectorAll(".cam-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.room === roomName);
  });
}

/* =========================================================================
   10. CAMERA TRANSITIONS & AGENT ROSTER SPECIFICATIONS
   ========================================================================= */
const AGENTS_ROSTER = {
  faisal: {
    id: "faisal",
    name: "Faisal Ravaneli",
    shortName: "Faisal",
    role: "Senior Fullstack Developer",
    division: "One-Asco Ecosystem",
    projectPath: "/Users/magnatech/project/one-asco-ecosystem/mobile",
    workspaceDisplay: "📱 one-asco-ecosystem/mobile",
    color: "#0ea5e9",
    avatar: "FR",
    greeting: "Halo! Saya Faisal Ravaneli, Senior Fullstack Developer yang memegang project One-Asco Mobile.",
    subGreeting: "Saya dapat membaca kode baris per baris dan memodifikasi file project secara langsung seperti Antigravity.",
    quickPrompts: [
      "Faisal, baca file lib/main.dart dari baris 1 sampai 50 dan jelaskan arsitekturnya!",
      "Faisal, cek file pubspec.yaml dan struktur folder lib/ di one-asco mobile, lalu laporkan ringkasannya!",
      "Faisal, periksa apakah ada bug atau error di salah satu screen di lib/, lalu bantu perbaiki langsung di kode!"
    ]
  },
  syaugi: {
    id: "syaugi",
    name: "Syaugi Askar",
    shortName: "Syaugi",
    role: "Senior Fullstack Developer",
    division: "TPF POS Ecosystem",
    projectPath: "/Users/magnatech/tpf_pos_mobile",
    workspaceDisplay: "🏪 tpf_pos_mobile",
    color: "#14b8a6",
    avatar: "SA",
    greeting: "Halo! Saya Syaugi Askar, Senior Fullstack Developer yang memegang project TPF POS Mobile.",
    subGreeting: "Saya bisa memeriksa file kode, mendeteksi baris spesifik, dan menerapkan patch langsung di tpf_pos_mobile.",
    quickPrompts: [
      "Syaugi, baca file pubspec.yaml baris 1 sampai 40 di tpf_pos_mobile dan jelaskan dependensinya!",
      "Syaugi, bagaimana alur transaksi POS dan printer struk di project tpf_pos_mobile?",
      "Syaugi, periksa dependensi dan pastikan tidak ada library yang conflict!"
    ]
  },
  guntara: {
    id: "guntara",
    name: "Guntara Gumelar",
    shortName: "Guntara",
    role: "Senior Fullstack Developer",
    division: "Pivore Ecosystem",
    projectPath: "/Users/magnatech/project/pivore_mobile",
    workspaceDisplay: "📦 pivore_mobile",
    color: "#f59e0b",
    avatar: "GG",
    greeting: "Halo! Saya Guntara Gumelar, Senior Fullstack Developer yang memegang project Pivore Mobile.",
    subGreeting: "Saya siap memeriksa baris kode, menganalisis bug, dan langsung memodifikasi fitur di pivore_mobile.",
    quickPrompts: [
      "Guntara, baca file pubspec.yaml baris 1 sampai 35 di pivore_mobile dan laporkan dependensinya!",
      "Guntara, cek isi folder lib/ dan pubspec.yaml di project pivore_mobile, lalu laporkan fitur apa saja yang ada!",
      "Guntara, analisis state management dan koneksi API backend di pivore_mobile!"
    ]
  },
  developer: {
    id: "developer",
    name: "Alex",
    shortName: "Alex",
    role: "Tech Lead & System Architect",
    division: "Tech Architecture",
    projectPath: "/Users/magnatech/project/SONI/kantor_virtual_3d",
    workspaceDisplay: "💻 kantor_virtual_3d",
    color: "#8a5cf6",
    avatar: "AL",
    greeting: "Halo! Saya Alex, Tech Lead yang mengawasi arsitektur sistem dan backend kantor kita.",
    subGreeting: "Suruh saya review arsitektur sistem backend, Socket.IO real-time server, atau optimasi alur agent.",
    quickPrompts: [
      "Alex, review arsitektur sistem backend dan Socket.IO kantor virtual kita!",
      "Alex, bagaimana rekomendasi optimasi performa komunikasi real-time antara server dan client 3D?",
      "Alex, jelaskan bagaimana Hermes Agent mengeksekusi tools di workspace lokal!"
    ]
  },
  manager: {
    id: "manager",
    name: "Budi",
    shortName: "Budi",
    role: "Project Manager & Sprint Lead",
    division: "Management & Operations",
    projectPath: "/Users/magnatech/project/SONI/kantor_virtual_3d/office_workspace",
    workspaceDisplay: "👔 office_workspace",
    color: "#4f7cff",
    avatar: "BU",
    greeting: "Halo! Saya Budi, Project Manager kantor ini.",
    subGreeting: "Suruh saya menyusun sprint backlog, membagi tugas developer, atau memantau progres sprint.",
    quickPrompts: [
      "Budi, kumpulkan laporan progres hari ini dari Faisal, Syaugi, dan Guntara lalu siapkan kirim ke WhatsApp saya!",
      "Budi, susun todo list prioritas sprint hari ini untuk Faisal, Syaugi, dan Guntara!",
      "Budi, buatkan status laporan progres sprint mingguan untuk seluruh tim!"
    ]
  },
  marketing: {
    id: "marketing",
    name: "Clara",
    shortName: "Clara",
    role: "Creative & Marketing Lead",
    division: "Creative & Growth",
    projectPath: "/Users/magnatech/project/SONI/kantor_virtual_3d/office_workspace",
    workspaceDisplay: "🎨 office_workspace",
    color: "#ff5fa2",
    avatar: "CL",
    greeting: "Halo! Saya Clara, Creative & Marketing Lead di kantor ini.",
    subGreeting: "Suruh saya menyusun ide campaign, caption Instagram/TikTok viral, atau strategi promosi produk.",
    quickPrompts: [
      "Clara, buatkan 3 ide konten Instagram Reels dan TikTok viral untuk promo produk kita!",
      "Clara, tulis caption menarik dengan hook kuat untuk peluncuran update aplikasi terbaru!",
      "Clara, susun strategi kampanye digital marketing bulan ini untuk menaikkan user acquisition!"
    ]
  },
  receptionist: {
    id: "receptionist",
    name: "Sarah",
    shortName: "Sarah",
    role: "Front Desk & Guest Relations",
    division: "Front Office",
    projectPath: "/Users/magnatech/project/SONI/kantor_virtual_3d/office_workspace",
    workspaceDisplay: "👩 Front Desk",
    color: "#2fbf71",
    avatar: "SA",
    greeting: "Selamat datang! Saya Sarah, Front Desk & Receptionist di kantor virtual ini.",
    subGreeting: "Suruh saya cek buku tamu, catat pengunjung baru, atau pandu navigasi ruangan kantor.",
    quickPrompts: [
      "Sarah, baca file BUKU_TAMU_HARI_INI.md di workspace lalu sebutkan siapa saja tamu hari ini!",
      "Sarah, tolong catat tamu baru Pak Budi dari PT Solusi Digital yang datang hari ini!",
      "Sarah, sebutkan ruangan apa saja yang ada di kantor virtual 3D ini beserta fungsinya!"
    ]
  },
  lisa: {
    id: "lisa",
    name: "Lisa",
    shortName: "Lisa",
    role: "Finance & Bank Reconciliation Specialist",
    division: "Finance & Accounting",
    projectPath: "/Users/magnatech/project/SONI/kantor_virtual_3d/office_workspace",
    workspaceDisplay: "💰 sonijulianto@gmail.com (BCA & BRI)",
    color: "#10b981",
    avatar: "LI",
    greeting: "Halo! Saya Lisa, Finance Specialist di kantor virtual ini.",
    subGreeting: "Tugas saya memantau email sonijulianto@gmail.com untuk seluruh mutasi perbankan BCA & BRI (uang masuk & keluar/pembayaran), serta melaporkan rekonsiliasinya setiap jam 10 malam via WhatsApp.",
    quickPrompts: [
      "Lisa, tolong cek email sonijulianto@gmail.com sekarang untuk transaksi mutasi BCA dan BRI hari ini!",
      "Lisa, berapa total uang masuk dan pengeluaran yang tercatat di rekening BCA dan BRI hari ini?",
      "Lisa, siapkan laporan rekonsiliasi mutasi keuangan hari ini untuk dikirim ke WhatsApp saya jam 10 malam!"
    ]
  }
};

// Obrolan History Mandiri per Agent
const agentHistories = {
  faisal: [],
  syaugi: [],
  guntara: [],
  developer: [],
  manager: [],
  marketing: [],
  receptionist: [],
  lisa: []
};

// Storage Keys for persistent chat history across page reloads
const STORAGE_KEY_HISTORIES = "office_agent_histories_v1";
const STORAGE_KEY_LOGS = "office_activity_logs_v1";
const STORAGE_KEY_ACTIVE_AGENT = "office_active_chat_agent_v1";

function loadHistoriesFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_HISTORIES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach(agentId => {
          if (Array.isArray(parsed[agentId])) {
            agentHistories[agentId] = parsed[agentId].map(item => {
              if (item.time) item.time = new Date(item.time);
              return item;
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn("[Storage] Gagal membaca riwayat chat dari localStorage:", err);
  }
}

function saveHistoriesToStorage() {
  try {
    const clean = {};
    for (const [id, list] of Object.entries(agentHistories)) {
      if (Array.isArray(list)) {
        clean[id] = list.slice(-100);
      }
    }
    localStorage.setItem(STORAGE_KEY_HISTORIES, JSON.stringify(clean));
  } catch (err) {
    console.warn("[Storage] Gagal menyimpan riwayat chat ke localStorage:", err);
  }
}

let storedLogs = [];
function loadLogsFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LOGS);
    if (saved) {
      const logs = JSON.parse(saved);
      if (Array.isArray(logs)) {
        storedLogs = logs;
        const logBody = document.getElementById("log-body");
        if (logBody) {
          logBody.innerHTML = "";
          logs.forEach(log => {
            const msgEl = document.createElement("div");
            msgEl.className = `log-msg ${log.type || "agent"}`;
            msgEl.innerHTML = `<div class="log-msg-sender">${esc(log.sender)}</div><div>${log.html || esc(log.text)}</div>`;
            logBody.appendChild(msgEl);
          });
          logBody.scrollTop = logBody.scrollHeight;
        }
      }
    }
  } catch (err) {
    console.warn("[Storage] Gagal membaca logs dari localStorage:", err);
  }
}

function saveLogToStorage(sender, textOrHtml, type) {
  try {
    storedLogs.push({ sender, html: textOrHtml, type, timestamp: Date.now() });
    if (storedLogs.length > 50) storedLogs = storedLogs.slice(-50);
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(storedLogs));
  } catch (err) {
    // ignore
  }
}

let currentChatAgentId = null;

/* =========================================================================
   MARKDOWN RENDERER (Persis kantor-ai-agent-local-main)
   ========================================================= */
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineMarkdown(text) {
  let s = esc(text);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

function renderMarkdown(src) {
  const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const isBlockStart = (l) => /^```/.test(l) || /^\s*([-*•]|\d+[.)])\s+/.test(l) || /^#{1,4}\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><button type="button" class="copy-btn">Salin</button><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push(`<h${h[1].length <= 2 ? 3 : 4}>${inlineMarkdown(h[2])}</h${h[1].length <= 2 ? 3 : 4}>`);
      i += 1;
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^\s*[-*•]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(inlineMarkdown(lines[i]));
      i += 1;
    }
    if (!buf.length) {
      buf.push(inlineMarkdown(line));
      i += 1;
    }
    out.push(`<p>${buf.join("<br>")}</p>`);
  }
  return out.join("");
}

function switchRoom(roomName) {
  activeRoom = roomName;
  const preset = CAMERA_PRESETS[roomName] || CAMERA_PRESETS.overview;
  targetCameraPos = preset.pos.clone();
  targetCameraLookAt = preset.target.clone();

  document.querySelectorAll(".cam-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.room === roomName);
  });
}

function focusOnAgent(agentId) {
  selectAndChatWithAgent(agentId);
}

function updateCameraTransition(delta) {
  if (targetCameraPos && targetCameraLookAt) {
    const lerpSpeed = delta * 4.0;
    camera.position.lerp(targetCameraPos, lerpSpeed);
    controls.target.lerp(targetCameraLookAt, lerpSpeed);

    if (camera.position.distanceTo(targetCameraPos) < 0.12) {
      targetCameraPos = null;
      targetCameraLookAt = null;
    }
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  updateAtmosphere(delta);
  Object.values(avatars).forEach(avatar => updateCharacterBehaviorAndAnimation(avatar, delta, time));
  updateCameraTransition(delta);
  controls.update();
  updateScreenOverlays();

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =========================================================================
   11. CHAT PANEL LOGIC & INTERACTION
   ========================================================================= */
function scrollPanelToBottom(force = false) {
  const panelMsgEl = document.getElementById("panel-messages");
  if (!panelMsgEl) return;
  const nearBottom = panelMsgEl.scrollHeight - panelMsgEl.scrollTop - panelMsgEl.clientHeight < 160;
  if (force || nearBottom) {
    panelMsgEl.scrollTop = panelMsgEl.scrollHeight;
  }
}

function renderColleaguesBar(activeId) {
  const bar = document.getElementById("panel-mates-bar");
  if (!bar) return;
  bar.innerHTML = "";

  Object.values(AGENTS_ROSTER).forEach(m => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mate-btn ${m.id === activeId ? "active" : ""}`;
    btn.innerHTML = `
      <span class="mate-icon" style="background:${m.color}">${m.avatar}</span>
      <span>${m.shortName}</span>
    `;
    btn.addEventListener("click", () => {
      selectAndChatWithAgent(m.id);
    });
    bar.appendChild(btn);
  });
}

function syncWorkspaceSelect(agent) {
  const panelWsSelect = document.getElementById("panel-project-select");
  const topWsSelect = document.getElementById("project-workspace-select");
  if (!panelWsSelect) return;

  // Isi options dari topWsSelect jika belum ada
  if (topWsSelect && panelWsSelect.options.length <= 1) {
    panelWsSelect.innerHTML = "";
    Array.from(topWsSelect.options).forEach(opt => {
      const newOpt = document.createElement("option");
      newOpt.value = opt.value;
      newOpt.textContent = opt.textContent;
      panelWsSelect.appendChild(newOpt);
    });
  }

  // Pilih workspace yang paling cocok dengan agen ini
  if (agent && agent.projectPath) {
    const match = Array.from(panelWsSelect.options).find(opt => opt.value === agent.projectPath);
    if (match) {
      panelWsSelect.value = match.value;
    } else {
      panelWsSelect.value = "auto";
    }
  }
}

function buildMediaHtml(media) {
  if (!media || !media.url) return "";
  const isVideo = media.type === "video" || /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(media.url);
  const caption = media.name || media.fileName || "";
  if (isVideo) {
    return `
      <div class="chat-media-attachment">
        <video src="${esc(media.url)}" controls class="chat-media-video" preload="metadata"></video>
        ${caption ? `<div class="chat-media-caption">🎬 ${esc(caption)}</div>` : ''}
      </div>
    `;
  } else {
    return `
      <div class="chat-media-attachment">
        <a href="${esc(media.url)}" target="_blank" rel="noopener" title="Buka gambar penuh">
          <img src="${esc(media.url)}" alt="${esc(caption || 'Gambar')}" class="chat-media-img" loading="lazy" />
        </a>
        ${caption ? `<div class="chat-media-caption">🖼️ ${esc(caption)}</div>` : ''}
      </div>
    `;
  }
}

function appendBubbleToPanel(role, text, tools = [], model = "", animate = true, time = null, media = null) {
  const panelMsgEl = document.getElementById("panel-messages");
  const agent = AGENTS_ROSTER[currentChatAgentId];

  // Bersihkan empty state jika ada
  const emptyState = panelMsgEl.querySelector(".panel-empty-state");
  if (emptyState) emptyState.remove();

  // Kosongkan prompt chips saat chat sudah berjalan
  const quickEl = document.getElementById("panel-quick");
  if (quickEl) quickEl.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = `panel-msg ${role}`;
  if (!animate) wrap.style.animation = "none";

  const dateObj = time ? (time instanceof Date ? time : new Date(time)) : new Date();
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mediaHtml = buildMediaHtml(media);

  if (role === "user") {
    const textHtml = text ? `<div>${esc(text)}</div>` : '';
    wrap.innerHTML = `<div class="bubble" title="${timeStr}">${mediaHtml}${textHtml}</div>`;
  } else {
    const formattedHtml = text ? renderMarkdown(text) : '';
    const toolsBadge = (tools && tools.length > 0)
      ? `<div class="msg-tools-badge">⚡ Hermes Tools: <code>${tools.join(", ")}</code> ${model ? "• " + model : ""}</div>`
      : (model ? `<div style="margin-top:6px;font-size:10px;color:#94a3b8;font-weight:600;">🤖 Model: ${model}</div>` : "");

    wrap.innerHTML = `
      <div class="panel-msg-header">
        <span class="sender-name">${agent ? agent.name : "AI Agent"}</span>
        <span>•</span>
        <span>${timeStr}</span>
      </div>
      <div class="bubble">
        ${mediaHtml}
        ${formattedHtml}
        ${toolsBadge}
      </div>
    `;
  }

  panelMsgEl.appendChild(wrap);
  scrollPanelToBottom();
}

/* =========================================================================
   ANTIGRAVITY TOOL CALL CARD RENDERER (Read Files, Diffs, Commands)
   ========================================================================= */
function buildToolCardHtml(data) {
  const isStarted = data.status === "started";
  const actionType = data.action_type || "generic";

  let icon = "⚙️";
  let title = `Tool: ${data.tool_name}`;
  if (actionType === "read") {
    icon = "📖";
    title = "Membaca File";
  } else if (actionType === "edit") {
    icon = "✏️";
    title = "Modifikasi Kode";
  } else if (actionType === "command") {
    icon = "⚡";
    title = "Terminal Command";
  } else if (actionType === "search") {
    icon = "🔍";
    title = "Pencarian Kode";
  }

  const filePill = data.file_path
    ? `<code class="tool-file-pill" title="${esc(data.abs_path || data.file_path)}">${esc(data.file_path)}</code>`
    : "";

  const lineTag = data.line_range
    ? `<span class="tool-line-tag">${esc(data.line_range)}</span>`
    : "";

  const statusBadge = isStarted
    ? `<span class="tool-status-badge running"><span class="spinner-dot"></span> Sedang berjalan...</span>`
    : `<span class="tool-status-badge done">✓ Selesai</span>`;

  let bodyContent = "";
  if (actionType === "read") {
    bodyContent = `
      <div style="font-weight:600;color:#1e293b;">${esc(data.activity_label || "Membaca file...")}</div>
      ${data.result_preview ? `<pre class="tool-code-snippet"><code>${esc(data.result_preview.slice(0, 350))}</code></pre>` : ""}
    `;
  } else if (actionType === "edit") {
    let diffHtml = "";
    if (data.old_code) {
      diffHtml += `
        <div class="diff-block diff-del">
          <span class="diff-sign">-</span>
          <pre class="diff-code"><code>${esc(data.old_code)}</code></pre>
        </div>`;
    }
    if (data.new_code) {
      diffHtml += `
        <div class="diff-block diff-add">
          <span class="diff-sign">+</span>
          <pre class="diff-code"><code>${esc(data.new_code)}</code></pre>
        </div>`;
    }
    bodyContent = `
      <div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${esc(data.activity_label || "Memodifikasi file...")}</div>
      ${diffHtml ? `<div class="tool-diff-container"><div class="diff-header-label">📝 Diff Perubahan Kode:</div>${diffHtml}</div>` : ""}
      ${(!data.old_code && !data.new_code && data.result_preview) ? `<pre class="tool-code-snippet"><code>${esc(data.result_preview)}</code></pre>` : ""}
    `;
  } else if (actionType === "command") {
    bodyContent = `
      <div class="tool-terminal-box">
        <div class="tool-terminal-cmd">${esc(data.command || data.activity_label)}</div>
        ${data.result_preview ? `<pre class="tool-terminal-out">${esc(data.result_preview)}</pre>` : ""}
      </div>
    `;
  } else {
    bodyContent = `
      <div>${esc(data.activity_label || `Tool ${data.tool_name}`)}</div>
      ${data.result_preview ? `<pre class="tool-code-snippet"><code>${esc(data.result_preview.slice(0, 300))}</code></pre>` : ""}
    `;
  }

  return `
    <div class="tool-card-header" onclick="this.parentElement.classList.toggle('collapsed')" title="Klik untuk lipat / buka detail">
      <div class="tool-card-left">
        <span class="tool-icon">${icon}</span>
        <span class="tool-title">${title}</span>
        ${filePill}
        ${lineTag}
      </div>
      <div class="tool-card-right">
        ${statusBadge}
        <span class="tool-chevron">▾</span>
      </div>
    </div>
    <div class="tool-card-body">
      ${bodyContent}
    </div>
  `;
}

function appendToolCardToPanel(data, animate = true) {
  const panelMsgEl = document.getElementById("panel-messages");
  if (!panelMsgEl) return;

  // Bersihkan empty state jika ada
  const emptyState = panelMsgEl.querySelector(".panel-empty-state");
  if (emptyState) emptyState.remove();

  const callId = data.call_id || `tool_${Date.now()}`;
  let cardEl = document.getElementById(`tool-call-${callId}`);

  if (cardEl) {
    const isCollapsed = cardEl.classList.contains("collapsed");
    cardEl.className = `tool-call-card action-${data.action_type || "generic"}${isCollapsed ? " collapsed" : ""}`;
    cardEl.innerHTML = buildToolCardHtml(data);
  } else {
    cardEl = document.createElement("div");
    cardEl.id = `tool-call-${callId}`;
    cardEl.className = `tool-call-card action-${data.action_type || "generic"}`;
    if (!animate) cardEl.style.animation = "none";
    cardEl.innerHTML = buildToolCardHtml(data);

    const typingIndicator = document.getElementById("panel-typing-indicator");
    if (typingIndicator) {
      panelMsgEl.insertBefore(cardEl, typingIndicator);
    } else {
      panelMsgEl.appendChild(cardEl);
    }
  }

  scrollPanelToBottom();
}

function showTypingIndicator(label = "Sedang memproses instruksi Anda...") {
  removeTypingIndicator();
  const panelMsgEl = document.getElementById("panel-messages");
  const agent = AGENTS_ROSTER[currentChatAgentId];

  const wrap = document.createElement("div");
  wrap.className = "panel-typing";
  wrap.id = "panel-typing-indicator";
  wrap.innerHTML = `
    <span class="typing-dots"><i></i><i></i><i></i></span>
    <span id="typing-label">${agent ? agent.shortName : "Agen"}: ${label}</span>
  `;
  panelMsgEl.appendChild(wrap);
  scrollPanelToBottom();
}

function updateTypingIndicatorLabel(label) {
  const labelEl = document.getElementById("typing-label");
  if (labelEl) labelEl.textContent = label;
}

function removeTypingIndicator() {
  const el = document.getElementById("panel-typing-indicator");
  if (el) el.remove();
}

function renderPanelMessages(agentId) {
  const panelMsgEl = document.getElementById("panel-messages");
  const quickEl = document.getElementById("panel-quick");
  const agent = AGENTS_ROSTER[agentId];
  if (!agent) return;

  panelMsgEl.innerHTML = "";
  quickEl.innerHTML = "";

  const history = agentHistories[agentId] || [];

  if (history.length === 0) {
    // Tampilan awal / Welcome Greeting & Panduan
    const emptyState = document.createElement("div");
    emptyState.className = "panel-empty-state";
    emptyState.innerHTML = `
      <div class="empty-avatar" style="background:${agent.color}">${agent.avatar}</div>
      <div class="empty-title">${agent.greeting}</div>
      <div class="empty-desc">${agent.subGreeting}</div>
    `;
    panelMsgEl.appendChild(emptyState);

    // Render Quick Action Chips untuk agen ini
    (agent.quickPrompts || []).forEach(promptText => {
      const qBtn = document.createElement("button");
      qBtn.type = "button";
      qBtn.className = "quick-btn";
      qBtn.textContent = promptText;
      qBtn.addEventListener("click", () => {
        submitPanelMessage(promptText);
      });
      quickEl.appendChild(qBtn);
    });
  } else {
    // Render percakapan yang pernah terjadi (User, Tool Card, Assistant)
    history.forEach(m => {
      if (m.role === "tool" && m.data) {
        appendToolCardToPanel(m.data, false);
      } else {
        appendBubbleToPanel(m.role, m.text, m.tools, m.model, false, m.time, m.media);
      }
    });
  }

  scrollPanelToBottom(true);
}

function selectAndChatWithAgent(agentId) {
  if (!AGENTS_ROSTER[agentId]) {
    agentId = "faisal";
  }
  currentChatAgentId = agentId;
  const agent = AGENTS_ROSTER[agentId];
  const avatar = avatars[agentId];

  // 1. Karakter 3D Melambaikan tangan menyapa
  if (avatar && typeof avatar.wave === "function") {
    avatar.wave();
  }

  // 2. Kamera fokus menghadap meja kerja agen
  if (avatar) {
    targetCameraLookAt = avatar.root.position.clone().add(new THREE.Vector3(1.2, 1.4, -0.4));
    targetCameraPos = avatar.root.position.clone().add(new THREE.Vector3(-4.8, 4.6, 4.8));
  }

  // 3. Set Dynamic Color Theme
  document.documentElement.style.setProperty("--agent-color", agent.color);

  // 4. Update Header Panel
  const avatarEl = document.getElementById("panel-avatar");
  if (avatarEl) avatarEl.style.background = agent.color;
  const avatarTxt = document.getElementById("panel-avatar-text");
  if (avatarTxt) avatarTxt.textContent = agent.avatar;
  const nameEl = document.getElementById("panel-who-name");
  if (nameEl) nameEl.textContent = agent.name;
  const roleEl = document.getElementById("panel-who-role");
  if (roleEl) roleEl.textContent = `${agent.role} · ${agent.division}`;
  const wsText = document.getElementById("panel-workspace-text");
  if (wsText) wsText.textContent = agent.workspaceDisplay;

  // 5. Update Rekan Switcher Bar
  renderColleaguesBar(agentId);

  // 6. Sinkronisasi dropdown workspace
  syncWorkspaceSelect(agent);

  // 7. Update input placeholder
  const inputEl = document.getElementById("panel-input");
  if (inputEl) {
    inputEl.placeholder = `Suruh ${agent.shortName} apa saja... (Enter untuk kirim)`;
    inputEl.value = "";
    inputEl.style.height = "auto";
  }

  // 8. Buka panel chat (Slide in dari kanan)
  document.body.classList.add("chatting");
  const panel = document.getElementById("chat-panel");
  if (panel) panel.setAttribute("aria-hidden", "false");
  sessionStorage.setItem("office_panel_open", "true");
  localStorage.setItem(STORAGE_KEY_ACTIVE_AGENT, agentId);

  // 9. Sinkronisasi selector agen di bottom HUD
  const bottomSelect = document.getElementById("target-agent-select");
  if (bottomSelect) bottomSelect.value = agentId;

  // 10. Render Pesan Percakapan Agen Ini
  renderPanelMessages(agentId);

  // 11. Otomatis fokus ke input textarea
  setTimeout(() => {
    if (inputEl) inputEl.focus();
  }, 280);
}

function closeChatPanel() {
  document.body.classList.remove("chatting");
  const panel = document.getElementById("chat-panel");
  if (panel) panel.setAttribute("aria-hidden", "true");
  sessionStorage.setItem("office_panel_open", "false");
  currentChatAgentId = null;
}

function resetAgentChat(agentId) {
  const target = agentId || currentChatAgentId;
  if (!target) return;
  agentHistories[target] = [];
  saveHistoriesToStorage();
  renderPanelMessages(target);
  const inputEl = document.getElementById("panel-input");
  if (inputEl) {
    inputEl.value = "";
    inputEl.focus();
  }
}

/* =========================================================================
   MULTIMODAL FILE UPLOADER & PREVIEW HELPER (Image & Video)
   ========================================================================= */
let pendingPanelMedia = null;
let pendingBottomMedia = null;

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

function setPendingMedia(target, file) {
  if (!file) return;

  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
  const mediaObj = {
    file: file,
    name: file.name,
    size: file.size,
    type: isVideo ? "video" : "image",
    previewUrl: URL.createObjectURL(file)
  };

  if (target === "panel") {
    if (pendingPanelMedia && pendingPanelMedia.previewUrl) {
      URL.revokeObjectURL(pendingPanelMedia.previewUrl);
    }
    pendingPanelMedia = mediaObj;
    renderPendingMediaUI("panel");
  } else {
    if (pendingBottomMedia && pendingBottomMedia.previewUrl) {
      URL.revokeObjectURL(pendingBottomMedia.previewUrl);
    }
    pendingBottomMedia = mediaObj;
    renderPendingMediaUI("bottom");
  }
}

function clearPendingMedia(target) {
  if (target === "panel") {
    if (pendingPanelMedia && pendingPanelMedia.previewUrl) {
      URL.revokeObjectURL(pendingPanelMedia.previewUrl);
    }
    pendingPanelMedia = null;
    const cont = document.getElementById("panel-media-preview");
    if (cont) {
      cont.innerHTML = "";
      cont.style.display = "none";
    }
    const input = document.getElementById("panel-file-input");
    if (input) input.value = "";
  } else {
    if (pendingBottomMedia && pendingBottomMedia.previewUrl) {
      URL.revokeObjectURL(pendingBottomMedia.previewUrl);
    }
    pendingBottomMedia = null;
    const cont = document.getElementById("bottom-media-preview");
    if (cont) {
      cont.innerHTML = "";
      cont.style.display = "none";
    }
    const input = document.getElementById("bottom-file-input");
    if (input) input.value = "";
  }
}

function renderPendingMediaUI(target) {
  const media = target === "panel" ? pendingPanelMedia : pendingBottomMedia;
  const containerId = target === "panel" ? "panel-media-preview" : "bottom-media-preview";
  const cont = document.getElementById(containerId);
  if (!cont) return;

  if (!media) {
    cont.innerHTML = "";
    cont.style.display = "none";
    return;
  }

  const thumbHtml = media.type === "image"
    ? `<img src="${media.previewUrl}" class="media-preview-thumb" alt="Preview" />`
    : `<span class="media-preview-video-icon">🎬</span>`;

  cont.innerHTML = `
    <div class="media-preview-thumb-wrap">
      ${thumbHtml}
    </div>
    <div class="media-preview-meta">
      <div class="media-preview-name" title="${esc(media.name)}">${esc(media.name)}</div>
      <div class="media-preview-sub">
        <span class="media-preview-badge-kind">${media.type}</span>
        <span>${formatFileSize(media.size)}</span>
        <span>• Siap dianalisis</span>
      </div>
    </div>
    <button type="button" class="media-preview-remove" title="Hapus lampiran" onclick="clearPendingMedia('${target}')">✕</button>
  `;
  cont.style.display = "flex";
}

async function uploadMediaFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload error: ${res.statusText || errText}`);
  }

  return await res.json();
}

async function submitPanelMessage(customText) {
  if (!currentChatAgentId) return;
  const inputEl = document.getElementById("panel-input");
  const wsSelect = document.getElementById("panel-project-select");
  const text = (customText !== undefined ? customText : (inputEl ? inputEl.value : "")).trim();

  if (!text && !pendingPanelMedia) return;

  const agentId = currentChatAgentId;
  const agent = AGENTS_ROSTER[agentId];
  const targetWorkspace = wsSelect ? wsSelect.value : (agent.projectPath || "auto");

  let mediaPayload = null;
  let mediaSaved = null;

  if (pendingPanelMedia) {
    const curMedia = pendingPanelMedia;
    showTypingIndicator(`Mengunggah file ${curMedia.name}...`);
    try {
      const uploadRes = await uploadMediaFile(curMedia.file);
      mediaPayload = {
        media_url: uploadRes.file_url,
        media_path: uploadRes.file_path,
        media_type: uploadRes.media_type,
        mime_type: uploadRes.mime_type,
        file_name: uploadRes.file_name,
      };
      mediaSaved = {
        url: uploadRes.file_url,
        type: uploadRes.media_type,
        name: uploadRes.file_name,
      };
    } catch (err) {
      removeTypingIndicator();
      alert("Gagal mengunggah file media: " + err.message);
      return;
    }
    clearPendingMedia("panel");
  }

  // Simpan riwayat user
  if (!agentHistories[agentId]) agentHistories[agentId] = [];
  agentHistories[agentId].push({
    role: "user",
    text: text,
    media: mediaSaved,
    time: new Date()
  });
  saveHistoriesToStorage();

  // Tampilkan bubble user di panel
  appendBubbleToPanel("user", text, [], "", true, new Date(), mediaSaved);

  // Tampilkan indikator mengetik / analisis multimodal
  const waitMsg = mediaSaved
    ? `Menganalisis ${mediaSaved.type === "video" ? "video" : "gambar"} dengan Gemini Multimodal...`
    : `Memproses instruksi Anda di ${wsSelect && wsSelect.selectedIndex >= 0 ? wsSelect.options[wsSelect.selectedIndex].text : targetWorkspace}...`;
  showTypingIndicator(waitMsg);

  // Reset textarea
  if (inputEl) {
    inputEl.value = "";
    inputEl.style.height = "auto";
  }

  // Berikan tugas aktif ke avatar & pastikan duduk di meja kerjanya
  const taskLabel = mediaSaved
    ? `Analisis ${mediaSaved.name}`
    : `Tugas: ${text.slice(0, 24)}...`;
  assignTaskToAvatar(agentId, taskLabel);

  // Kirimkan instruksi ke backend via Socket.IO
  const payloadData = Object.assign({
    user_id: "player_web",
    target_agent: agentId,
    message: text,
    room_location: activeRoom,
    project_workspace: targetWorkspace
  }, mediaPayload || {});

  socket.emit("user_message", payloadData);

  // Masukkan juga ke log aktivitas umum
  const logContent = mediaSaved ? `[Lampiran: ${mediaSaved.name}] ${text}` : text;
  appendMessageToLog("Anda", logContent, "user");
}

/* =========================================================================
   12. SOCKET.IO BRIDGE & EVENT HANDLERS
   ========================================================================= */
socket.on("connect", () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  if (statusDot) statusDot.classList.add("online");
  if (statusText) statusText.innerText = "Online";
});

socket.on("disconnect", () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  if (statusDot) statusDot.classList.remove("online");
  if (statusText) statusText.innerText = "Offline";
});

socket.on("hermes_tool_event", (data) => {
  const agentId = data.agent_id || "receptionist";
  const label = data.activity_label || `⚡ Hermes: ${data.tool_name}...`;
  const avatar = avatars[agentId];

  // 1. Update status 3D avatar & bubble di atas kepala (Antigravity Style)
  if (avatar) {
    assignTaskToAvatar(agentId, label);
    avatar.state = "talking";
    avatar.talkTimer = 7.0;

    let bubbleText = label;
    if (data.action_type === "read" && data.file_path) {
      bubbleText = `📖 Membaca ${data.file_path}${data.line_range ? " (" + data.line_range + ")" : ""}`;
    } else if (data.action_type === "edit" && data.file_path) {
      bubbleText = data.status === "completed"
        ? `✓ Selesai merubah kode ${data.file_path}!`
        : `✏️ Memodifikasi ${data.file_path}...`;
    }
    showSpeechBubble(agentId, bubbleText);
  }

  // 2. Simpan atau perbarui riwayat chat agen tersebut
  if (!agentHistories[agentId]) agentHistories[agentId] = [];
  const existingIdx = agentHistories[agentId].findIndex(
    item => item.role === "tool" && item.data && item.data.call_id === data.call_id
  );
  if (existingIdx >= 0) {
    agentHistories[agentId][existingIdx].data = Object.assign({}, agentHistories[agentId][existingIdx].data, data);
  } else {
    agentHistories[agentId].push({
      role: "tool",
      data: Object.assign({}, data),
      time: new Date()
    });
  }
  saveHistoriesToStorage();

  // 3. Render / Update live Antigravity Tool Call Card di Panel Chat jika panel agen ini sedang aktif
  if (currentChatAgentId === agentId) {
    appendToolCardToPanel(data, true);
    updateTypingIndicatorLabel(label);
  }

  appendMessageToLog(`⚡ Hermes Agent (${avatar ? avatar.name : agentId})`, `${label} <code>[${data.tool_name}]</code>`, "agent");
});

socket.on("agent_response", (data) => {
  const agentId = data.agent_id || "receptionist";
  const agentName = data.agent_name || "AI";
  const text = data.text || "";
  const toolsUsed = data.hermes_tools_used || [];
  const hermesModel = data.hermes_model || "gemini-3.5-flash-lite";
  const responseMedia = data.media_url ? { url: data.media_url, type: data.media_type } : null;

  const avatar = avatars[agentId];
  if (avatar) {
    avatar.state = "talking";
    avatar.talkTimer = 6.0;
    const statusLabel = toolsUsed.length > 0
      ? `✅ [${toolsUsed.join(", ")}] selesai`
      : "Menjawab pesan Anda...";
    showSpeechBubble(agentId, text);
    completeTaskForAvatar(agentId, statusLabel);
  }

  // Simpan respon ke riwayat agen tersebut (termasuk jika ada media yang dilampirkan)
  if (!agentHistories[agentId]) agentHistories[agentId] = [];
  agentHistories[agentId].push({
    role: "assistant",
    text: text,
    tools: toolsUsed,
    model: hermesModel,
    media: responseMedia,
    time: new Date()
  });
  saveHistoriesToStorage();

  // Jika panel chat sedang aktif untuk agen ini, hilangkan typing indicator & render bubble jawaban!
  if (currentChatAgentId === agentId) {
    removeTypingIndicator();
    appendBubbleToPanel("assistant", text, toolsUsed, hermesModel, true, new Date(), responseMedia);
  }

  const badgeHtml = toolsUsed.length > 0
    ? `<div style="margin-top:5px;font-size:10px;color:#059669;font-weight:700;">⚡ Vision/Tools: ${toolsUsed.join(", ")} • ${hermesModel}</div>`
    : `<div style="margin-top:4px;font-size:10px;color:#64748b;">🤖 Multimodal Agent • ${hermesModel}</div>`;
  appendMessageToLog(agentName, `${text}${badgeHtml}`, "agent");
});

async function sendMessage(customText) {
  const inputEl = document.getElementById("chat-input");
  const targetAgentEl = document.getElementById("target-agent-select");
  const projectWsEl = document.getElementById("project-workspace-select");
  const text = customText || (inputEl ? inputEl.value.trim() : "");

  if (!text && !pendingBottomMedia) return;

  const targetAgent = targetAgentEl ? targetAgentEl.value : "auto";
  const projectWorkspace = projectWsEl ? projectWsEl.value : "auto";

  let mediaPayload = null;
  let mediaSaved = null;

  if (pendingBottomMedia) {
    const curMedia = pendingBottomMedia;
    try {
      const uploadRes = await uploadMediaFile(curMedia.file);
      mediaPayload = {
        media_url: uploadRes.file_url,
        media_path: uploadRes.file_path,
        media_type: uploadRes.media_type,
        mime_type: uploadRes.mime_type,
        file_name: uploadRes.file_name,
      };
      mediaSaved = {
        url: uploadRes.file_url,
        type: uploadRes.media_type,
        name: uploadRes.file_name,
      };
    } catch (err) {
      alert("Gagal mengunggah file media: " + err.message);
      return;
    }
    clearPendingMedia("bottom");
  }

  let detectedAgent = targetAgent;
  if (detectedAgent === "auto") {
    const lower = (text + " " + (mediaSaved ? mediaSaved.name : "")).toLowerCase();
    if (lower.includes("faisal") || lower.includes("one-asco") || lower.includes("asco")) detectedAgent = "faisal";
    else if (lower.includes("syaugi") || lower.includes("tpf") || lower.includes("pos")) detectedAgent = "syaugi";
    else if (lower.includes("guntara") || lower.includes("pivore")) detectedAgent = "guntara";
    else if (lower.includes("alex") || lower.includes("api") || lower.includes("backend") || lower.includes("bug") || lower.includes("error")) detectedAgent = "developer";
    else if (lower.includes("budi") || lower.includes("sprint") || lower.includes("laporan") || lower.includes("timeline")) detectedAgent = "manager";
    else if (lower.includes("clara") || lower.includes("konten") || lower.includes("reels") || lower.includes("marketing") || lower.includes("video")) detectedAgent = "marketing";
    else if (lower.includes("sarah") || lower.includes("tamu") || lower.includes("lobby")) detectedAgent = "receptionist";
    else if (lower.includes("lisa") || lower.includes("finance") || lower.includes("keuangan") || lower.includes("bca") || lower.includes("bri") || lower.includes("mutasi") || lower.includes("struk") || lower.includes("transfer") || lower.includes("bukti")) detectedAgent = "lisa";
    else if (projectWorkspace.includes("one-asco")) detectedAgent = "faisal";
    else if (projectWorkspace.includes("tpf")) detectedAgent = "syaugi";
    else if (projectWorkspace.includes("pivore")) detectedAgent = "guntara";
  }

  const logText = mediaSaved ? `[Lampiran: ${mediaSaved.name}] ${text}` : text;
  appendMessageToLog("Anda", logText, "user");

  if (detectedAgent !== "auto" && avatars[detectedAgent]) {
    const taskDesc = mediaSaved ? `Analisis ${mediaSaved.name}` : `Tugas: ${text.slice(0, 24)}...`;
    assignTaskToAvatar(detectedAgent, taskDesc);
    if (!agentHistories[detectedAgent]) agentHistories[detectedAgent] = [];
    agentHistories[detectedAgent].push({
      role: "user",
      text: text,
      media: mediaSaved,
      time: new Date()
    });
    saveHistoriesToStorage();
  }

  // Jika target spesifik dari dropdown, buka juga chat panel agen itu agar obrolan terlihat menarik
  if (targetAgent !== "auto" && AGENTS_ROSTER[targetAgent]) {
    selectAndChatWithAgent(targetAgent);
    if (inputEl) inputEl.value = "";
    return;
  }

  const socketData = Object.assign({
    user_id: "player_web",
    target_agent: targetAgent,
    message: text,
    room_location: activeRoom,
    project_workspace: projectWorkspace
  }, mediaPayload || {});

  socket.emit("user_message", socketData);

  if (inputEl) inputEl.value = "";
}

function appendMessageToLog(sender, text, type) {
  const logBody = document.getElementById("log-body");
  if (!logBody) return;
  const msgEl = document.createElement("div");
  msgEl.className = `log-msg ${type}`;
  msgEl.innerHTML = `<div class="log-msg-sender">${sender}</div><div>${text}</div>`;
  logBody.appendChild(msgEl);
  logBody.scrollTop = logBody.scrollHeight;
  saveLogToStorage(sender, text, type);
}

document.addEventListener("DOMContentLoaded", () => {
  init3D();
  loadHistoriesFromStorage();
  loadLogsFromStorage();

  // Pulihkan chat panel jika sebelum refresh sedang aktif
  const lastActiveAgent = localStorage.getItem(STORAGE_KEY_ACTIVE_AGENT);
  const wasPanelOpen = sessionStorage.getItem("office_panel_open") === "true";
  if (wasPanelOpen && lastActiveAgent && AGENTS_ROSTER[lastActiveAgent]) {
    setTimeout(() => {
      selectAndChatWithAgent(lastActiveAgent);
    }, 380);
  }

  // Listener Pemilih Suasana Waktu & Langit (Pagi, Siang, Sore, Malam)
  const atmoSelect = document.getElementById("atmosphere-select");
  if (atmoSelect) {
    atmoSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      currentAtmosphereMode = val;
      if (val === "auto") {
        activeAtmosphereKey = getAtmosphereFromCurrentTime();
      } else {
        activeAtmosphereKey = val;
      }
      updateAtmosphereUI();
    });
  }

  // Muat daftar folder project ke selector
  fetch("/api/hermes/status")
    .then(r => r.json())
    .then(info => {
      const sel = document.getElementById("project-workspace-select");
      const panelWsSel = document.getElementById("panel-project-select");
      if (Array.isArray(info.available_projects)) {
        if (sel) {
          sel.innerHTML = "";
          info.available_projects.forEach(proj => {
            const opt = document.createElement("option");
            opt.value = proj.path;
            opt.textContent = proj.name;
            sel.appendChild(opt);
          });
        }
        if (panelWsSel) {
          panelWsSel.innerHTML = "";
          info.available_projects.forEach(proj => {
            const opt = document.createElement("option");
            opt.value = proj.path;
            opt.textContent = proj.name;
            panelWsSel.appendChild(opt);
          });
        }
      }
    })
    .catch(() => {});

  document.querySelectorAll(".cam-btn").forEach(btn => {
    btn.addEventListener("click", () => switchRoom(btn.dataset.room));
  });

  const roamBtn = document.getElementById("toggle-roam-btn");
  if (roamBtn) {
    roamBtn.addEventListener("click", () => {
      forceBreakMode = !forceBreakMode;
      if (forceBreakMode) {
        roamBtn.innerText = "💻 Panggil Semua Kerja di Meja";
        Object.values(avatars).forEach(av => {
          // Hanya agen yang TIDAK sedang mengerjakan tugas yang boleh jalan-jalan
          if (!av.activeTask && !av.isBusy) {
            startRoamingToRandomSpot(av);
          }
        });
        switchRoom("overview");
      } else {
        roamBtn.innerText = "🎱 Jam Istirahat (Jalan-Jalan)";
        Object.values(avatars).forEach(av => returnToWorkDesk(av));
      }
    });
  }

  // Tombol Toggle Log
  const toggleLogBtn = document.getElementById("btn-toggle-log");
  if (toggleLogBtn) {
    toggleLogBtn.addEventListener("click", () => {
      const logBody = document.getElementById("log-body");
      if (logBody) {
        const isHidden = logBody.style.display === "none";
        logBody.style.display = isHidden ? "flex" : "none";
        toggleLogBtn.textContent = isHidden ? "_" : "+";
      }
    });
  }

  // Panel Chat Events
  const closeBtn = document.getElementById("btn-panel-close");
  if (closeBtn) closeBtn.addEventListener("click", () => closeChatPanel());

  const resetBtn = document.getElementById("btn-panel-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => resetAgentChat());

  const panelForm = document.getElementById("panel-composer");
  if (panelForm) {
    panelForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitPanelMessage();
    });
  }

  const panelInput = document.getElementById("panel-input");
  if (panelInput) {
    panelInput.addEventListener("input", () => {
      panelInput.style.height = "auto";
      panelInput.style.height = `${Math.min(panelInput.scrollHeight, 120)}px`;
    });
    panelInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submitPanelMessage();
      }
    });
  }

  // Salin Kode ke Clipboard
  const panelMsgContainer = document.getElementById("panel-messages");
  if (panelMsgContainer) {
    panelMsgContainer.addEventListener("click", (e) => {
      const copyBtn = e.target.closest(".copy-btn");
      if (copyBtn) {
        const pre = copyBtn.closest("pre");
        const code = pre ? pre.querySelector("code") : null;
        if (code) {
          navigator.clipboard.writeText(code.innerText).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = "✓ Tersalin!";
            copyBtn.style.background = "#059669";
            setTimeout(() => {
              copyBtn.textContent = originalText;
              copyBtn.style.background = "";
            }, 1500);
          }).catch(() => {
            copyBtn.textContent = "Gagal";
            setTimeout(() => { copyBtn.textContent = "Salin"; }, 1500);
          });
        }
      }
    });
  }

  // Keyboard shortcut: Esc untuk menutup panel
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("chatting")) {
      closeChatPanel();
    }
  });

  // =========================================================================
  // MULTIMODAL MEDIA ATTACHMENT, DRAG & DROP, AND CLIPBOARD PASTE
  // =========================================================================
  // 1. Panel File Attachment Button
  const btnPanelAttach = document.getElementById("btn-panel-attach");
  const panelFileInput = document.getElementById("panel-file-input");
  if (btnPanelAttach && panelFileInput) {
    btnPanelAttach.addEventListener("click", () => panelFileInput.click());
    panelFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        setPendingMedia("panel", e.target.files[0]);
      }
    });
  }

  // 2. Bottom HUD Attachment Button
  const btnBottomAttach = document.getElementById("btn-bottom-attach");
  const bottomFileInput = document.getElementById("bottom-file-input");
  if (btnBottomAttach && bottomFileInput) {
    btnBottomAttach.addEventListener("click", () => bottomFileInput.click());
    bottomFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        setPendingMedia("bottom", e.target.files[0]);
      }
    });
  }

  // 3. Drag & Drop onto Panel Composer
  const composerEl = document.getElementById("panel-composer");
  if (composerEl) {
    ["dragenter", "dragover"].forEach(evt => {
      composerEl.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        composerEl.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(evt => {
      composerEl.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        composerEl.classList.remove("drag-over");
      });
    });
    composerEl.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        setPendingMedia("panel", e.dataTransfer.files[0]);
      }
    });
  }

  // 4. Drag & Drop onto Bottom Chat Container
  const bottomChatEl = document.querySelector(".chat-container");
  if (bottomChatEl) {
    ["dragenter", "dragover"].forEach(evt => {
      bottomChatEl.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        bottomChatEl.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(evt => {
      bottomChatEl.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        bottomChatEl.classList.remove("drag-over");
      });
    });
    bottomChatEl.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        setPendingMedia("bottom", e.dataTransfer.files[0]);
      }
    });
  }

  // 5. Clipboard Screenshot Paste (Cmd+V / Ctrl+V langsung menempelkan gambar)
  if (panelInput) {
    panelInput.addEventListener("paste", (e) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          setPendingMedia("panel", file);
        }
      }
    });
  }

  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.addEventListener("paste", (e) => {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          setPendingMedia("bottom", file);
        }
      }
    });
  }

  // Bottom HUD Events
  const sendBtn = document.getElementById("send-btn");
  if (sendBtn) sendBtn.addEventListener("click", () => sendMessage());

  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  document.querySelectorAll(".prompt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const text = chip.dataset.prompt;
      const target = chip.dataset.target;
      if (target && AGENTS_ROSTER[target]) {
        selectAndChatWithAgent(target);
        submitPanelMessage(text);
      } else {
        sendMessage(text);
      }
    });
  });

  // =========================================================================
  // INTERAKSI RAYCASTER: HOVER MOUSE POINTER & KLIK KARAKTER 3D
  // =========================================================================
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPos = { x: 0, y: 0 };
  let hoveredPickable = null;

  renderer.domElement.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(characterPickables, false);

    if (hits.length > 0) {
      renderer.domElement.style.cursor = "pointer";
      const hitObj = hits[0].object;
      if (hoveredPickable !== hitObj) {
        hoveredPickable = hitObj;
      }
    } else {
      renderer.domElement.style.cursor = "default";
      hoveredPickable = null;
    }
  });

  renderer.domElement.addEventListener("pointerdown", (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(characterPickables, false);
    if (hits.length > 0) {
      const clickedAgentId = hits[0].object.userData.agentId;
      if (clickedAgentId) {
        selectAndChatWithAgent(clickedAgentId);
      }
    }
  });

  // Status Auto-Report Jam 10 Malam (Dikonfigurasi langsung di .env)
  const autoReportPill = document.getElementById("auto-report-badge");
  if (autoReportPill) {
    fetch("/api/schedule/status")
      .then(r => r.json())
      .then(info => {
        if (info && info.schedule_time) {
          autoReportPill.innerText = `⏰ Auto-Report: ${info.schedule_time} WIB`;
          autoReportPill.title = `Laporan harian otomatis berjalan setiap hari pkl ${info.schedule_time} WIB menuju ${info.target_phone || 'WhatsApp'}`;
        }
      })
      .catch(() => {});
  }

  // Inisialisasi Real-Time Email Watcher Status
  fetchEmailWatcherStatus();
  setInterval(() => {
    fetchEmailWatcherStatus();
  }, 25000);
});

/* =========================================================================
   13. REAL-TIME EMAIL WATCHER & BANK RECONCILIATION CONTROLLER
   ========================================================================= */

function playNotificationChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  } catch (e) {
    // Autoplay policy blocker fallback
  }
}

socket.on("finance_transaction_received", (data) => {
  console.log("💰 [Real-Time Email] Mutasi Baru Masuk:", data);
  playNotificationChime();

  if (data && data.summary) {
    updateLisaDeskMonitors(data.summary, data.transaction);
  }

  // Arahkan Lisa ke meja kerja dan aktifkan gestur
  if (avatars["lisa"]) {
    assignTaskToAvatar("lisa", "Memproses mutasi email baru");
  }

  // Update badge UI
  updateEmailWatcherBadge(true);
});

function openEmailModal() {
  const modal = document.getElementById("email-modal");
  if (modal) {
    modal.style.display = "flex";
    fetchEmailWatcherStatus();
  }
}

function closeEmailModal() {
  const modal = document.getElementById("email-modal");
  if (modal) modal.style.display = "none";
}

function updateEmailWatcherBadge(connected, hasPwd = true) {
  const dot = document.getElementById("email-watcher-dot");
  const label = document.getElementById("email-watcher-label");
  if (!dot || !label) return;

  dot.className = "watcher-dot";
  if (connected) {
    dot.classList.add("connected");
    label.innerText = "🟢 Gmail: Live Sync";
  } else if (hasPwd) {
    dot.classList.add("waiting");
    label.innerText = "🟡 Gmail: Menghubungkan...";
  } else {
    dot.classList.add("waiting");
    label.innerText = "🟡 Gmail: Perlu Sandi";
  }
}

function fetchEmailWatcherStatus() {
  fetch("/api/finance/watcher-status")
    .then(r => r.json())
    .then(data => {
      const isLive = Boolean(data.connected_live);
      const hasPwd = Boolean(data.has_app_password);

      updateEmailWatcherBadge(isLive, hasPwd);

      const indicator = document.getElementById("modal-indicator");
      const title = document.getElementById("modal-status-title");
      const desc = document.getElementById("modal-status-desc");

      if (indicator && title && desc) {
        if (isLive) {
          indicator.innerText = "🟢";
          title.innerText = "Status: Terhubung Live ke Gmail IMAP";
          desc.innerText = `Pemantauan real-time aktif untuk ${data.monitored_email}. Transaksi BCA & BRI terdeteksi otomatis setiap ${data.poll_interval_seconds} detik.`;
        } else if (hasPwd) {
          indicator.innerText = "🟡";
          title.innerText = "Status: Menghubungkan ke Server Gmail...";
          desc.innerText = data.last_status || "Sedang memverifikasi Sandi Aplikasi Google...";
        } else {
          indicator.innerText = "🟡";
          title.innerText = "Status: Menunggu Sandi Aplikasi Gmail";
          desc.innerText = "Masukkan 16 karakter Sandi Aplikasi Google akun sonijulianto@gmail.com di bawah untuk memulai pemantauan real-time.";
        }
      }
    })
    .catch(() => {});
}

function saveEmailCredentialsUI() {
  const pwdInput = document.getElementById("input-app-password");
  const pwd = pwdInput ? pwdInput.value.trim() : "";
  if (!pwd) {
    alert("Silakan masukkan 16 karakter Sandi Aplikasi Google!");
    return;
  }

  fetch("/api/finance/email-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "sonijulianto@gmail.com",
      app_password: pwd
    })
  })
    .then(r => r.json())
    .then(res => {
      alert("✅ Sandi Aplikasi berhasil disimpan! Menghubungkan ke Gmail...");
      if (pwdInput) pwdInput.value = "";
      fetchEmailWatcherStatus();
    })
    .catch(err => {
      alert("Gagal menyimpan: " + err);
    });
}

function checkInboxNowUI() {
  const title = document.getElementById("modal-status-title");
  if (title) title.innerText = "Sedang memeriksa inbox Gmail...";

  fetch("/api/finance/check-now", { method: "POST" })
    .then(r => r.json())
    .then(res => {
      alert(`✅ Pengecekan selesai! Ditemukan ${res.new_transactions_count || 0} transaksi baru.`);
      fetchEmailWatcherStatus();
    })
    .catch(err => {
      alert("Error cek inbox: " + err);
    });
}

function simulateIncomingEmailUI() {
  fetch("/api/finance/simulate-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  })
    .then(r => r.json())
    .then(res => {
      playNotificationChime();
      alert(`🎉 [SIMULASI REAL-TIME BERHASIL]\n\n${res.message}\n\nPeriksa pergerakan monitor 3D dan speech bubble Lisa di kantor virtual!`);
      closeEmailModal();
    })
    .catch(err => {
      alert("Gagal simulasi: " + err);
    });
}

function triggerFinanceReportNowUI() {
  fetch("/api/finance/trigger-report", { method: "POST" })
    .then(r => r.json())
    .then(res => {
      const waMsg = res.wa_sent ? "Pesan WhatsApp berhasil dikirim ke nomor 089516789565!" : "Laporan telah siap dikirim ke WhatsApp!";
      alert(`📲 [LAPORAN KEUANGAN LISA]\n\n${waMsg}\n\nNet Cashflow: Rp ${res.summary.net_cashflow.toLocaleString('id-ID')}`);
    })
    .catch(err => {
      alert("Gagal kirim rekap: " + err);
    });
}

function resetFinanceTransactionsUI() {
  if (!confirm("Apakah Anda yakin ingin membersihkan semua mutasi dan memulai hanya dari transaksi real (Rp 0)?")) {
    return;
  }
  fetch("/api/finance/reset-transactions", { method: "POST" })
    .then(r => r.json())
    .then(res => {
      if (res && res.summary) {
        updateLisaDeskMonitors(res.summary, null);
      }
      alert("🧹 Semua data mutasi berhasil dibersihkan! Buku kas kini bersih (Rp 0) dan siap mencatat transaksi real.");
      closeEmailModal();
    })
    .catch(err => {
      alert("Gagal reset: " + err);
    });
}
