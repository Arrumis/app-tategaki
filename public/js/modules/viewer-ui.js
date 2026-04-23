
/**
 * Viewer UI Logic
 */
import { state, setState } from './viewer-state.js';
import * as core from './viewer-core.js';

const els = {};

function initEls() {
    els.container = document.getElementById('viewer-container');
    els.menu = document.getElementById('menu-overlay');
    els.tapZoneCenter = document.getElementById('tap-zone-center');
    els.tapNext = document.getElementById('tap-zone-next');
    els.tapPrev = document.getElementById('tap-zone-prev');
    els.toast = document.getElementById('toast');
    els.settingsPanel = document.getElementById('settings-panel');
    els.panelBackdrop = document.getElementById('panel-backdrop');
    els.btnNextEp = document.getElementById('btn-next-ep');
    els.btnNextPage = document.getElementById('btn-next-page');
    els.btnPrevPage = document.getElementById('btn-prev-page');
    els.btnPrevEp = document.getElementById('btn-prev-ep');
}



export async function initUI() {
    initEls();
    const params = new URLSearchParams(window.location.search);
    const siteType = params.get('site') || 'narou';
    const novelId = params.get('id');
    let epNo = 1;
    try { epNo = parseInt(params.get('ep') || '1', 10); } catch (e) { }
    const scroll = parseFloat(params.get('scroll') || '0');

    if (!novelId) {
        document.getElementById('novel-content').innerHTML = '<p>作品IDが指定されていません。</p>';
        return;
    }

    setState({ siteType, novelId, epNo });

    // Global Handlers
    window.closeSettings = closeAllPanels;
    window.closeToc = closeAllPanels;
    window.closeAllPanels = closeAllPanels;
    window.goToEp = goToEp;

    // Load Settings
    core.loadSettings();
    updateSettingsUI();

    // Event Listeners
    setupInteractions();

    // Load Content
    try {
        await core.loadEpisode(scroll);
    } catch (e) { /* handled in core */ }

    // Load Info (Parallel)
    core.loadNovelInfo().then(() => {
        // updateToc() is removed
        updateNavButtons();
    });

    // Scroll Watch
    els.container.addEventListener('scroll', checkScrollEdges);
    window.addEventListener('resize', checkScrollEdges);
    setTimeout(checkScrollEdges, 200);

    // Auto Save on Leave
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (state.scrollTimer) clearTimeout(state.scrollTimer);
            core.saveHistory(els.container.scrollLeft);
        }
    });
}

// --- Interaction ---

function setupInteractions() {
    // Single Click Handler for Container (Supports native scroll/swipe)
    document.addEventListener('click', (e) => {
        // コンテナ外（ヘッダー等は存在しないが念のため）や、インタラクティブ要素は無視
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.list-tabs')) return;

        // パネル内操作は無視
        if (e.target.closest('.settings-panel') || e.target.closest('.toc-panel') || e.target.closest('.menu-grid')) return;

        // テキスト選択中は無視
        if (window.getSelection().toString().length > 0) return;

        // メニュー等が開いている場合
        if (els.menu.classList.contains('active')) {
            // メニュー外（背景）をクリックした場合は閉じる
            els.menu.classList.remove('active');
            return;
        }
        if (document.querySelector('.settings-panel.active') || document.querySelector('.toc-panel.active')) return;

        // ここまで来たらページ操作
        const width = window.innerWidth;
        const x = e.clientX;

        // エリア判定 (左:次, 右:前, 中央:メニュー)
        if (x < width * 0.3) {
            moveNextPage();
        } else if (x > width * 0.7) {
            movePrevPage();
        } else {
            // 中央タップ -> メニュー
            e.stopPropagation(); // 必要に応じて
            els.menu.classList.add('active');
            closeAllPanels();
            checkScrollEdges();
        }
    });

    // Wheel
    window.addEventListener('wheel', (e) => {
        if (els.menu.classList.contains('active')) return;
        if (els.settingsPanel.classList.contains('active')) return;
        // tocPanel check removed

        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            const direction = e.deltaY > 0 ? -1 : 1;
            scrollByAmount(direction * 120, 'auto');
        }
    }, { passive: true });

    // Buttons
    if (els.btnNextEp) els.btnNextEp.onclick = () => goToEp(state.epNo + 1);
    if (els.btnPrevEp) els.btnPrevEp.onclick = () => goToEp(state.epNo - 1);
    if (els.btnNextPage) els.btnNextPage.onclick = () => moveNextPage();
    if (els.btnPrevPage) els.btnPrevPage.onclick = () => movePrevPage();

    // Panels
    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) btnSettings.onclick = openSettings;

    const btnToc = document.getElementById('btn-toc');
    if (btnToc) btnToc.onclick = openToc;

    // Bookmark
    const btnBookmark = document.getElementById('btn-bookmark');
    if (btnBookmark) {
        btnBookmark.onclick = async () => {
            try {
                await core.saveBookmark(els.container.scrollLeft);
                showToast('栞を挟みました');
            } catch (e) {
                showToast('エラー: 保存失敗');
            }
        };
    }

    // Settings
    const ctrlTheme = document.getElementById('ctrl-theme');
    if (ctrlTheme) {
        ctrlTheme.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            setState({ theme: e.target.dataset.val });
            core.applyStyle(); // re-apply
            core.saveSettings();
            updateSettingsUI();
        };
    }

    const ctrlFontSize = document.getElementById('ctrl-font-size');
    if (ctrlFontSize) {
        ctrlFontSize.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            const sizeMap = { 'small': 14, 'medium': 18, 'large': 22, 'xlarge': 26 };
            setState({ fontSize: sizeMap[e.target.dataset.val] || 18 });
            core.applyStyle();
            core.saveSettings();
            updateSettingsUI();
        };
    }

    const ctrlLineHeight = document.getElementById('ctrl-line-height');
    if (ctrlLineHeight) {
        ctrlLineHeight.onclick = (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            setState({ lineHeight: e.target.dataset.val });
            core.applyStyle();
            core.saveSettings();
            updateSettingsUI();
        };
    }
}

// --- Navigation ---

function moveNextPage() {
    const scrollEnd = els.container.scrollWidth - els.container.clientWidth;
    const isAtEnd = Math.abs(Math.abs(els.container.scrollLeft) - scrollEnd) < 10;

    if (isAtEnd) {
        if (state.novelInfo && state.epNo < state.novelInfo.total_episodes) {
            showToast('次の話へ移動します');
            setTimeout(() => goToEp(state.epNo + 1), 500);
        } else {
            showToast('最新話です');
        }
    } else {
        scrollByPage(-1); // Left is negative in RTL-like scroll (but here we use negative for left)
        // Note: tategaki CSS usually sets direction: rtl or writing-mode: vertical-rl
        // If writing-mode: vertical-rl, scrollLeft is usually negative or 0 at start?
        // Let's stick to existing logic:
        // scrollByAmount uses `left`. 
    }
}

function movePrevPage() {
    const isAtStart = Math.abs(els.container.scrollLeft) < 10;
    if (isAtStart) {
        if (state.epNo > 1) {
            showToast('前の話へ移動します');
            setTimeout(() => goToEp(state.epNo - 1), 500);
        } else {
            showToast('最初のページです');
        }
    } else {
        scrollByPage(1);
    }
}

function scrollByPage(direction) {
    const width = window.innerWidth;
    const scrollAmount = width * 0.88;
    scrollByAmount(direction * scrollAmount, 'smooth');
}

function scrollByAmount(amount, behavior) {
    els.container.scrollBy({ left: amount, behavior: behavior });
    setTimeout(checkScrollEdges, 500);
}

function checkScrollEdges() {
    const isAtStart = Math.abs(els.container.scrollLeft) < 10;
    const scrollEnd = els.container.scrollWidth - els.container.clientWidth;
    const isAtEnd = Math.abs(Math.abs(els.container.scrollLeft) - scrollEnd) < 10;

    els.btnPrevPage.disabled = isAtStart;
    els.btnNextPage.disabled = isAtEnd;

    // Auto Save History
    if (state.scrollTimer) clearTimeout(state.scrollTimer);
    const timer = setTimeout(() => {
        core.saveHistory(els.container.scrollLeft);
    }, 2000);
    setState({ scrollTimer: timer });
}

function goToEp(nextEpNo) {
    if (state.novelInfo && (nextEpNo < 1 || nextEpNo > state.novelInfo.total_episodes)) return;
    location.href = `?site=${state.siteType}&id=${state.novelId}&ep=${nextEpNo}`;
}

// --- UI Updates ---

function updateSettingsUI() {
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.val === state.theme);
    });
    const sizeMap = { 14: 'small', 18: 'medium', 22: 'large', 26: 'xlarge' };
    const currentSizeKey = sizeMap[state.fontSize] || 'medium';
    document.querySelectorAll('#ctrl-font-size button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === currentSizeKey);
    });
    document.querySelectorAll('#ctrl-line-height button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === state.lineHeight);
    });
}

function updateNavButtons() {
    if (!state.novelInfo) return;
    const hasNext = state.epNo < state.novelInfo.total_episodes;
    const hasPrev = state.epNo > 1;
    els.btnNextEp.disabled = !hasNext;
    els.btnPrevEp.disabled = !hasPrev;
}



// --- Panels ---

function openSettings() {
    closeMenu();
    els.panelBackdrop.classList.add('active');
    els.settingsPanel.classList.add('active');
}

function openToc() {
    closeMenu();
    // Navigate to dedicated TOC page
    // Pass current ep to highlight it
    const url = `/toc.html?site=${state.siteType}&id=${state.novelId}&ep=${state.epNo}`;
    window.location.href = url;
}

function closeAllPanels() {
    els.settingsPanel.classList.remove('active');
    // els.tocPanel removed
    els.panelBackdrop.classList.remove('active');
}

function closeMenu() {
    els.menu.classList.remove('active');
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2000);
}
