function init() {
    // Idempotent guard — init() may be called both by DOMContentLoaded (when
    // badge DOM is present in the page directly, e.g. badge.html) and by
    // js/badge-panel.js (when badge DOM is mounted into a cube panel).
    if (window.__SRMBadgeInited) return;
    var canvas = document.getElementById('badgeCanvas');
    if (!canvas) return; // No badge DOM yet — let badge-panel.js mount and call us.
    window.__SRMBadgeInited = true;

    // Tab switching
    const tabs = document.querySelectorAll('.badge-tab-btn');
    const panes = document.querySelectorAll('.badge-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('is-active'));
            panes.forEach(p => p.classList.remove('is-active'));

            tab.classList.add('is-active');
            const targetPane = document.getElementById(tab.dataset.tab);
            if (targetPane) targetPane.classList.add('is-active');
        });
    });

    // Path A: Upload own badge
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const uploadFeedback = document.getElementById('uploadFeedback');
    const badgeCanvas = document.getElementById('badgeCanvas');
    const ctx = badgeCanvas.getContext('2d');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--accent-color)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'var(--border-color)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border-color)';
            if (e.dataTransfer.files.length > 0) {
                handleUploadedFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleUploadedFile(e.target.files[0]);
            }
        });
    }

    function handleUploadedFile(file) {
        if (!file.type.startsWith('image/')) {
            uploadFeedback.innerHTML = `<span style="color: #ff5555;">Error: File must be an image.</span>`;
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Clear and draw uploaded image scaled to 88x31
                ctx.clearRect(0, 0, 88, 31);
                ctx.drawImage(img, 0, 0, 88, 31);
                uploadFeedback.innerHTML = `<span style="color: #55ff55;">Loaded: ${file.name} (Preview updated)</span>`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Path B: Dynamic editor logic
    const badgeText = document.getElementById('badgeText');
    const badgeSubtext = document.getElementById('badgeSubtext');
    const bgColor1 = document.getElementById('bgColor1');
    const bgColor2 = document.getElementById('bgColor2');
    const textColor = document.getElementById('textColor');
    const accentColor = document.getElementById('accentColor');
    const presetButtons = document.querySelectorAll('.preset-btn');
    const frameStrip = document.getElementById('frameStrip');
    const btnAddFrame = document.getElementById('btnAddFrame');
    const btnDeleteFrame = document.getElementById('btnDeleteFrame');
    const btnClearFrames = document.getElementById('btnClearFrames');
    const btnExport = document.getElementById('btnExport');
    const exportStatus = document.getElementById('exportStatus');

    let frames = []; // Array of ImageData representing each frame
    let currentFrameIndex = 0;
    let selectedPreset = 'shimmer';
    let animationTimer = null;

    // Helper to render static elements on a temp canvas context
    function drawBadgeFrame(tempCtx, width, height, frameIndex, totalFrames) {
        // Draw background gradient
        const grad = tempCtx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, bgColor1.value);
        grad.addColorStop(1, bgColor2.value);
        tempCtx.fillStyle = grad;
        tempCtx.fillRect(0, 0, width, height);

        // Draw side brand line/indicator
        tempCtx.fillStyle = accentColor.value;
        tempCtx.fillRect(2, 2, 3, height - 4);

        // Draw small Ring hexagon / shape on the left
        tempCtx.strokeStyle = accentColor.value;
        tempCtx.lineWidth = 1;
        tempCtx.beginPath();
        tempCtx.arc(12, 15, 4, 0, Math.PI * 2);
        tempCtx.stroke();
        
        // Inner dot
        tempCtx.fillStyle = accentColor.value;
        tempCtx.beginPath();
        tempCtx.arc(12, 15, 1.5, 0, Math.PI * 2);
        tempCtx.fill();

        // Draw border
        tempCtx.strokeStyle = accentColor.value;
        tempCtx.strokeRect(0, 0, width, height);

        // Apply animations based on current preset and frameIndex
        const textVal = badgeText.value.toUpperCase();
        const subVal = badgeSubtext.value;
        
        tempCtx.font = "bold 9px 'Kode Mono', monospace";
        tempCtx.textBaseline = "middle";

        if (selectedPreset === 'shimmer') {
            // Text Rendering
            tempCtx.fillStyle = textColor.value;
            tempCtx.fillText(textVal, 22, 11);

            tempCtx.font = "5px 'Kode Mono', monospace";
            tempCtx.fillStyle = 'rgba(255,255,255,0.7)';
            tempCtx.fillText(subVal, 22, 22);

            // Diagonal shimmer sweep
            const progress = frameIndex / (totalFrames - 1);
            const sweepX = -20 + progress * (width + 40);
            
            tempCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            tempCtx.beginPath();
            tempCtx.moveTo(sweepX, 0);
            tempCtx.lineTo(sweepX + 15, 0);
            tempCtx.lineTo(sweepX + 5, height);
            tempCtx.lineTo(sweepX - 10, height);
            tempCtx.closePath();
            tempCtx.fill();

        } else if (selectedPreset === 'glitch') {
            // Occasional horizontal glitch text offset
            let offset = 0;
            let doGlitch = false;
            
            if (frameIndex === 2 || frameIndex === 7) {
                offset = (Math.random() - 0.5) * 4;
                doGlitch = true;
            }

            tempCtx.fillStyle = textColor.value;
            tempCtx.fillText(textVal, 22 + offset, 11);

            tempCtx.font = "5px 'Kode Mono', monospace";
            tempCtx.fillStyle = 'rgba(255,255,255,0.7)';
            tempCtx.fillText(subVal, 22 + offset, 22);

            if (doGlitch) {
                // Glitch scanline bar
                tempCtx.fillStyle = accentColor.value;
                tempCtx.fillRect(0, Math.floor(Math.random() * height), width, 1);
            }

        } else if (selectedPreset === 'typewriter') {
            // Reveal text character by character
            const charsToDraw = Math.ceil((frameIndex / (totalFrames - 3)) * textVal.length);
            const partialText = textVal.substring(0, Math.max(0, charsToDraw));
            
            tempCtx.fillStyle = textColor.value;
            tempCtx.fillText(partialText, 22, 11);

            // Subtext typing delay
            if (frameIndex > totalFrames / 2) {
                const subChars = Math.ceil(((frameIndex - totalFrames/2) / (totalFrames/2 - 1)) * subVal.length);
                const partialSub = subVal.substring(0, Math.max(0, subChars));
                tempCtx.font = "5px 'Kode Mono', monospace";
                tempCtx.fillStyle = 'rgba(255,255,255,0.7)';
                tempCtx.fillText(partialSub, 22, 22);
            }
        }
    }

    // Generate frames based on selected preset
    function generatePresetFrames() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 88;
        tempCanvas.height = 31;
        const tempCtx = tempCanvas.getContext('2d');

        frames = [];
        const numFrames = selectedPreset === 'shimmer' ? 12 : selectedPreset === 'glitch' ? 10 : 15;

        for (let i = 0; i < numFrames; i++) {
            tempCtx.clearRect(0, 0, 88, 31);
            drawBadgeFrame(tempCtx, 88, 31, i, numFrames);
            frames.push(tempCtx.getImageData(0, 0, 88, 31));
        }

        currentFrameIndex = 0;
        updateFrameStripUI();
        startPlayback();
    }

    // Render current frame to main preview canvas
    function renderPreviewFrame() {
        if (frames.length === 0) return;
        ctx.putImageData(frames[currentFrameIndex], 0, 0);
    }

    // Playback loop
    function startPlayback() {
        if (animationTimer) clearInterval(animationTimer);
        animationTimer = setInterval(() => {
            if (frames.length > 0) {
                currentFrameIndex = (currentFrameIndex + 1) % frames.length;
                renderPreviewFrame();
                highlightFrameStripActive();
            }
        }, 120); // 120ms per frame
    }

    // UI Frame strip rendering
    function updateFrameStripUI() {
        if (!frameStrip) return;
        frameStrip.innerHTML = '';

        frames.forEach((frame, index) => {
            const thumb = document.createElement('canvas');
            thumb.width = 88;
            thumb.height = 31;
            const thumbCtx = thumb.getContext('2d');
            thumbCtx.putImageData(frame, 0, 0);

            const container = document.createElement('div');
            container.className = `frame-thumbnail ${index === currentFrameIndex ? 'is-active' : ''}`;
            container.dataset.index = index;
            container.appendChild(thumb);

            const numLabel = document.createElement('span');
            numLabel.className = 'frame-num';
            numLabel.textContent = index + 1;
            container.appendChild(numLabel);

            container.addEventListener('click', () => {
                clearInterval(animationTimer);
                currentFrameIndex = index;
                renderPreviewFrame();
                highlightFrameStripActive();
            });

            frameStrip.appendChild(container);
        });
    }

    function highlightFrameStripActive() {
        if (!frameStrip) return;
        const thumbs = frameStrip.querySelectorAll('.frame-thumbnail');
        thumbs.forEach((t, index) => {
            if (index === currentFrameIndex) {
                t.classList.add('is-active');
                // Scroll thumbnail into view if needed
                t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } else {
                t.classList.remove('is-active');
            }
        });
    }

    // Preset selection change
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            selectedPreset = btn.dataset.preset;
            generatePresetFrames();
        });
    });

    // Form input listeners
    [badgeText, badgeSubtext, bgColor1, bgColor2, textColor, accentColor].forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                generatePresetFrames();
            });
        }
    });

    // Frame strip controls
    if (btnAddFrame) {
        btnAddFrame.addEventListener('click', () => {
            // Duplicate current frame
            if (frames.length > 0) {
                clearInterval(animationTimer);
                const currentData = frames[currentFrameIndex];
                const copyData = ctx.createImageData(currentData);
                copyData.data.set(currentData.data);
                frames.splice(currentFrameIndex + 1, 0, copyData);
                currentFrameIndex++;
                updateFrameStripUI();
                renderPreviewFrame();
            }
        });
    }

    if (btnDeleteFrame) {
        btnDeleteFrame.addEventListener('click', () => {
            if (frames.length > 1) {
                clearInterval(animationTimer);
                frames.splice(currentFrameIndex, 1);
                currentFrameIndex = Math.min(currentFrameIndex, frames.length - 1);
                updateFrameStripUI();
                renderPreviewFrame();
            } else {
                alert("Cannot delete the only frame!");
            }
        });
    }

    if (btnClearFrames) {
        btnClearFrames.addEventListener('click', () => {
            generatePresetFrames();
        });
    }

    // Real Browser-Side GIF Encoding via gif.js and cross-origin Web Worker trick
    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            if (frames.length === 0) {
                alert("No frames to export!");
                return;
            }

            btnExport.disabled = true;
            exportStatus.textContent = 'Generating worker...';

            try {
                // Fetch the worker content from cloudflare cdnjs to avoid CORS blocks
                const workerScriptUrl = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';
                const workerResponse = await fetch(workerScriptUrl);
                const workerBlob = await workerResponse.blob();
                const workerBlobUrl = URL.createObjectURL(workerBlob);

                // Initialize gif.js
                const gif = new GIF({
                    workers: 2,
                    quality: 10,
                    width: 88,
                    height: 31,
                    workerScript: workerBlobUrl
                });

                // Add all frames
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 88;
                tempCanvas.height = 31;
                const tempCtx = tempCanvas.getContext('2d');

                frames.forEach((frameData) => {
                    tempCtx.putImageData(frameData, 0, 0);
                    gif.addFrame(tempCtx, { copy: true, delay: 120 });
                });

                exportStatus.textContent = 'Rendering GIF...';

                gif.on('finished', (blob) => {
                    exportStatus.textContent = 'Download ready!';
                    btnExport.disabled = false;

                    // Trigger browser download
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${badgeText.value.toLowerCase().replace(/\s+/g, '-')}-badge.gif`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // Revoke URL to save memory
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                });

                gif.render();

            } catch (err) {
                console.error(err);
                exportStatus.textContent = 'Export failed: Check console.';
                btnExport.disabled = false;
            }
        });
    }

    // Initialize Editor on start
    generatePresetFrames();
}

// Exposed for late-mount (e.g. cube panel injection by js/badge-panel.js).
window.__SRMBadgeInit = init;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
