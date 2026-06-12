
/**
 * Viewer Core Logic
 * (Data loading, Style application, Rendering)
 */
import { state, setState } from './viewer-state.js';
import * as api from '../utils/api.js';

function getEls() {
    return {
        container: document.getElementById('viewer-container'),
        content: document.getElementById('novel-content')
    };
}

// --- 設定と表示形式 ---

export function loadSettings() {
    const saved = localStorage.getItem('tategaki_settings');
    if (saved) {
        const parsed = JSON.parse(saved);
        setState({
            fontSize: parsed.fontSize || 18,
            theme: parsed.theme || 'light',
            lineHeight: parsed.lineHeight || 'normal'
        });
    }
    applyStyle();
}

export function saveSettings() {
    localStorage.setItem('tategaki_settings', JSON.stringify({
        fontSize: state.fontSize,
        theme: state.theme,
        lineHeight: state.lineHeight
    }));
}

export function applyStyle() {
    document.body.setAttribute('data-theme', state.theme);
    // 表示形式の反映:
    getEls().container.style.fontSize = `${state.fontSize}px`;

    // 行間と余白の対応表
    const spacing = {
        tight: { lh: 1.6, ps: '1.0em' },
        normal: { lh: 1.8, ps: '1.5em' },
        relaxed: { lh: 2.1, ps: '2.0em' },
        loose: { lh: 2.4, ps: '2.5em' }
    };
    const s = spacing[state.lineHeight] || spacing.normal;

    document.documentElement.style.setProperty('--viewer-line-height', s.lh);
    document.documentElement.style.setProperty('--viewer-paragraph-spacing', s.ps);
}

// --- データ読み込み ---

export async function loadNovelInfo() {
    try {
        const info = await api.get(`/api/novels/${state.siteType}/${state.novelId}/info`);
        setState({ novelInfo: info });
        return info;
    } catch (e) {
        console.warn('Novel info load failed', e);
        return null;
    }
}

export async function loadEpisode(initialScrollPos = 0) {
    const els = getEls();
    els.content.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const data = await api.get(`/api/novels/${state.siteType}/${state.novelId}/ep/${state.epNo}`);
        setState({ currentEpTitle: data.ep_title });

        renderEpisode(data);

        // 画像の読み込み待ち
        await waitForImages();

        // スクロール位置を復元
        requestAnimationFrame(() => {
            getEls().container.scrollLeft = (initialScrollPos !== 0) ? initialScrollPos : 0;
        });

    } catch (e) {
        console.error(e);
        getEls().content.innerHTML = '<p class="error">本文の読み込みに失敗しました。</p>';
        throw e;
    }
}

function renderEpisode(data) {
    let html = `<h2 class="ep-title">${data.ep_title}</h2>`;
    let content = data.content;

    // 画像パスの置き換え
    if (data.local_images) {
        data.local_images.forEach(img => {
            const apiPath = `/api/novels/${state.siteType}/${state.novelId}/${img.local}`;
            content = content.split(img.original).join(apiPath);
        });
    }

    html += `<div class="ep-body">${content}</div>`;
    getEls().content.innerHTML = html;
}

function getSourceUrl(info) {
    if (info && info.url) return info.url;
    if (state.siteType === 'narou') return `https://ncode.syosetu.com/${state.novelId}/`;
    if (state.siteType === 'kakuyomu') return `https://kakuyomu.jp/works/${state.novelId}`;
    return null;
}

function getSourceLabel(info) {
    const siteType = info?.site_type || state.siteType;
    if (siteType === 'narou') return '小説家になろう';
    if (siteType === 'kakuyomu') return 'カクヨム';
    return '元サイト';
}

export function updateLatestSourceLink() {
    const els = getEls();
    els.content.querySelector('.latest-source-link-panel')?.remove();

    if (!state.novelInfo || state.epNo !== Number(state.novelInfo.total_episodes)) return;

    const url = getSourceUrl(state.novelInfo);
    if (!url) return;

    const panel = document.createElement('div');
    panel.className = 'latest-source-link-panel';

    const label = document.createElement('span');
    label.className = 'latest-source-link-label';
    label.textContent = '最新話まで読みました';

    const link = document.createElement('a');
    link.className = 'latest-source-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${getSourceLabel(state.novelInfo)}で開く`;

    const icon = document.createElement('span');
    icon.className = 'material-symbols-rounded';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'open_in_new';
    link.appendChild(icon);

    panel.append(label, link);
    els.content.appendChild(panel);
}

function waitForImages() {
    const images = getEls().content.querySelectorAll('img');
    const promises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    });
    // 2秒でタイムアウト
    const timeout = new Promise(resolve => setTimeout(resolve, 2000));
    return Promise.race([Promise.all(promises), timeout]);
}

// --- 履歴としおり ---

export function saveHistory(scrollLeft) {
    if (!state.novelId) return;

    // 連続保存抑制は画面側またはここで扱う。
    // ここでは単純に呼び出す。
    api.post(`/api/novels/${state.siteType}/${state.novelId}/history`, {
        listId: 'default',
        epNo: state.epNo,
        epTitle: state.currentEpTitle || '',
        scrollPos: scrollLeft
    }, { keepalive: true }).catch(err => console.warn('History save error', err));
}

export async function saveBookmark(scrollLeft) {
    if (!state.novelId) throw new Error('No novel ID');

    await api.post(`/api/novels/${state.siteType}/${state.novelId}/bookmark`, {
        listId: 'default',
        epNo: state.epNo,
        epTitle: state.currentEpTitle || '',
        scrollPos: scrollLeft
    });
}
