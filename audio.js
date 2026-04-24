// audio.js
// Specialized Web Audio API Generative ASMR Engine

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isAudioInitialized = false;

// Generative Synthesis Nodes
let waterGain, waterFilter;
let growthGain, treesGrowingBuffer, treesGrowingSource;
let rustleGain, rustleFilter;

const masterGain = audioCtx.createGain();
masterGain.gain.value = 0.5; // strictly controlled master balancing
masterGain.connect(audioCtx.destination);

// Utility: Generate White Noise Buffer
function createNoiseBuffer() {
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

const noiseBuffer = createNoiseBuffer();

function createNoiseSource() {
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    return noise;
}

// Pre-load external growth audio
async function loadTreesGrowingBuffer() {
    try {
        const response = await fetch('trees-growing.m4a');
        const arrayBuffer = await response.arrayBuffer();
        treesGrowingBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error("Failed to load growth audio asset:", e);
    }
}
loadTreesGrowingBuffer();

// 1. Initialize core channels lazily on first user interaction bypasses strict media block rules
function initAudio() {
    if (isAudioInitialized) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isAudioInitialized = true;
    
    // Water Setup
    const waterNoise = createNoiseSource();
    waterFilter = audioCtx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.value = 350; // soft heavily muted
    waterGain = audioCtx.createGain();
    waterGain.gain.value = 0;
    
    waterNoise.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(masterGain);
    waterNoise.start();
    
    // Growth Setup (External Asset Loop)
    growthGain = audioCtx.createGain();
    growthGain.gain.value = 0;
    growthGain.connect(masterGain);
    
    // Rustle Setup (High frequency noise passing)
    const rustleNoise = createNoiseSource();
    rustleFilter = audioCtx.createBiquadFilter();
    rustleFilter.type = 'highpass';
    rustleFilter.frequency.value = 6000;
    
    // Slight panning to give it texture
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = 0.5;
    
    rustleGain = audioCtx.createGain();
    rustleGain.gain.value = 0;
    
    rustleNoise.connect(rustleFilter);
    rustleFilter.connect(panner);
    panner.connect(rustleGain);
    rustleGain.connect(masterGain);
    rustleNoise.start();
}

// Frame updates tied to specific math loops
function updateWaterAudio(waterVisibleRatio) {
    if (!isAudioInitialized) return;
    const targetVol = Math.min(Math.max(waterVisibleRatio, 0), 1) * 0.15; // smooth capped volumes
    waterGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.5); 
}

function updateGrowthAudio(isActive, speedRatio) {
    if (!isAudioInitialized || !treesGrowingBuffer) return;
    
    if (isActive) {
       // Start looping if not already playing
       if (!treesGrowingSource) {
           treesGrowingSource = audioCtx.createBufferSource();
           treesGrowingSource.buffer = treesGrowingBuffer;
           treesGrowingSource.loop = true;
           treesGrowingSource.connect(growthGain);
           treesGrowingSource.start();
       }
       
       const targetVol = 0.1 + Math.min(speedRatio * 0.4, 0.4); // Subtle but audible
       growthGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.1);
    } else {
       if (treesGrowingSource) {
           growthGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15); // Fade out quickly
           
           // Clean up source after fade
           const sourceToStop = treesGrowingSource;
           treesGrowingSource = null;
           setTimeout(() => {
               try { sourceToStop.stop(); } catch(e){}
           }, 500);
       }
    }
}

function updateRustleAudio(isRaining, activePlant) {
    if (!isAudioInitialized) return;
    let targetVol = 0;
    if (isRaining) targetVol += 0.05;
    if (isRaining && activePlant && activePlant.growthProfile !== 'slow') {
        targetVol += 0.08; // explicitly swell overlapping volumes natively exclusively!
    }
    rustleGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.5);
}

// Play-Once triggers purely isolated
function playRoofKnock() {
    if (!isAudioInitialized) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine'; // deeply pure knocking frequency
    
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05); // sharp heavy impact drop
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08); // exponential falloffs pop heavily
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}
