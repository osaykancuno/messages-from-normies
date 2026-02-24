// ================================
// MESSAGES FROM NORMIES - Frontend
// ================================

// --- DOM Elements ---
const wall = document.getElementById('wall');
const counter = document.getElementById('counter');
const addBtn = document.getElementById('addBtn');
const addModal = document.getElementById('addModal');
const closeAdd = document.getElementById('closeAdd');
const normieInput = document.getElementById('normieInput');
const messageInput = document.getElementById('messageInput');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const previewName = document.getElementById('previewName');
const previewError = document.getElementById('previewError');
const charCount = document.getElementById('charCount');
const submitBtn = document.getElementById('submitBtn');
const submitError = document.getElementById('submitError');
const detailModal = document.getElementById('detailModal');
const closeDetail = document.getElementById('closeDetail');
const detailContent = document.getElementById('detailContent');

// --- State ---
let blocks = [];
let previewTimeout = null;
let currentNormieValid = false;
let isSubmitting = false;

// --- Initialize ---
async function init() {
  await loadBlocks();
  renderWall();
  setupEvents();

  // Auto-refresh wall every 30 seconds
  setInterval(async () => {
    await loadBlocks();
    renderWall();
  }, 30000);
}

// --- Load Blocks from Server ---
async function loadBlocks() {
  try {
    const res = await fetch('/api/blocks');
    if (!res.ok) throw new Error('Server error');
    blocks = await res.json();
  } catch (err) {
    console.error('Failed to load blocks:', err);
  }
}

// --- Render Wall ---
function renderWall() {
  // Remove loading if present
  const loading = document.getElementById('loading');
  if (loading) loading.remove();

  // Update counter
  if (blocks.length === 0) {
    counter.textContent = 'THE WALL AWAITS';
  } else if (blocks.length >= 1600) {
    counter.textContent = 'THE WALL IS FULL';
  } else {
    counter.textContent = `${blocks.length} MESSAGE${blocks.length !== 1 ? 'S' : ''} ON THE WALL`;
  }

  // Empty state
  if (blocks.length === 0) {
    wall.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="2" y="2" width="20" height="12" stroke="#333" stroke-width="2" fill="none"/>
            <rect x="26" y="2" width="20" height="12" stroke="#333" stroke-width="2" fill="none"/>
            <rect x="14" y="18" width="20" height="12" stroke="#333" stroke-width="2" fill="none"/>
            <rect x="2" y="34" width="20" height="12" stroke="#333" stroke-width="2" fill="none"/>
            <rect x="26" y="34" width="20" height="12" stroke="#333" stroke-width="2" fill="none"/>
          </svg>
        </div>
        <p>THE WALL IS EMPTY</p>
        <p>BE THE FIRST TO LEAVE YOUR MARK</p>
      </div>
    `;
    return;
  }

  // Check if wall is full (hide add button)
  const wallFull = blocks.length >= 1600;
  addBtn.style.display = wallFull ? 'none' : '';

  // Render bricks
  wall.innerHTML = blocks.map((block, i) => {
    const delay = Math.min(i * 0.04, 1.5);
    return `
      <div class="brick" data-normie-id="${block.normie_id}" style="animation-delay:${delay}s">
        <img
          class="brick-avatar"
          src="/api/normie/${block.normie_id}/image"
          alt="Normie #${block.normie_id}"
          loading="lazy"
          onerror="this.style.display='none'"
        >
        <div class="brick-content">
          <p class="brick-message">${escapeHtml(block.message)}</p>
          <span class="brick-id">#${block.normie_id}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach click handlers
  wall.querySelectorAll('.brick').forEach(brick => {
    brick.addEventListener('click', () => {
      showDetail(parseInt(brick.dataset.normieId));
    });
  });
}

// --- Show Block Detail ---
async function showDetail(normieId) {
  const block = blocks.find(b => b.normie_id === normieId);
  if (!block) return;

  const dateStr = new Date(block.created_at).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  detailContent.innerHTML = `
    <img
      class="detail-avatar"
      src="/api/normie/${normieId}/image"
      alt="Normie #${normieId}"
    >
    <p class="detail-message">"${escapeHtml(block.message)}"</p>
    <p class="detail-id">NORMIE #${normieId}</p>
    <div class="detail-traits" id="traitsContainer">
      <h3>TRAITS</h3>
      <div class="trait"><span class="trait-type">Loading...</span><span class="trait-value"></span></div>
    </div>
    <p class="detail-edits">${(block.edit_count || 0) >= 5 ? 'PERMANENT' : `${5 - (block.edit_count || 0)} EDITS LEFT`}</p>
    <p class="detail-date">Tagged on ${dateStr}</p>
  `;

  detailModal.classList.remove('hidden');

  // Fetch traits
  try {
    const res = await fetch(`/api/normie/${normieId}/traits`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    const container = document.getElementById('traitsContainer');

    if (data.attributes && data.attributes.length > 0) {
      container.innerHTML = `
        <h3>TRAITS</h3>
        ${data.attributes.map(attr => `
          <div class="trait">
            <span class="trait-type">${escapeHtml(String(attr.trait_type))}</span>
            <span class="trait-value">${escapeHtml(String(attr.value))}</span>
          </div>
        `).join('')}
      `;
    } else {
      container.innerHTML = '<h3>TRAITS</h3><div class="trait"><span class="trait-type">No traits available</span><span></span></div>';
    }
  } catch {
    const container = document.getElementById('traitsContainer');
    if (container) {
      container.innerHTML = '<h3>TRAITS</h3><div class="trait"><span class="trait-type">Could not load traits</span><span></span></div>';
    }
  }
}

// --- Preview Normie ---
async function loadPreview(id) {
  if (isNaN(id) || id < 0 || id > 9999) {
    preview.classList.add('hidden');
    previewError.classList.add('hidden');
    currentNormieValid = false;
    updateSubmitState();
    return;
  }

  preview.classList.add('hidden');
  previewError.classList.add('hidden');

  try {
    const res = await fetch(`/api/normie/${id}/metadata`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    previewImg.src = `/api/normie/${id}/image`;
    previewName.textContent = data.name || `Normie #${id}`;

    // Check if this normie already has a block and show edit info
    const existingBlock = blocks.find(b => b.normie_id === id);
    const editInfo = document.getElementById('editInfo');
    if (existingBlock) {
      const editsUsed = existingBlock.edit_count || 0;
      const editsLeft = 5 - editsUsed;
      if (editInfo) {
        if (editsLeft <= 0) {
          editInfo.textContent = 'This message is permanent. No edits left.';
          editInfo.classList.remove('hidden');
        } else {
          editInfo.textContent = `Already on the wall. ${editsLeft} edit${editsLeft !== 1 ? 's' : ''} remaining.`;
          editInfo.classList.remove('hidden');
        }
      }
    } else {
      if (editInfo) editInfo.classList.add('hidden');
    }

    preview.classList.remove('hidden');
    currentNormieValid = true;
  } catch {
    previewError.textContent = `Normie #${id} non trovato`;
    previewError.classList.remove('hidden');
    currentNormieValid = false;
  }

  updateSubmitState();
}

// --- Update Submit Button State ---
function updateSubmitState() {
  const hasMessage = messageInput.value.trim().length > 0;
  submitBtn.disabled = !(currentNormieValid && hasMessage && !isSubmitting);
}

// --- Submit Block ---
async function submitBlock() {
  if (isSubmitting) return;

  const normieId = parseInt(normieInput.value);
  const message = messageInput.value.trim();

  if (!currentNormieValid || !message) return;

  isSubmitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'PLACING...';
  submitError.classList.add('hidden');

  try {
    const res = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normie_id: normieId, message })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Errore durante il salvataggio.');
    }

    // Success - reload wall and close modal
    await loadBlocks();
    renderWall();
    closeAddModal();

    // Scroll to see the new brick
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    submitError.textContent = err.message;
    submitError.classList.remove('hidden');
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'PLACE ON WALL';
  }
}

// --- Modal Controls ---
function openAddModal() {
  normieInput.value = '';
  messageInput.value = '';
  charCount.textContent = '0';
  preview.classList.add('hidden');
  previewError.classList.add('hidden');
  submitError.classList.add('hidden');
  document.getElementById('editInfo').classList.add('hidden');
  currentNormieValid = false;
  isSubmitting = false;
  submitBtn.disabled = true;
  submitBtn.textContent = 'PLACE ON WALL';
  addModal.classList.remove('hidden');

  // Focus input after animation
  setTimeout(() => normieInput.focus(), 200);
}

function closeAddModal() {
  addModal.classList.add('hidden');
  clearTimeout(previewTimeout);
}

function closeDetailModal() {
  detailModal.classList.add('hidden');
}

// --- Setup Event Listeners ---
function setupEvents() {
  // Open add modal
  addBtn.addEventListener('click', openAddModal);

  // Close buttons
  closeAdd.addEventListener('click', closeAddModal);
  closeDetail.addEventListener('click', closeDetailModal);

  // Close on overlay click
  addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeAddModal();
  });
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetailModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAddModal();
      closeDetailModal();
    }
  });

  // Normie ID input - debounced preview
  normieInput.addEventListener('input', () => {
    clearTimeout(previewTimeout);
    currentNormieValid = false;
    preview.classList.add('hidden');
    previewError.classList.add('hidden');
    updateSubmitState();

    const val = normieInput.value.trim();
    if (val === '') return;

    const id = parseInt(val);
    previewTimeout = setTimeout(() => loadPreview(id), 600);
  });

  // Message input - character counter
  messageInput.addEventListener('input', () => {
    charCount.textContent = messageInput.value.length;
    updateSubmitState();
  });

  // Submit button
  submitBtn.addEventListener('click', submitBlock);

  // Enter key in message input
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled) {
      submitBlock();
    }
  });
}

// --- Utility: Escape HTML ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Start ---
init();
