import * as api from './utils/api.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Theme Loading
    const saved = localStorage.getItem('tategaki_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.theme) document.body.setAttribute('data-theme', parsed.theme);
        } catch (e) { }
    }

    const params = new URLSearchParams(window.location.search);
    const siteType = params.get('site');
    const novelId = params.get('id');
    const currentEp = params.get('ep'); // 未読位置に戻るための現在ep

    if (!novelId || !siteType) {
        showError('URLパラメータが不足しています。');
        return;
    }

    // Back Button Logic
    const btnBack = document.getElementById('btn-back');
    btnBack.onclick = () => {
        if (currentEp) {
            // 特定のエピソードに戻る
            location.href = `/reader.html?site=${siteType}&id=${novelId}&ep=${currentEp}`;
        } else {
            // 履歴、またはホームへ
            if (document.referrer && document.referrer.includes('/reader.html')) {
                history.back();
            } else {
                location.href = '/';
            }
        }
    };

    try {
        const info = await api.get(`/api/novels/${siteType}/${novelId}/info`);
        renderToc(info, currentEp);
    } catch (e) {
        console.error(e);
        showError('目次情報の取得に失敗しました。');
    }
});

function renderToc(info, currentEpVal) {
    const currentEp = parseInt(currentEpVal || '0', 10);

    // Header Info
    document.getElementById('header-title').textContent = info.title;
    document.getElementById('novel-title').textContent = info.title;
    document.getElementById('novel-author').textContent = `作者: ${info.author || '不明'}`;

    const list = document.getElementById('toc-list');
    list.innerHTML = '';

    if (!info.chapters || info.chapters.length === 0) {
        list.innerHTML = '<p style="padding:20px; text-align:center;">目次がありません</p>';
    } else {
        info.chapters.forEach(ch => {
            // Chapter Title
            if (ch.chapter_title && ch.chapter_title !== '本編') {
                const h3 = document.createElement('div');
                h3.className = 'chapter-title';
                h3.textContent = ch.chapter_title;
                list.appendChild(h3);
            } else if (ch.chapter_title === '本編' && info.chapters.length > 1) {
                // 複数章ある場合のみ「本編」も出すか、あるいは出さないか。
                // 通常は出さなくて良いが、構造が混在する場合は出したほうがいいかも。
                // ここではシンプルに出す。
                const h3 = document.createElement('div');
                h3.className = 'chapter-title';
                h3.textContent = ch.chapter_title;
                list.appendChild(h3);
            }

            // Episodes
            ch.episodes.forEach(ep => {
                const item = document.createElement('div');
                item.className = 'toc-item';
                item.style.display = 'flex';
                item.style.justifyContent = 'space-between';
                item.style.alignItems = 'baseline';
                item.style.gap = '8px';

                if (ep.ep_no === currentEp) {
                    item.className += ' current';
                    // item.scrollIntoView will be called later
                }

                // Content
                const titleSpan = document.createElement('span');
                titleSpan.textContent = `第${ep.ep_no}話 ${ep.ep_title}`;
                item.appendChild(titleSpan);

                // Date
                if (ep.post_date) {
                    const dateSpan = document.createElement('span');
                    dateSpan.style.fontSize = '0.75em';
                    dateSpan.style.opacity = '0.6';
                    dateSpan.style.flexShrink = '0';

                    let dateText = ep.post_date;
                    // Check if it's a valid date string (e.g. ISO format or standard date)
                    // Custom strings like "2026/01/19 10:08 （改）" might fail Date.parse, so keep them as is.
                    const d = new Date(ep.post_date);
                    if (!isNaN(d.getTime()) && !ep.post_date.includes('（')) {
                        // Valid date & simple string -> Format it
                        dateText = d.toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    }

                    dateSpan.textContent = dateText;
                    item.appendChild(dateSpan);
                }

                item.onclick = () => {
                    location.href = `/reader.html?site=${info.site_type}&id=${info.novel_id}&ep=${ep.ep_no}`;
                };

                list.appendChild(item);
            });
        });
    }

    // Show Content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').classList.remove('hidden');

    // Scroll to Current
    setTimeout(() => {
        const curr = document.querySelector('.toc-item.current');
        if (curr) {
            curr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, 100);
}

function showError(msg) {
    const el = document.getElementById('loading');
    el.innerHTML = `<p style="color:red; text-align:center;">${msg}</p>`;
}
