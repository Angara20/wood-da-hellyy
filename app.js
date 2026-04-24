const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

let width, height;
let groundLevel;

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    // Positioned at 1/4 height of screen from the bottom
    groundLevel = height * 0.75;
}

window.addEventListener('resize', resize);
resize();

// --- STATE ---
let timeOffset = 0;
let totalTime = 0; // track absolute running time in seconds
let currentGroundSpeed = 15; // Dynamic ground speed moving left
let targetGroundSpeed = 15;
let globalWind = 0; // S2 wind system
let slowdownTimer = 0;
let speedState = 'normal';
const plants = [];
let activePlant = null;

// --- UI STATE ---
let uiTimer = 0;
let uiState = 'TITLE'; // TITLE, INSTRUCTIONS, GAMEPLAY

let lastTime = performance.now();

// --- WEATHER SYSTEMS ---
let isRaining = false;
let rainTimer = 15 + Math.random() * 10;
const droplets = [];

// --- BIOME SYSTEMS ---
const biomeSegments = [];
let nextBiomeX = 0;
let nextBiomeType = 'forest';

function ensureBiomeSegments(worldX) {
    while (biomeSegments.length === 0 || biomeSegments[biomeSegments.length - 1].x < worldX + 3000) {
        biomeSegments.push({ x: nextBiomeX, type: nextBiomeType });
        // Map biome segments based on dynamic speed
        nextBiomeX += currentGroundSpeed * (8 + Math.random() * 4);
        nextBiomeType = nextBiomeType === 'forest' ? 'dry' : 'forest';
    }
    while (biomeSegments.length > 2 && biomeSegments[1].x < worldX - 2000) {
        biomeSegments.shift();
    }
}

function getBiomeFactorAt(worldX) {
    if (biomeSegments.length === 0) return 0;

    let idx = -1;
    for (let i = 0; i < biomeSegments.length - 1; i++) {
        if (worldX >= biomeSegments[i].x && worldX < biomeSegments[i + 1].x) {
            idx = i; break;
        }
    }
    if (idx === -1) idx = Math.max(0, biomeSegments.length - 2);

    let current = biomeSegments[idx];
    let next = biomeSegments[idx + 1];
    if (!next) return current.type === 'forest' ? 0 : 1;

    let transitionWidth = 300;
    let vCurrent = current.type === 'forest' ? 0 : 1;
    let vNext = next.type === 'forest' ? 0 : 1;

    if (worldX > next.x - transitionWidth) {
        let t = (worldX - (next.x - transitionWidth)) / transitionWidth;
        t = Math.max(0, Math.min(1, t));
        t = t * t * (3 - 2 * t);
        return vCurrent + t * (vNext - vCurrent);
    }
    return vCurrent;
}

const textures = [];
let lastTextureX = 0;

function ensureTextures(worldX) {
    while (lastTextureX < worldX + 2000) {
        lastTextureX += 15 + Math.random() * 15;
        for (let i = 0; i < 3; i++) {
            textures.push({
                x: lastTextureX + (Math.random() - 0.5) * 10,
                relativeY: 5 + Math.random() * 150,
                size: Math.random() * 3 + 1,
                seed: Math.random()
            });
        }
    }
    while (textures.length > 0 && textures[0].x < worldX - 500) {
        textures.shift();
    }
}

// --- UTILS ---
function lerpColor(c1, c2, t) {
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

const forestGroundColor = [126, 159, 104];
const dryGroundColor = [216, 195, 142];
const forestSkyColor = [232, 245, 233];
const drySkyColor = [255, 243, 224];

function getBaseTerrainY(worldX) {
    return groundLevel +
        Math.sin(worldX * 0.015) * 15 +
        Math.sin(worldX * 0.005) * 25 +
        Math.sin(worldX * 0.03) * 5;
}

function getWaterDepthFactor(worldX) {
    let val = Math.sin(worldX * 0.002) * 0.6 + Math.sin(worldX * 0.0031 + 2) * 0.4;
    // Threshold to create isolated lakes/ponds instead of deep valleys everywhere
    if (val < 0.65) return 0;
    let depth = (val - 0.65) / 0.35;
    return depth * depth * (3 - 2 * depth);
}

function getGroundY(screenX) {
    const worldX = screenX + timeOffset;
    // Bumpy horizontal ground line with occasional water dips
    return getBaseTerrainY(worldX) + getWaterDepthFactor(worldX) * 70;
}

// --- CLASSES ---
const plantStyles = ['tall_sparse', 'dense_bushy', 'balanced'];
const trunkColors = ['#5D4037', '#6D4C41', '#4E342E', '#795548', '#556B2F', '#4E5340'];

class Butterfly {
    constructor(worldX, worldY, color) {
        this.worldX = worldX;
        this.worldY = worldY;
        this.color = color;
        this.time = Math.random() * 100;
        this.offsetSpeed = 0.5 + Math.random();
        this.radius = 15 + Math.random() * 20;
        this.wingPhase = 0;
        this.angle = Math.random() * Math.PI * 2;
    }

    update(dt) {
        this.worldX -= currentGroundSpeed * dt;
        this.time += dt * this.offsetSpeed;
        this.wingPhase += dt * 15;

        // Loop flight logic
        const targetOffsetX = Math.sin(this.time) * this.radius;
        const targetOffsetY = Math.cos(this.time * 0.8) * (this.radius * 0.7);

        // Apply Wind Drifts (S2) - they resist slightly
        this.worldX += globalWind * 10 * dt;

        this.x = this.worldX + targetOffsetX;
        this.y = this.worldY + targetOffsetY;
    }

    draw(ctx) {
        const wingScale = Math.sin(this.wingPhase) * 0.5 + 0.5;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;

        // Simple 2-wing wing forms
        for (let side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(side * 3 * wingScale, -1, 4 * wingScale, 2, side * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(side * 2 * wingScale, 1.5, 2 * wingScale, 1.5, side * -0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class FallingFlower {
    constructor(worldX, worldY, color) {
        this.worldX = worldX;
        this.worldY = worldY;
        this.color = color;
        this.phase = Math.random() * Math.PI * 2;
        this.fallSpeed = 20 + Math.random() * 15;
        this.dead = false;
    }

    update(dt) {
        this.worldX -= currentGroundSpeed * dt;
        this.worldY += this.fallSpeed * dt;
        this.phase += dt * 2.5;

        // Sinusoidal Drift + Wind Factor (S2)
        const drift = Math.sin(this.phase) * 15;
        this.worldX += (drift + globalWind * 30) * dt;

        // Reached Ground
        if (this.worldY > getGroundY(this.worldX)) {
            this.dead = true;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.worldX, this.worldY);
        ctx.rotate(this.phase * 0.5);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Foliage {
    constructor(plant, worldX, worldY, angle, level, forcedType = null) {
        this.plant = plant;
        this.worldX = worldX;
        this.worldY = worldY;
        this.angle = angle;
        this.level = level;
        this.scale = 0;
        this.rotation = (Math.random() - 0.5) * 0.4;

        this.type = forcedType;
        if (!this.type) {
            let rand = Math.random();
            if (rand < 0.8) this.type = 'leaf';
            else if (this.plant.hasFlowers && rand < 0.92) this.type = 'flower';
            else if (this.plant.hasFruit) this.type = 'fruit';
            else this.type = 'leaf';
        }

        if (this.type === 'leaf') {
            this.leafType = this.plant.leafPhenotypes[Math.floor(Math.random() * this.plant.leafPhenotypes.length)];
            this.maxScale = (0.5 + Math.random() * 0.5) * (this.leafType === 'elongated' ? 1.5 : 1.0);
            const jitter = (Math.random() - 0.5) * 40;
            this.color = `rgb(${this.plant.baseLeafColor[0] + jitter}, ${this.plant.baseLeafColor[1] + jitter}, ${this.plant.baseLeafColor[2] + jitter})`;
        } else if (this.type === 'flower') {
            this.maxScale = 0.4 + Math.random() * 0.4;
            this.color = this.plant.flowerColor;
            this.petals = 3 + Math.floor(Math.random() * 3);
        } else if (this.type === 'fruit') {
            this.maxScale = 0.5 + Math.random() * 0.4;
            this.color = this.plant.fruitColors[Math.floor(Math.random() * this.plant.fruitColors.length)];
            this.groupSize = Math.random() > 0.6 ? 2 : 1;
        }
    }

    update(dt) {
        this.worldX -= currentGroundSpeed * dt;
        if (this.scale < this.maxScale) {
            this.scale += dt * 0.8;
        }

        // Probability to spawn secondary leaf (layered foliage recursion)
        if (this.plant.isActive && this.level < 2 && this.type === 'leaf' && Math.random() < 0.5 * dt) {
            // Cap total layered geometry to maintain smooth performance
            if (this.plant.foliageGroup.length < 400) {
                const newAngle = this.angle + (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.8);
                const dist = 12 * this.scale * (this.plant.thickness / 6);
                const nx = this.worldX + Math.cos(newAngle) * dist;
                const ny = this.worldY + Math.sin(newAngle) * dist;
                this.plant.foliageGroup.push(new Foliage(this.plant, nx, ny, newAngle, this.level + 1));
            }
        }
    }

    draw(ctx) {
        if (this.scale <= 0) return;
        const scaleThick = this.plant.thickness / 6;

        ctx.save();
        ctx.translate(this.worldX, this.worldY);
        ctx.rotate(this.angle + this.rotation);
        ctx.scale(this.scale * scaleThick, this.scale * scaleThick);

        if (this.type === 'leaf') {
            ctx.fillStyle = this.color;
            if (this.leafType === 'pointed') {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(15, -10, 30, 0);
                ctx.quadraticCurveTo(15, 10, 0, 0);
                ctx.fill();
            } else if (this.leafType === 'oval') {
                ctx.beginPath();
                ctx.ellipse(15, 0, 15, 8, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.leafType === 'elongated') {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(20, -4, 45, 0);
                ctx.quadraticCurveTo(20, 4, 0, 0);
                ctx.fill();
            } else { // rounded_cluster
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(8 + i * 6, (i % 2 === 0 ? 4 : -4), 6, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else if (this.type === 'fruit') {
            ctx.fillStyle = this.color;
            for (let i = 0; i < this.groupSize; i++) {
                ctx.beginPath();
                ctx.arc(i * 8, i * 4, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.type === 'flower') {
            ctx.fillStyle = this.color;
            // Draw petals
            for (let i = 0; i < this.petals; i++) {
                ctx.save();
                ctx.rotate((i / this.petals) * Math.PI * 2);
                ctx.beginPath();
                ctx.arc(6, 0, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            // Center
            ctx.fillStyle = '#FFF176';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class Branch {
    constructor(plant, parentNode, startAngle, thicknessMultiplier, depth) {
        this.plant = plant;
        this.depth = depth;
        this.isActive = true;
        this.thickness = this.plant.thickness * thicknessMultiplier;

        let startX = parentNode ? parentNode.x : plant.rootX;
        let startY = parentNode ? parentNode.y : plant.rootY;

        this.points = [{ x: startX, y: startY }];
        this.tipX = startX;
        this.tipY = startY;
        this.currentAngle = startAngle;
        this.angleVelocity = 0;
        this.distanceSinceLastNode = 0;

        // Setup initial stub to avoid pop-in
        for (let i = 0; i < (depth === 0 ? 3 : 1); i++) {
            const len = depth === 0 ? 12 : 6;
            this.tipX += Math.cos(this.currentAngle) * len;
            this.tipY += Math.sin(this.currentAngle) * len;

            this.points.push({ x: this.tipX, y: this.tipY });
            if (depth === 0) this.currentAngle += (Math.random() - 0.5) * 0.2;
        }
    }

    update(dt) {
        for (const p of this.points) p.x -= currentGroundSpeed * dt;
        this.tipX -= currentGroundSpeed * dt;

        if (this.isActive && this.plant.isActive) {
            let speed = this.plant.currentSpeed;
            if (this.depth > 0) speed *= (1.0 - this.depth * 0.25); // slow slightly based on depth

            const growDist = speed * dt;

            const randomNoise = this.plant.inWater ? 1.5 : 4;
            const anglePull = this.plant.inWater ? 1.5 : 2;

            this.angleVelocity += (Math.random() - 0.5) * dt * randomNoise;

            // Global Bias: 80% lean right globally
            let targetAngle = -Math.PI / 2 + (this.plant.biasRight ? 0.3 : -0.2);

            if (this.depth > 0) {
                targetAngle = this.points[0].currentAngle || targetAngle;
            }

            // Roof Deflection Physics
            if (this.tipY < 20) {
                if (!this.roofRedirected) {
                    this.roofRedirected = true;
                    this.targetRoofAngle = Math.random() < 0.8 ? 0.1 : 3.0; // 0.1 = right+down, 3.0 = left+down
                    if (typeof playRoofKnock === 'function') playRoofKnock(); // Physical knocking bounds
                }
                targetAngle = this.targetRoofAngle;
                this.angleVelocity -= (this.currentAngle - targetAngle) * dt * 10.0; // Rapidly force curve tracking along roof
            } else {
                this.angleVelocity -= (this.currentAngle - targetAngle) * dt * anglePull;
            }

            this.currentAngle += this.angleVelocity * dt;

            // Limit bounds UNLESS we are sliding on the soft roof barrier
            if (!this.roofRedirected) {
                let maxDev = this.depth === 0 ? 0.9 : 1.2;
                let angleDiff = this.currentAngle - -Math.PI / 2;
                angleDiff = Math.max(-maxDev, Math.min(maxDev, angleDiff));
                this.currentAngle = -Math.PI / 2 + angleDiff;
            }

            this.tipX += Math.cos(this.currentAngle) * growDist;
            this.tipY += Math.sin(this.currentAngle) * growDist;

            this.distanceSinceLastNode += growDist;

            // Generate structural nodes
            if (this.distanceSinceLastNode >= 15) {
                this.distanceSinceLastNode -= 15;
                const newNode = { x: this.tipX, y: this.tipY };
                newNode.currentAngle = this.currentAngle;
                this.points.push(newNode);

                // Branches logic (Allow up to depth 3)
                if (this.depth < 3 && Math.random() < this.plant.branchProb) {
                    if (this.plant.activeBranches < this.plant.maxBranches) {
                        const branchAngleOffset = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.7);
                        // Natural tapering -> multiply multiplier downward recursively!
                        const child = new Branch(this.plant, newNode, this.currentAngle + branchAngleOffset, this.thickness / this.plant.thickness * 0.65, this.depth + 1);
                        this.plant.branches.push(child);
                        this.plant.activeBranches++;
                    }
                }
            }

            // Randomly spawn base foliage directly from the stems constantly over time! (Density fill)
            if (this.plant.hasLeaves && this.points.length > 2) {
                let densityTick = 5.0;
                if (isRaining && this.plant.growthProfile !== 'slow') densityTick = 18.0;

                if (Math.random() < densityTick * dt) {
                    if (this.plant.foliageGroup.length < 500) {
                        const randIndex = 1 + Math.floor(Math.random() * (this.points.length - 2));
                        const p = this.points[randIndex];
                        const prev = this.points[randIndex - 1];
                        const angle = Math.atan2(p.y - prev.y, p.x - prev.x);

                        // Roll for flora type to allow clustering
                        let roll = Math.random();
                        let type = 'leaf';
                        if (this.plant.hasFlowers && roll > 0.85) type = 'flower';
                        else if (this.plant.hasFruit && roll > 0.80) type = 'fruit';

                        const count = (type === 'leaf') ? 1 : (2 + Math.floor(Math.random() * 2));
                        for (let i = 0; i < count; i++) {
                            const leafAngle = angle + (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 1.0);
                            const jitterX = (Math.random() - 0.5) * 10;
                            const jitterY = (Math.random() - 0.5) * 10;
                            this.plant.foliageGroup.push(new Foliage(this.plant, p.x + jitterX, p.y + jitterY, leafAngle, 0, type));
                        }
                    }
                }
            }

            // Infinite Bounds! Roof logic deflects rather than halting tracking unconditionally!
        }
    }

    draw(ctx) {
        if (this.points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
        ctx.lineTo(this.tipX, this.tipY);

        ctx.strokeStyle = '#1F2937';
        ctx.lineWidth = this.thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.strokeStyle = this.plant.trunkColor;
        ctx.lineWidth = this.thickness * 0.7;
        ctx.stroke();
    }
}

class Plant {
    constructor(screenX) {
        this.isActive = true;
        this.holdTime = 0;

        const worldX = screenX + timeOffset;
        this.inWater = getWaterDepthFactor(worldX) > 0.05;

        // Plant DNA / Phenotypes
        const profiles = ['slow', 'medium', 'fast'];
        this.growthProfile = profiles[Math.floor(Math.random() * profiles.length)];

        const leafTypes = ['pointed', 'oval', 'rounded_cluster', 'elongated'];
        this.leafPhenotypes = [];
        this.leafPhenotypes.push(leafTypes[Math.floor(Math.random() * leafTypes.length)]);
        if (Math.random() > 0.7) this.leafPhenotypes.push(leafTypes[Math.floor(Math.random() * leafTypes.length)]);

        this.baseLeafColor = [
            40 + Math.random() * 40,
            100 + Math.random() * 60,
            40 + Math.random() * 40
        ];

        this.hasFlowers = Math.random() < 0.35;
        const fColors = ['#F48FB1', '#CE93D8', '#B39DDB', '#90CAF9', '#FFF59D']; // pink, purple, blue, light blue, yellow
        this.flowerColor = fColors[Math.floor(Math.random() * fColors.length)];

        this.hasFruit = Math.random() < 0.25;
        this.fruitColors = ['#FF7043', '#FFB74D', '#AED581']; // orange, yellow, green-fruit

        // 80% Bias mathematically leaning branches Rightward globally!
        this.biasRight = Math.random() < 0.8;

        if (this.growthProfile === 'slow') {
            this.baseGrowSpeed = this.inWater ? 40 : 25;
        } else if (this.growthProfile === 'medium') {
            this.baseGrowSpeed = this.inWater ? 70 : 55;
        } else { // fast
            this.baseGrowSpeed = this.inWater ? 110 : 85;
        }

        this.rootX = screenX;
        this.rootY = getGroundY(screenX) + 5;

        this.style = plantStyles[Math.floor(Math.random() * plantStyles.length)];
        this.trunkColor = trunkColors[Math.floor(Math.random() * trunkColors.length)];

        const maxT = width * 0.1; // Maximum 10% Screen Width!
        if (this.style === 'tall_sparse') {
            this.thickness = 6 + Math.random() * 4; // Thin (6-10px)
            this.maxBranches = 6 + Math.floor(Math.random() * 2);
            this.branchProb = 0.05;
            this.hasLeaves = Math.random() > 0.1; // Most have leaves
        } else if (this.style === 'dense_bushy') {
            this.thickness = maxT * 0.3 + Math.random() * (maxT * 0.7);
            this.maxBranches = 4;
            this.branchProb = 0.1;
            this.hasLeaves = true;
        } else { // balanced
            this.thickness = 15 + Math.random() * (maxT * 0.2);
            this.maxBranches = 5;
            this.branchProb = 0.15;
            this.hasLeaves = true;
        }

        // Natively cut speed inversely scaling alongside thick structures!
        this.baseGrowSpeed /= Math.max(1, this.thickness / 10.0);
        this.currentSpeed = this.baseGrowSpeed;

        // Alter branch prob logically via speed profile too
        if (this.growthProfile === 'slow') this.branchProb *= 0.5;
        if (this.growthProfile === 'fast') this.branchProb *= 1.5;

        this.branches = [];
        this.activeBranches = 1;
        this.foliageGroup = [];
        this.butterflies = [];
        this.fallingParticles = [];
        this.heightThresholdReached = false;

        const initialAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.2;
        this.branches.push(new Branch(this, null, initialAngle, 1.0, 0));
    }

    update(dt) {
        if (this.isActive) {
            this.holdTime += dt;
            const speedRamp = this.inWater ? 50 : 30; // hold scaling bonus
            this.currentSpeed = this.baseGrowSpeed + Math.min(this.holdTime, 3) * speedRamp;

            // Selective Precipitation Triggers
            if (isRaining) {
                if (this.growthProfile === 'fast') this.currentSpeed *= 1.8;
                else if (this.growthProfile === 'medium') this.currentSpeed *= 1.4;
                // slow plants natively ignore rain bonus entirely!
            }

            let anyActive = false;
            for (const b of this.branches) {
                if (b.isActive) anyActive = true;
            }
            if (!anyActive) this.isActive = false;
        } else {
            this.holdTime = 0;
        }

        this.rootX -= currentGroundSpeed * dt;

        // Detect Height Threshold (50% screen) for flower-based effects
        if (!this.heightThresholdReached && this.hasFlowers) {
            let minY = height;
            for (const b of this.branches) if (b.tipY < minY) minY = b.tipY;
            if (minY < height * 0.5) this.heightThresholdReached = true;
        }

        for (const b of this.branches) b.update(dt);
        for (const f of this.foliageGroup) f.update(dt);

        // Update Butterflies
        if (this.heightThresholdReached && this.hasFlowers) {
            // Spawning Butterflies (max per plant)
            if (this.butterflies.length < 5 && Math.random() < (isRaining ? 0.2 : 0.8) * dt) {
                const flowerNodes = this.foliageGroup.filter(f => f.type === 'flower' && f.scale > 0.5);
                if (flowerNodes.length > 0) {
                    const node = flowerNodes[Math.floor(Math.random() * flowerNodes.length)];
                    this.butterflies.push(new Butterfly(node.worldX, node.worldY, this.flowerColor));
                }
            }
            for (let i = this.butterflies.length - 1; i >= 0; i--) {
                this.butterflies[i].update(dt);
                // Clean up off-screen
                if (this.butterflies[i].worldX < -100 || this.butterflies[i].worldX > width + 100) {
                    this.butterflies.splice(i, 1);
                }
            }

            // Spawning Falling Flowers
            if (Math.random() < (isRaining ? 0.1 : 0.4) * dt) {
                const flowerNodes = this.foliageGroup.filter(f => f.type === 'flower' && f.scale > 0.5);
                if (flowerNodes.length > 0) {
                    const node = flowerNodes[Math.floor(Math.random() * flowerNodes.length)];
                    this.fallingParticles.push(new FallingFlower(node.worldX, node.worldY, this.flowerColor));
                }
            }
        }

        for (let i = this.fallingParticles.length - 1; i >= 0; i--) {
            this.fallingParticles[i].update(dt);
            if (this.fallingParticles[i].dead) this.fallingParticles.splice(i, 1);
        }
    }

    draw(ctx) {
        for (const b of this.branches) b.draw(ctx);
        for (const f of this.foliageGroup) f.draw(ctx);

        // Draw local butterflies and pedals
        for (const b of this.butterflies) b.draw(ctx);
        for (const p of this.fallingParticles) p.draw(ctx);
    }
}

// --- INPUT HANDLING ---
function startInteraction(x) {
    if (uiState === 'TITLE') return; // Silence interactions during intro title
    if (typeof initAudio === 'function') initAudio(); // Safely unlocks web audio contexts matching browser protocols

    if (activePlant) {
        activePlant.isActive = false;
    }

    let closestPlant = null;
    let minDiff = 40;
    for (const plant of plants) {
        if (plant.branches.length === 0) continue;
        const rx = plant.branches[0].points[0].x;
        if (Math.abs(rx - x) < minDiff) {
            minDiff = Math.abs(rx - x);
            closestPlant = plant;
        }
    }

    if (closestPlant) {
        activePlant = closestPlant;
        activePlant.isActive = true;
        for (const b of activePlant.branches) {
            if (b.tipY > 20) b.isActive = true;
        }
        activePlant.maxBranches += 2; // Allow continuously expanding
    } else {
        activePlant = new Plant(x);
        plants.push(activePlant);
    }
}

function stopInteraction() {
    if (activePlant) {
        activePlant.isActive = false;
        activePlant = null;
    }
}

// Mouse
canvas.addEventListener('mousedown', (e) => {
    startInteraction(e.clientX);
});
window.addEventListener('mouseup', () => {
    stopInteraction();
});

// Touch
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // prevent scroll/zoom
    startInteraction(e.touches[0].clientX);
}, { passive: false });

window.addEventListener('touchend', (e) => {
    stopInteraction();
});
window.addEventListener('touchcancel', (e) => {
    stopInteraction();
});

// --- UI RENDERER ---
function drawUI(ctx) {
    if (uiState === 'GAMEPLAY') return;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (uiState === 'TITLE') {
        const duration = 5.0; // 4s display + ~1s fade
        const t = uiTimer;

        let opacity = 1;
        let yOffset = 0;
        let scale = 1;

        // Entry (0s - 0.8s): Bounce scale-in
        if (t < 0.8) {
            const norm = t / 0.8;
            scale = Math.sin(norm * Math.PI * 1.2) * 1.1;
            opacity = Math.min(norm * 2, 1);
        }
        // Exit (4s - 5s): Float up + fade out
        else if (t > 4.0) {
            const norm = (t - 4.0) / 1.0;
            opacity = Math.max(0, 1 - norm);
            yOffset = norm * -80;
            scale = 1 + norm * 0.1;
        }

        ctx.save();
        ctx.translate(width / 2, height / 2 + yOffset);
        ctx.scale(scale, scale);
        ctx.globalAlpha = opacity;

        // Draw "WOOD" with grain texture
        ctx.font = 'bold 120px "Georgia", serif';
        const wWidth = ctx.measureText("WOOD").width;

        // Base brown color
        ctx.fillStyle = '#5D4037';
        ctx.fillText("WOOD", 0, -40);

        // Procedural Wood Grain Layer
        ctx.globalCompositeOperation = 'source-atop';
        ctx.strokeStyle = 'rgba(46, 30, 25, 0.4)';
        ctx.lineWidth = 3;
        for (let i = -wWidth / 2; i < wWidth / 2; i += 8) {
            ctx.beginPath();
            ctx.moveTo(i, -100);
            ctx.lineTo(i + (Math.random() - 0.5) * 20, 20);
            ctx.stroke();
        }
        // Random small dots for knots/grain
        ctx.fillStyle = 'rgba(46, 30, 25, 0.3)';
        for (let i = 0; i < 40; i++) {
            ctx.beginPath();
            ctx.arc((Math.random() - 0.5) * wWidth, (Math.random() - 0.5) * 100 - 40, 2 + Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';

        // Draw "DA HELLY" in solid earthy green
        ctx.font = 'bold 80px "Georgia", serif';
        ctx.fillStyle = '#2E7D32';
        ctx.fillText("DA HELLY", 0, 70);

        ctx.restore();

        if (uiTimer > duration) {
            uiState = 'INSTRUCTIONS';
            uiTimer = 0;
        }
    }
    else if (uiState === 'INSTRUCTIONS') {
        const duration = 4.0;
        let opacity = 0;
        let yOffset = 20 - Math.min(uiTimer * 20, 20); // soft float in

        if (uiTimer < 1.0) opacity = uiTimer;
        else if (uiTimer > 3.0) opacity = Math.max(0, 1 - (uiTimer - 3.0));
        else opacity = 1;

        ctx.save();
        ctx.translate(width / 2, height / 2 + yOffset);
        ctx.globalAlpha = opacity;

        ctx.fillStyle = '#FAFAFA';
        ctx.font = '30px "Helvetica", sans-serif';
        ctx.fillText("tap to grow trees", 0, -20);
        ctx.font = 'italic 24px "Helvetica", sans-serif';
        ctx.fillText("keep pressing to keep growing your tree", 0, 30);

        ctx.restore();

        if (uiTimer > duration) {
            uiState = 'GAMEPLAY';
        }
    }
}

// --- MAIN LOOP ---
function animate(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Cap delta time to prevent massive jumps on tab switches
    const cappedDt = Math.min(dt, 0.1);

    totalTime += cappedDt;
    uiTimer += cappedDt;

    // S2 Wind System (fluctuates over time)
    globalWind = Math.sin(totalTime * 0.4) * 0.5 + Math.sin(totalTime * 0.1) * 0.5;

    // Ground speed logic: natively mapping targets
    if (totalTime < 15) {
        targetGroundSpeed = 15; // super slow start
    } else {
        targetGroundSpeed = 100; // medium-fast cap
    }

    // Random atmospheric stalling math
    if (slowdownTimer > 0) {
        slowdownTimer -= cappedDt;
        if (slowdownTimer <= 0) {
            speedState = 'normal';
        }
    } else {
        if (Math.random() < cappedDt / 16) { // triggers roughly every 16 seconds mapped
            speedState = 'slowed';
            slowdownTimer = 3 + Math.random() * 3; // 3-6s length
        }
    }
    if (speedState === 'slowed') {
        targetGroundSpeed *= 0.3; // harsh but soft stall
    }

    // Interpolate gracefully!
    currentGroundSpeed += (targetGroundSpeed - currentGroundSpeed) * cappedDt * 1.5;

    // Slight slow fluctuation using combined sine waves for smooth non-chaotic variance (+- 12 px/s)
    let fluctuation = Math.sin(totalTime * 0.5) * 8 + Math.sin(totalTime * 0.15) * 4;

    // Update state mapping
    timeOffset += Math.max(0, currentGroundSpeed + fluctuation) * cappedDt;

    // Update Audio Physics Mapping Arrays
    if (typeof updateGrowthAudio === 'function') {
        updateGrowthAudio(activePlant !== null && activePlant.isActive, activePlant ? activePlant.currentSpeed / 100 : 0);
    }
    if (typeof updateRustleAudio === 'function') {
        updateRustleAudio(isRaining, activePlant);
    }

    // Update weather
    rainTimer -= cappedDt;
    if (rainTimer <= 0) {
        if (isRaining) {
            isRaining = false;
            rainTimer = 15 + Math.random() * 10; // wait 15-25s
        } else {
            isRaining = true;
            rainTimer = 5 + Math.random() * 5; // rain for 5-10s
        }
    }

    // Generate rain droplets
    if (isRaining) {
        const dropsToSpawn = Math.floor(400 * cappedDt) + (Math.random() < ((400 * cappedDt) % 1) ? 1 : 0);
        for (let i = 0; i < dropsToSpawn; i++) {
            droplets.push({
                x: Math.random() * (width + 800) - 400, // spawn wider for angled fall
                y: -50 - Math.random() * 100,
                length: 15 + Math.random() * 25,
                alpha: 0.2 + Math.random() * 0.4
            });
        }
    }

    const dropAngle = 80 * Math.PI / 180;
    const dropSpeed = 800; // pixels per second falling fast
    const dropVx = Math.cos(dropAngle) * dropSpeed;
    const dropVy = Math.sin(dropAngle) * dropSpeed;

    for (let i = droplets.length - 1; i >= 0; i--) {
        let d = droplets[i];
        d.x += dropVx * cappedDt;
        d.y += dropVy * cappedDt;
        if (d.y > height + 100 || d.x > width + 100) {
            droplets.splice(i, 1);
        }
    }

    // Update plants, filtering out ones that moved off-screen to save memory
    for (let i = plants.length - 1; i >= 0; i--) {
        const plant = plants[i];
        plant.update(cappedDt);

        // Check main root to despawn once deeply offscreen left BUT override explicitly if still infinitely held active!
        if (plant.rootX < -300 && !plant.isActive) {
            plants.splice(i, 1);
            if (activePlant === plant) activePlant = null;
        }
    }

    // --- RENDER ---
    ctx.clearRect(0, 0, width, height);

    const maxScreenWorldX = width + timeOffset;
    ensureBiomeSegments(maxScreenWorldX);
    ensureTextures(maxScreenWorldX);

    const centerWorldX = (width / 2) + timeOffset;
    const centerBiomeF = getBiomeFactorAt(centerWorldX);

    // Background Sky/Space mapping directly to center active terrain
    ctx.fillStyle = lerpColor(forestSkyColor, drySkyColor, centerBiomeF);
    ctx.fillRect(0, 0, width, height);

    // Draw UI on top of sky but behind everything else if needed? Actually user usually wants title on top.
    // I will draw it near the end.

    // Draw Plants first so ground covers their roots
    for (const plant of plants) {
        plant.draw(ctx);
    }

    // Draw Ground Fill with biome gradient
    ctx.beginPath();
    let xOffset = -50;
    ctx.moveTo(xOffset, height);
    ctx.lineTo(xOffset, getGroundY(xOffset));

    for (let x = xOffset; x <= width + 50; x += 10) {
        ctx.lineTo(x, getGroundY(x));
    }
    ctx.lineTo(width + 50, height);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, width, 0);
    for (let i = 0; i <= 4; i++) {
        const pFactor = i / 4;
        const px = pFactor * width;
        const pWorldX = px + timeOffset;
        const biomeF = getBiomeFactorAt(pWorldX);
        grad.addColorStop(pFactor, lerpColor(forestGroundColor, dryGroundColor, biomeF));
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Ground Textures
    for (const t of textures) {
        const screenX = t.x - timeOffset;
        if (screenX < -50 || screenX > width + 50) continue;
        const groundHere = getGroundY(screenX);
        const y = groundHere + t.relativeY;

        if (y > height) continue;

        const factor = getBiomeFactorAt(t.x);
        ctx.beginPath();
        if (factor > 0.5) {
            // Dry: dusty dots
            ctx.arc(screenX, y, t.size * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(160, 130, 80, ${0.2 + 0.3 * t.seed})`;
            ctx.fill();
        } else {
            // Forest: organic small lines/grass
            ctx.moveTo(screenX, y);
            ctx.lineTo(screenX + t.size * 1.5, y - t.size * 1.2 * t.seed);
            ctx.strokeStyle = `rgba(80, 110, 60, ${0.3 + 0.3 * t.seed})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // Draw Ground Outline (only the top edge)
    ctx.beginPath();
    ctx.moveTo(xOffset, getGroundY(xOffset));
    for (let x = xOffset; x <= width + 50; x += 10) {
        ctx.lineTo(x, getGroundY(x));
    }
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw Water Bodies
    let waterPoints = [];
    let inWaterPath = false;
    let anyWaterVisible = false;

    function drawWaterPoly(points) {
        if (points.length < 2) return;
        anyWaterVisible = true;
        ctx.beginPath();
        // top surface
        ctx.moveTo(points[0].x, points[0].topY);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].topY);
        // bottom surface (reversed)
        for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i].x, points[i].bottomY);
        ctx.closePath();

        ctx.fillStyle = 'rgba(130, 190, 230, 0.85)'; // Soft blue water
        ctx.fill();

        // Surface ripple line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].topY);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].topY);
        ctx.strokeStyle = '#1F2937'; // Thin black outline for water surface
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner foam line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].topY + 6);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].topY + 6);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // subtle white ripple
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    for (let screenX = -50; screenX <= width + 50; screenX += 10) {
        const worldX = screenX + timeOffset;
        const depth = getWaterDepthFactor(worldX);
        if (depth > 0.05) {
            const surfaceY = getBaseTerrainY(worldX) + 12; // slightly below grass edge
            const bottomY = getGroundY(screenX);
            const ripple = Math.sin(worldX * 0.05 - currentTime * 0.003) * 2;
            const finalTopY = Math.min(surfaceY + ripple, bottomY);

            waterPoints.push({ x: screenX, topY: finalTopY, bottomY: bottomY });
            inWaterPath = true;
        } else {
            if (inWaterPath) {
                drawWaterPoly(waterPoints);
                waterPoints = [];
                inWaterPath = false;
            }
        }
    }
    if (waterPoints.length > 0) {
        drawWaterPoly(waterPoints);
    }

    // Hook the water depth arrays natively backwards securely matching boolean properties exclusively spanning viewports
    if (typeof updateWaterAudio === 'function') {
        updateWaterAudio(anyWaterVisible ? 1.0 : 0.0);
    }

    // Draw Rain Droplets
    if (droplets.length > 0) {
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.5;
        for (const d of droplets) {
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - Math.cos(80 * Math.PI / 180) * d.length, d.y - Math.sin(80 * Math.PI / 180) * d.length);
            ctx.strokeStyle = `rgba(120, 160, 255, ${d.alpha})`;
            ctx.stroke();
        }
    }

    // DRAW UI LAST (TOP LAYER)
    drawUI(ctx);

    requestAnimationFrame(animate);
}

// Start loop
requestAnimationFrame(animate);
