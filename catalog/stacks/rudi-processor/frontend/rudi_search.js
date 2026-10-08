let activeFilters = new Set();
// Credentials stay only in page memory, never in storage or URLs.
let apiToken = '';

async function apiFetch(path) {
    if (!apiToken) throw new Error('Enter your API token and connect first.');
    const response = await fetch(path, { headers: { Authorization: `Bearer ${apiToken}` } });
    if (!response.ok) throw new Error(`API request failed (${response.status}). Check your token.`);
    return response;
}

async function connectApi() {
    const input = document.getElementById('apiToken');
    apiToken = input.value;
    input.value = '';
    await loadStats();
}

// Initialize stats
async function loadStats() {
    try {
        const response = await apiFetch('/api/stats');
        const stats = await response.json();

        document.getElementById('totalFiles').textContent = stats.total_files || 0;
        document.getElementById('processedFiles').textContent = stats.processed_files || 0;
        document.getElementById('totalCategories').textContent = stats.categories || 0;
        document.getElementById('visionAnalyzed').textContent = stats.vision_analyzed || 0;
        document.getElementById('connectionStatus').textContent = 'Connected';
    } catch (error) {
        document.getElementById('connectionStatus').textContent = error.message;
    }
}

function toggleFilter(chip, type) {
    chip.classList.toggle('active');
    if (activeFilters.has(type)) {
        activeFilters.delete(type);
    } else {
        activeFilters.add(type);
    }
    performSearch();
}

async function performSearch() {
    const query = document.getElementById('searchInput').value;
    const resultsDiv = document.getElementById('results');

    // Show loading
    resultsDiv.replaceChildren(textElement('div', 'loading', 'Searching with AI...'));

    try {
        const params = new URLSearchParams({
            q: query,
            filters: Array.from(activeFilters).join(',')
        });

        const response = await apiFetch(`/api/search?${params}`);
        const results = await response.json();

        displayResults(results);
    } catch (error) {
        resultsDiv.replaceChildren(textElement('div', 'loading', error.message));
    }
}

function textElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = String(text ?? '');
    return element;
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.replaceChildren();
    if (!Array.isArray(results) || results.length === 0) {
        resultsDiv.append(textElement('div', 'loading', 'No results found'));
        return;
    }
    resultsDiv.append(textElement('h2', '', `Found ${results.length} results`));
    results.forEach(result => resultsDiv.append(createResultCard(result)));
}

function createResultCard(result) {
    const types = ['pdf', 'documents', 'image', 'images', 'text', 'video', 'audio', 'structured'];
    const type = types.includes(result.file_type) ? result.file_type : 'text';
    const card = textElement('div', 'result-card', '');
    card.addEventListener('click', () => openFile(result.file_path));
    const header = textElement('div', 'result-header', '');
    header.append(textElement('div', 'result-title', `${getFileIcon(type)} ${result.original_name}`),
        textElement('div', `result-type ${type}`, result.file_type || type));
    const meta = textElement('div', 'result-meta', '');
    meta.append(textElement('span', '', `📅 ${formatDate(result.modified)}`),
        textElement('span', '', `📊 ${formatSize(result.size_bytes)}`),
        textElement('span', '', `🏷️ ${result.category || 'Uncategorized'}`));
    if (result.vision_analyzed) meta.append(textElement('span', '', '👁️ Vision analyzed'));
    card.append(header, textElement('div', 'result-summary', result.summary || 'No summary available'), meta);
    return card;
}

function getFileIcon(type) {
    const icons = {
        'pdf': '📄',
        'documents': '📄',
        'image': '🖼️',
        'images': '🖼️',
        'text': '📝',
        'video': '🎥',
        'audio': '🎵',
        'structured': '📊'
    };
    return icons[type] || '📎';
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString();
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function openFile(path) {
    console.log('Opening file:', path);
    // Could open file or show detailed view
}

// Drag and drop
const uploadZone = document.getElementById('uploadZone');

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    console.log('Files dropped:', files);
    // Process files with RUDI
});

// Search on Enter
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});
