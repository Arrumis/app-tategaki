
import { state, setState } from './home-state.js';
import * as api from '../utils/api.js';

// DOM Elements cache
const els = {
    listContainer: document.getElementById('novel-list'),
    tabsContainer: document.getElementById('list-tabs'),
    modal: document.getElementById('list-modal'),
    modalItems: document.getElementById('list-modal-items'),
    newListModal: document.getElementById('new-list-modal'),
    newListName: document.getElementById('new-list-name'),
    addNovelModal: document.getElementById('add-novel-modal'),
    addNovelUrl: document.getElementById('add-novel-url'),
    addNovelList: document.getElementById('add-novel-list'),
    cardMenuModal: document.getElementById('card-menu-modal'),
    homeTocPanel: document.getElementById('home-toc-panel'),
    homeTocList: document.getElementById('home-toc-list'),
    homePanelBackdrop: document.getElementById('home-panel-backdrop')
};

// --- Initialization ---

export async function initUI() {
    setupGlobalHandlers();

    // Theme
    const saved = localStorage.getItem('tategaki_settings');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme) document.body.setAttribute('data-theme', parsed.theme);
    }

    // Data Load
    await loadUserLists();
    await loadFavList();

    // Auto Reload on Focus (Sync across devices)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // console.log('[Home] Tab active, reloading list...');
            loadUserLists().catch(() => {});
            loadFavList().catch(() => {});
        }
    });

    // Auto Reload on Back/Forward Cache
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            // console.log('[Home] Restored from BFCache, reloading list...');
            loadUserLists().catch(() => {});
            loadFavList().catch(() => {});
        }
    });
}

function setupGlobalHandlers() {
    // Window functions for HTML onclick attributes
    // (Module scope is not global, so we must assign to window explicitly if we keep inline onclicks)
    window.closeListModal = closeListModal;
    window.closeNewListModal = closeNewListModal;
    window.submitNewList = submitNewList;
    window.openAddNovelModal = openAddNovelModal;
    window.closeAddNovelModal = closeAddNovelModal;
    window.submitAddNovel = submitAddNovel;
    window.closeCardMenuModal = closeCardMenuModal;
    window.openHomeToc = openHomeToc;
    window.closeHomeToc = closeHomeToc;
    window.switchToMoveList = switchToMoveList;
    window.deleteNovel = deleteNovel;
    window.pasteUrl = pasteUrl;
}

// --- Data Loading ---

async function pasteUrl() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            els.addNovelUrl.value = text;
        }
    } catch (e) {
        console.error('Paste failed:', e);
        els.addNovelUrl.focus();
        // Fallback: execCommand is deprecated but might work if readText fails in some contexts, 
        // though usually readText is better. If readText fails, it's often a permission issue.
        // Just focusing the input is a safe fallback so user can Ctrl+V.
    }
}

export async function loadUserLists() {
    try {
        const data = await api.get(`/api/users/${state.userId}/lists`);
        setState({ userLists: data.lists });

        // Validation
        if (state.listId !== 'default' && !data.lists.some(l => l.id === state.listId)) {
            setState({ listId: 'default' });
        }

        renderTabs();
    } catch (e) {
        console.error('List load error:', e);
    }
}

export async function loadFavList() {
    els.listContainer.innerHTML = '<p>読み込み中...</p>';
    try {
        const data = await api.get(`/api/favs/${state.listId}`);
        setState({ novels: data.novels });
        renderList();

        // Polling check
        if (data.novels.some(n => n.is_downloading)) {
            if (window._pollingId) clearTimeout(window._pollingId);
            window._pollingId = setTimeout(() => {
                if (document.visibilityState === 'visible') loadFavList();
            }, 5000);
        }
    } catch (e) {
        console.error(e);
        els.listContainer.innerHTML = '<p>リストの読み込みに失敗しました。</p>';
    }
}

// --- Rendering ---

function renderTabs() {
    els.tabsContainer.innerHTML = '';
    state.userLists.forEach(list => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${list.id === state.listId ? 'active' : ''}`;
        btn.textContent = list.name;
        btn.onclick = () => switchList(list.id);
        els.tabsContainer.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'tab-btn-add';
    addBtn.innerHTML = '<span class="material-symbols-rounded">add</span>';
    addBtn.title = '新しいリストを作成';
    addBtn.onclick = openNewListModal;
    els.tabsContainer.appendChild(addBtn);

    // Delete Button (Only for custom lists)
    if (state.listId !== 'default') {
        const delBtn = document.createElement('button');
        delBtn.className = 'tab-btn-add';
        delBtn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
        delBtn.title = 'このリストを削除';
        delBtn.style.marginLeft = '8px';
        delBtn.style.color = '#ff4081'; // Attention color
        delBtn.style.borderColor = '#ff4081';
        delBtn.onclick = deleteCurrentList;
        els.tabsContainer.appendChild(delBtn);
    }
}

function renderList() {
    const novels = state.novels;
    if (!novels || novels.length === 0) {
        els.listContainer.innerHTML = '<p style="color:var(--c-text);opacity:0.6;">このリストにはまだ小説がありません。</p>';
        return;
    }

    novels.sort((a, b) => new Date(b.last_update) - new Date(a.last_update));
    els.listContainer.innerHTML = '';

    novels.forEach(novel => {
        const card = createNovelCard(novel);
        els.listContainer.appendChild(card);
    });
}

function createNovelCard(novel) {
    const card = document.createElement('div');

    // Downloading State
    if (novel.is_downloading) {
        // [Debug] 状態確認用ログ
        console.log('[Debug] Card:', novel.title, 'is_downloading:', novel.is_downloading, 'total:', novel.total_episodes, 'type:', typeof novel.total_episodes);

        card.className = 'novel-card loading-card';
        const isReadable = (novel.total_episodes > 0);
        const displayTitle = (novel.title && novel.title !== 'ダウンロード中...') ? novel.title : 'ダウンロード中...';

        if (isReadable) {
            card.onclick = () => window.location.href = `/reader.html?site=${novel.site_type}&id=${novel.novel_id}&ep=1`;
            card.style.cursor = 'pointer';
        }

        card.innerHTML = `
            <div class="novel-info">
                <div class="novel-title" style="font-weight:bold; ${isReadable ? '' : 'opacity:0.75;'}">
                    <span class="material-symbols-rounded" style="vertical-align:middle; animation: spin 1s linear infinite; margin-right:4px; font-size:1.1em;">sync</span>
                    ${displayTitle}
                    ${isReadable ? '<span style="font-size:0.7em; font-weight:normal; opacity:0.8; margin-left:8px;">(読めます)</span>' : ''}
                </div>
                <div class="novel-author" style="font-size:0.75rem; opacity:0.6;">${novel.author || novel.novel_id}</div>
            </div>
            <div class="card-menu-btn" title="メニュー"><span class="material-symbols-rounded">more_vert</span></div>
        `;
    } else {
        // Normal State
        card.className = 'novel-card';
        let resumeUrl = `/reader.html?site=${novel.site_type}&id=${novel.novel_id}&ep=1`;
        let progressText = `未読`;
        let currentEp = 0;

        if (novel.history) {
            resumeUrl = `/reader.html?site=${novel.site_type}&id=${novel.novel_id}&ep=${novel.history.ep_no}&scroll=${novel.history.scroll_pos}`;
            currentEp = novel.history.ep_no;
            progressText = `${currentEp}/${novel.total_episodes}話 読書中`;
        } else if (novel.bookmark) {
            resumeUrl = `/reader.html?site=${novel.site_type}&id=${novel.novel_id}&ep=${novel.bookmark.ep_no}&scroll=${novel.bookmark.scroll_pos}`;
            currentEp = novel.bookmark.ep_no;
            progressText = `${currentEp}/${novel.total_episodes}話 読書中`;
        } else {
            progressText = `未読 (${novel.total_episodes}話)`;
        }

        card.onclick = () => window.location.href = resumeUrl;

        // Badge
        let newBadgeHtml = '';
        if ((novel.total_episodes || 0) > currentEp) {
            newBadgeHtml = `<div class="card-badge-new" title="未読があります">NEW</div>`;
        }

        const dateStr = new Date(novel.last_update).toLocaleDateString('ja-JP');

        // Bookmark Btn
        let bookmarkBtnHtml = '';
        if (novel.bookmark) {
            bookmarkBtnHtml = `
                <button class="card-bookmark-btn" title="栞の場所(${novel.bookmark.ep_no}話)から読む">
                    <span class="material-symbols-rounded">bookmark</span>
                    <span class="bookmark-label">栞 ${novel.bookmark.ep_no}</span>
                </button>`;
        }

        card.innerHTML = `
            ${newBadgeHtml}
            <div class="novel-info">
                <div class="novel-title">${novel.title}</div>
                <div class="novel-author">${novel.author}</div>
                <div class="novel-meta">
                    <span class="meta-progress">${progressText}</span>
                    <span class="meta-date">更新日 ${dateStr}</span>
                </div>
            </div>
            <div class="card-actions">${bookmarkBtnHtml}</div>
            <div class="card-menu-btn" title="メニュー"><span class="material-symbols-rounded">more_vert</span></div>
        `;

        const bmBtn = card.querySelector('.card-bookmark-btn');
        if (bmBtn) {
            bmBtn.onclick = (e) => {
                e.stopPropagation();
                window.location.href = `/reader.html?site=${novel.site_type}&id=${novel.novel_id}&ep=${novel.bookmark.ep_no}&scroll=${novel.bookmark.scroll_pos}`;
            };
        }
    }

    // Attach Menu Handler
    const menuBtn = card.querySelector('.card-menu-btn');
    if (menuBtn) {
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            openCardMenu(novel);
        };
    }

    return card;
}


// --- Actions ---

async function switchList(id) {
    if (state.listId === id) return;
    setState({ listId: id });
    await loadUserLists(); // Highlight update
    await loadFavList();
}

function openNewListModal() {
    els.newListName.value = '';
    els.newListModal.classList.add('active');
    setTimeout(() => els.newListName.focus(), 100);
}

function closeNewListModal() {
    els.newListModal.classList.remove('active');
}

async function submitNewList() {
    const name = els.newListName.value.trim();
    if (!name) return;
    try {
        const newList = await api.post(`/api/users/${state.userId}/lists`, { name });
        closeNewListModal();
        setState({ listId: newList.id });
        await loadUserLists();
        await loadFavList();
    } catch (e) {
        alert('リストの作成に失敗しました');
    }
}

async function deleteCurrentList() {
    const list = state.userLists.find(l => l.id === state.listId);
    if (!list) return;

    if (!confirm(`リスト「${list.name}」を削除しますか？\n登録されている小説はすべて「すべて」リストに移動されます。`)) {
        return;
    }

    try {
        await api.del(`/api/users/${state.userId}/lists/${list.id}`);
        alert('リストを削除しました');
        setState({ listId: 'default' });
        await loadUserLists();
        await loadFavList();
    } catch (e) {
        alert('リストの削除に失敗しました: ' + e.message);
    }
}

function openAddNovelModal() {
    els.addNovelList.innerHTML = '';
    state.userLists.forEach(list => {
        const opt = document.createElement('option');
        opt.value = list.id;
        opt.textContent = list.name;
        els.addNovelList.appendChild(opt);
    });
    els.addNovelList.value = state.listId !== 'default' ? state.listId : 'default';
    els.addNovelUrl.value = '';
    els.addNovelModal.classList.add('active');
    setTimeout(() => els.addNovelUrl.focus(), 100);
}

function closeAddNovelModal() {
    els.addNovelModal.classList.remove('active');
}

async function submitAddNovel() {
    const url = els.addNovelUrl.value.trim();
    const listId = els.addNovelList.value;
    if (!url) return;

    const btn = els.addNovelModal.querySelector('.modal-btn.primary');
    btn.disabled = true;

    try {
        const data = await api.post('/api/crawl', { url, listId });
        closeAddNovelModal();

        // 即座にダミーカード追加 & リロード設定
        if (state.listId === listId || state.listId === 'default') {
            // 簡易的にローディングカードを追加するか、リロードを待つ
            // createNovelCardを再利用するために単純にリロードをキック
            els.listContainer.innerHTML = '<p>登録中...</p>';
            setTimeout(loadFavList, 500);
        }
        alert('ダウンロードを開始しました。\n完了まで数分かかる場合があります。');
    } catch (e) {
        alert('追加に失敗しました: ' + e.message);
    } finally {
        btn.disabled = false;
    }
}

// --- Menu Actions ---

function openCardMenu(novel) {
    setState({ targetNovel: novel });
    els.cardMenuModal.classList.add('active');
}

function closeCardMenuModal() {
    els.cardMenuModal.classList.remove('active');
}

async function deleteNovel() {
    const novel = state.targetNovel;
    if (!novel) return;

    const ok = confirm(`「${novel.title || 'この小説'}」を削除しますか？\nDLデータは残りますが、リストからは削除されます。`);
    if (!ok) return;

    try {
        let listId = state.listId;
        if (listId === 'default') listId = novel._sourceListId || 'default';

        await api.del(`/api/users/${state.userId}/lists/${listId}/novels/${novel.novel_id}`);
        closeCardMenuModal();
        await loadFavList();
    } catch (e) {
        alert(`削除に失敗しました: ${e.message}`);
    }
}

function switchToMoveList() {
    closeCardMenuModal();
    if (state.targetNovel) openListModal(state.targetNovel);
}

// --- Move Modal ---

function openListModal(novel) {
    setState({ targetNovel: novel });
    els.modalItems.innerHTML = '';
    state.userLists.forEach(list => {
        const item = document.createElement('div');
        item.className = 'list-select-item';
        if (state.listId !== 'default' && list.id === state.listId) {
            item.setAttribute('data-selected', 'true');
        }
        item.textContent = list.name;
        item.onclick = () => moveNovelToList(list.id);
        els.modalItems.appendChild(item);
    });
    els.modal.classList.add('active');
}

function closeListModal() {
    els.modal.classList.remove('active');
    setState({ targetNovel: null });
}

async function moveNovelToList(targetListId) {
    const novel = state.targetNovel;
    if (!novel) return;

    let sourceId = state.listId;
    if (sourceId === 'default' && novel._sourceListId) sourceId = novel._sourceListId;

    if (targetListId === sourceId) {
        closeListModal();
        return;
    }

    try {
        await api.post(`/api/users/${state.userId}/lists/${targetListId}/novels`, {
            novelData: novel,
            sourceListId: sourceId
        });
        closeListModal();
        await loadFavList();
    } catch (e) {
        alert('移動に失敗しました');
    }
}

// --- TOC Modal ---

async function openHomeToc() {
    const novel = state.targetNovel;
    if (!novel) return;
    closeCardMenuModal();

    els.homeTocList.innerHTML = '<p style="padding:20px;">読み込み中...</p>';
    els.homePanelBackdrop.classList.add('active');
    els.homeTocPanel.classList.add('active');

    try {
        const info = await api.get(`/api/novels/${novel.site_type}/${novel.novel_id}/info`);
        let html = '';
        if (info.chapters) {
            info.chapters.forEach(ch => {
                if (ch.chapter_title) {
                    html += `<div style="padding:8px 0; font-weight:bold; font-size:0.9rem; opacity:0.75; margin-top:8px;">${ch.chapter_title}</div>`;
                }
                ch.episodes.forEach(ep => {
                    html += `<div class="toc-item" onclick="location.href='/reader.html?site=${info.site_type}&id=${info.novel_id}&ep=${ep.ep_no}'">第${ep.ep_no}話 ${ep.ep_title}</div>`;
                });
            });
        }
        els.homeTocList.innerHTML = html || '<p>目次情報がありません</p>';
    } catch (e) {
        els.homeTocList.innerHTML = '<p>読み込み失敗</p>';
    }
}

function closeHomeToc() {
    els.homeTocPanel.classList.remove('active');
    els.homePanelBackdrop.classList.remove('active');
    setState({ targetNovel: null });
}
