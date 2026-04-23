/**
 * 小説家になろう (narou) 用スクレイパー
 */

export const siteType = 'narou';

/**
 * 小説基本情報を取得
 * @param {import('playwright').Page} page 
 * @param {string} novelId 
 */
/**
 * 小説基本情報をAPI経由で確認する (更新チェック用)
 * @param {string} novelId
 * @returns {Promise<{total_episodes: number, last_update: string}|null>}
 */
export async function checkInfoViaApi(novelId) {
    try {
        // なろう小説API: https://dev.syosetu.com/man/api/
        // out=json: JSON形式
        // of=t-ga-nu-w: タイトル(t)+全掲載エピソード数(ga)+最終更新日時(nu)+作者(w)
        // lim=1: 1件のみ
        const url = `https://api.syosetu.com/novelapi/api/?out=json&of=t-ga-nu-w&ncode=${novelId}&lim=1`;

        // Custom User-Agent to be polite
        const headers = { 'User-Agent': 'TategakiCrawler/1.0' };

        const res = await fetch(url, { headers });
        if (!res.ok) {
            throw new Error(`API response not ok: ${res.status}`);
        }

        const data = await res.json();

        // 配列の1要素目はメタデータ(allcountなど)だが、lim=1なら [0]=allcount, [1]=novelData になるケースと
        // そのまま配列で返るケースがある。公式仕様では「最初の要素には全作品出力数が入り、以降一作品ずつ」
        // JSON出力例: [{allcount:1}, {title:..., ncode:...}]

        if (!Array.isArray(data) || data.length < 2) {
            console.warn(`[Narou-API] Invalid API response for ${novelId}`);
            return null;
        }

        const novelData = data[1]; // 実際の小説データは2要素目

        return {
            total_episodes: novelData.general_all_no,
            last_update: novelData.novelupdated_at, // YYYY-MM-DD HH:MM:SS
            // 念のためタイトルも返しておくとデバッグに便利
            title: novelData.title,
            author: novelData.writer
        };

    } catch (e) {
        console.warn(`[Narou-API] API check failed for ${novelId}:`, e.message);
        return null; // API失敗時はnullを返し、通常のブラウザ処理にフォールバックさせる
    }
}

// 共通インターフェース用エイリアス
export const checkInfoLowCost = checkInfoViaApi;

/**
 * 小説基本情報を取得 (ページネーション対応版)
 * @param {import('playwright').Page} page 
 * @param {string} novelId 
 */
export async function getNovelInfo(page, novelId) {
    const baseUrl = `https://ncode.syosetu.com/${novelId}/`;
    let currentUrl = baseUrl;

    // 基本情報は最初のページで取得
    await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
    const title = await page.locator('.p-novel__title').innerText();
    const author = await page.locator('.p-novel__author a').first().innerText().catch(() => page.locator('.p-novel__author').innerText());
    const synopsis = await page.locator('#novel_ex').innerHTML(); // HTMLのまま保存

    const chapters = [];
    let currentChapter = { chapter_title: '無題', episodes: [] };

    // ページネーション巡回ループ
    let pageCount = 1;
    let hasNextPage = true;

    while (hasNextPage) {
        console.log(`[Narou] Processing page ${pageCount}: ${currentUrl}`);
        if (pageCount > 1) { // 2ページ目以降は遷移が必要
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        }

        // DOM要素が安定するまで少し待つ
        await page.waitForSelector('.p-eplist', { timeout: 5000 }).catch(() => console.log('Log: .p-eplist not found (Short story?)'));

        const timelineNodes = await page.locator('.p-eplist > *').all();
        console.log(`Log: Found ${timelineNodes.length} list items on page ${pageCount}.`);

        const isShortStory = (pageCount === 1 && timelineNodes.length === 0);
        if (isShortStory) {
            console.log('Log: Detected as short story structure.');
            return {
                title, author, synopsis, siteType, novelId, url: baseUrl,
                total_episodes: 1,
                chapters: [{ chapter_title: '本編', episodes: [{ ep_no: 1, ep_title: title, post_date: new Date().toISOString() }] }]
            };
        }

        let epCountForFallback = 1; // 連番のフォールバック用（ページ跨ぎで本当は継続すべきだが、href解析を優先する）

        for (let i = 0; i < timelineNodes.length; i++) {
            const node = timelineNodes[i];
            const className = await node.getAttribute('class') || '';

            if (className.includes('p-eplist__chapter-title')) {
                // 新しい章の開始
                if (currentChapter.episodes.length > 0) {
                    chapters.push(currentChapter);
                }
                currentChapter = {
                    chapter_title: await node.innerText().then(t => t.trim()).catch(() => 'Unknown'),
                    episodes: []
                };
            } else if (className.includes('p-eplist__sublist')) {
                // エピソード行
                let link = node.locator('.p-eplist__subtitle a');
                if (await link.count() === 0) {
                    link = node.locator('a').first();
                }

                if (await link.count() === 0) {
                    continue;
                }

                const epTitle = await link.innerText();
                const path = await link.getAttribute('href'); // /n1234/1/

                let epNo = 0;
                if (path) {
                    const match = path.match(/\/(\d+)\/?$/);
                    // エピソードIDを絶対的な番号として信用する
                    if (match) epNo = parseInt(match[1], 10);
                }

                // epNoが取れなかった場合のフォールバックは、前回の最大値+1とかにしたいところだが、
                // なろうは必ずURLに番号が入るので、そこを信じる。
                if (epNo === 0) {
                    console.warn(`[Narou] Failed to parse epNo from path: ${path}`);
                    continue; // Skip invalid
                }

                const dateText = await node.locator('.p-eplist__update').innerText().catch(() => '');

                currentChapter.episodes.push({
                    ep_no: epNo,
                    ep_title: epTitle,
                    post_date: dateText.replace(/\n|改稿/g, '').trim()
                });
            }
        }

        // 次のページがあるか確認
        // .c-pager > a.c-pager__item--next
        const nextLink = page.locator('.c-pager__item--next').first();
        const count = await nextLink.count();
        if (count > 0) {
            const href = await nextLink.getAttribute('href');
            if (href) {
                // 相対パスの場合は絶対パスへ (例: ?p=2)
                currentUrl = new URL(href, baseUrl).toString();
                pageCount++;
            } else {
                hasNextPage = false;
            }
        } else {
            hasNextPage = false;
        }
    }

    // 最後の章を追加
    if (currentChapter.episodes.length > 0 || (chapters.length === 0 && !isShortStory)) {
        chapters.push(currentChapter);
    }

    // 章跨ぎなどで章タイトルが変わらないまま次ページに行く場合、
    // chapters配列の中で同じ章タイトルが連続してしまう可能性がある。
    // 必要ならマージ処理を入れるべきだが、表示上は分かれていても問題はない。
    // もし綺麗に見せたいならここで reduce を使ってマージする。

    // 簡単なマージ処理: 連続して同じ章タイトルなら結合する
    const mergedChapters = [];
    if (chapters.length > 0) {
        let prev = chapters[0];
        mergedChapters.push(prev);

        for (let i = 1; i < chapters.length; i++) {
            const curr = chapters[i];
            if (curr.chapter_title === prev.chapter_title) {
                // マージ
                prev.episodes = prev.episodes.concat(curr.episodes);
            } else {
                mergedChapters.push(curr);
                prev = curr;
            }
        }
    }

    // 総話数計算
    const totalEpisodes = mergedChapters.reduce((sum, ch) => sum + ch.episodes.length, 0);

    // 最終更新日時の特定
    let lastUpdateStr = new Date().toISOString();
    if (mergedChapters.length > 0) {
        const lastChap = mergedChapters[mergedChapters.length - 1];
        if (lastChap.episodes.length > 0) {
            const dateText = lastChap.episodes[lastChap.episodes.length - 1].post_date;
            try {
                const d = new Date(dateText);
                if (!isNaN(d.getTime())) {
                    lastUpdateStr = d.toISOString();
                }
            } catch (e) { console.warn('Date parse error', e); }
        }
    }

    return {
        title,
        author,
        synopsis,
        url: baseUrl,
        site_type: siteType,
        novel_id: novelId,
        total_episodes: totalEpisodes,
        last_checked: new Date().toISOString(),
        last_update: lastUpdateStr,
        chapters: mergedChapters
    };
}

/**
 * エピソード本文を取得
 * @param {import('playwright').Page} page 
 * @param {string} novelId 
 * @param {number} epNo 
 */
export async function getEpisodeContent(page, novelId, epNo) {
    const url = `https://ncode.syosetu.com/${novelId}/${epNo}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // 本文セレクタの候補 (PC: #novel_honbun, SP: #novel_view, その他)
    const contentSelector = '#novel_honbun, #novel_view, .js-novel-text, .p-novel__body';

    try {
        await page.waitForSelector(contentSelector, { timeout: 10000 });
    } catch (e) {
        // 最後の手段：IDダンプは一旦削除し、エラーだけ投げる（前回ログが出なかったので）
        console.error(`[Error] Content selector not found on ${url}`);
        throw e;
    }

    const epTitle = await page.locator('.p-novel__title').innerText().catch(() => 'No Title');
    // 一番最初に見つかったコンテンツ要素を使う
    const contentHtml = await page.locator(contentSelector).first().innerHTML();

    // 挿絵画像の抽出 (候補要素内のimgを探す)
    const imageUrls = [];
    const images = await page.locator(`${contentSelector} img`).all();
    for (const img of images) {
        const src = await img.getAttribute('src');
        if (src) imageUrls.push(src);
    }

    // 前書・後書 (SP版などはIDが違う可能性あり、今回はPC版IDのみトライ)
    let preface = '';
    let afterword = '';
    if (await page.locator('#novel_p').count() > 0) {
        preface = await page.locator('#novel_p').innerHTML();
    }
    if (await page.locator('#novel_a').count() > 0) {
        afterword = await page.locator('#novel_a').innerHTML();
    }

    return {
        novel_id: novelId,
        ep_no: epNo,
        ep_title: epTitle,
        content: contentHtml,
        preface,
        afterword,
        image_urls: imageUrls
    };
}
