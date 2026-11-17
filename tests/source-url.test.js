import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getWorkSourceUrl, getEpisodeSourceUrl } from '../public/js/utils/source-url.js';

test('対応サイトの作品と各話の URL を生成する', () => {
    const serial = { title: '作品', total_episodes: 2, chapters: [{ chapter_title: '本編', episodes: [{ ep_no: 1, ep_title: '第一話' }] }] };
    const short = { title: '短編', total_episodes: 1, chapters: [{ chapter_title: '本編', episodes: [{ ep_no: 1, ep_title: '短編' }] }] };
    assert.equal(getWorkSourceUrl('narou', 'n1234ab'), 'https://ncode.syosetu.com/n1234ab/');
    assert.equal(getEpisodeSourceUrl('narou', 'n1234ab', 1, serial), 'https://ncode.syosetu.com/n1234ab/1/');
    assert.equal(getEpisodeSourceUrl('nocturne', 'n1234ab', 1, short), 'https://novel18.syosetu.com/n1234ab/');
    assert.equal(getEpisodeSourceUrl('kakuyomu', '123', 1, { chapters: [{ episodes: [{ ep_no: 1, episode_id: '456' }] }] }), 'https://kakuyomu.jp/works/123/episodes/456');
    assert.equal(getEpisodeSourceUrl('kakuyomu', '123', 1, null, { episode_id: '456' }), 'https://kakuyomu.jp/works/123/episodes/456');
    assert.equal(getEpisodeSourceUrl('kakuyomu', '123', 1, null), null);
    assert.equal(getWorkSourceUrl('narou', '../bad'), null);
});
