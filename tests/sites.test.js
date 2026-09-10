import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { detectSiteAndId } from '../src/crawler/manager.js';
import * as nocturne from '../src/crawler/sites/nocturne.js';
import * as narou from '../src/crawler/sites/narou.js';

test('作品URLの識別と偽装ホストの拒否', () => {
    for (const [host, siteType] of [['novel18.syosetu.com', 'nocturne'], ['ncode.syosetu.com', 'narou']]) {
        assert.deepEqual(detectSiteAndId(`https://${host}/N1234AB/2/?p=1`), { siteType, novelId: 'n1234ab' });
    }
    assert.deepEqual(detectSiteAndId('https://kakuyomu.jp/works/123/episodes/456'), { siteType: 'kakuyomu', novelId: '123' });
    for (const url of ['https://novel18.syosetu.com/', 'https://novel18.syosetu.com.evil.test/n1234ab/', 'https://evil.test/works/123', 'ftp://novel18.syosetu.com/n1234ab/']) {
        assert.throws(() => detectSiteAndId(url));
    }
});

test('R18のAPIを使用し、障害時はページ取得へ委ねる', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async url => {
            assert.equal(new URL(url).pathname, '/novel18api/api/');
            return { ok: true, json: async () => [{ allcount: 1 }, { title: '検証作品', writer: '検証作者', general_all_no: 2 }] };
        };
        assert.equal((await nocturne.checkInfoLowCost('n1234ab')).total_episodes, 2);
        globalThis.fetch = async () => { throw new Error('検証用の通信エラー'); };
        assert.equal(await nocturne.checkInfoViaApi('n1234ab'), null);
    } finally {
        globalThis.fetch = original;
    }
});

test('年齢確認、目次の複数ページ、本文、短編、全年齢版の互換性', async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const header = '<meta charset="utf-8"><h1 class="p-novel__title">検証作品</h1><div class="p-novel__author"><a>検証作者</a></div><div id="novel_ex">検証あらすじ</div>';
    try {
        for (const scraper of [nocturne, narou]) {
            const page = await browser.newPage();
            let ageChecks = 0;
            await page.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (scraper === nocturne && !(route.request().headers().cookie || '').includes('over18=yes')) {
                    ageChecks++;
                    return route.fulfill({ contentType: 'text/html', body: `<a id="yes18" data-url="${url}" href="${url}" onclick="document.cookie='over18=yes; path=/'">入場</a>` });
                }
                if (url.pathname === '/n1234ab/1/') return route.fulfill({ contentType: 'text/html', body: header + '<div id="novel_honbun">検証本文<ruby>漢字<rt>かんじ</rt></ruby></div>' });
                if (url.pathname === '/n9999ab/1/') return route.fulfill({ status: 404, body: '作品がありません' });
                if (url.pathname === '/n9999ab/') return route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><h1 class="p-novel__title">短編</h1><div class="p-novel__author">検証作者</div><div id="novel_honbun">短編の検証本文</div>' });
                const ep = url.searchParams.has('p') ? 2 : 1;
                return route.fulfill({ contentType: 'text/html', body: header + `<div class="p-eplist"><div class="p-eplist__sublist"><a href="/n1234ab/${ep}/">第${ep}話</a><span class="p-eplist__update">2026/09/10</span></div></div>` + (ep === 1 ? '<a class="c-pager__item--next" href="?p=2">次へ</a>' : '') });
            });
            const info = await scraper.getNovelInfo(page, 'n1234ab');
            assert.equal(info.site_type, scraper.siteType);
            assert.equal(info.total_episodes, 2);
            assert.deepEqual(info.chapters.flatMap(c => c.episodes.map(e => e.ep_no)), [1, 2]);
            assert.match((await scraper.getEpisodeContent(page, 'n1234ab', 1)).content, /<ruby>/);
            const short = await scraper.getNovelInfo(page, 'n9999ab');
            assert.equal(short.site_type, scraper.siteType);
            assert.equal(short.novel_id, 'n9999ab');
            assert.equal(short.total_episodes, 1);
            assert.match((await scraper.getEpisodeContent(page, 'n9999ab', 1)).content, /短編の検証本文/);
            assert.equal(ageChecks, scraper === nocturne ? 1 : 0);
            await page.close();
        }
    } finally {
        await browser.close();
    }
});
