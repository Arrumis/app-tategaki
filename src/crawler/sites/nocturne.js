import * as narou from './narou.js';

export const siteType = 'nocturne';

// 年齢確認が表示された場合は公式の入場ボタンを使用する。
async function navigate(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const enter = page.locator('#yes18');
    if (await enter.count()) {
        const destination = new URL(await enter.getAttribute('data-url'));
        if (destination.origin !== 'https://novel18.syosetu.com') {
            throw new Error('年齢確認ページの移動先を確認できませんでした。');
        }
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            enter.click()
        ]);
    }
    if (new URL(page.url()).hostname !== 'novel18.syosetu.com' || await page.locator('#yes18').count()) {
        throw new Error('作品ページに移動できませんでした。年齢確認または公開状態を確認してください。');
    }
}

const options = { siteType, host: 'novel18.syosetu.com', apiPath: 'novel18api', navigate };

export const checkInfoViaApi = (novelId) => narou.checkInfoViaApi(novelId, options);
export const checkInfoLowCost = checkInfoViaApi;
export const getNovelInfo = (page, novelId) => narou.getNovelInfo(page, novelId, options);
export const getEpisodeContent = (page, novelId, epNo) => narou.getEpisodeContent(page, novelId, epNo, options);
