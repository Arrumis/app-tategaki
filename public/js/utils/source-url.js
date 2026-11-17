// 対応サイトの ID から移動先を作り、不明な形式はリンクにしない。
export function getWorkSourceUrl(site, id) {
    const value = String(id || '');
    if ((site === 'narou' || site === 'nocturne') && /^n[0-9]+[a-z]+$/i.test(value)) {
        const host = site === 'narou' ? 'ncode.syosetu.com' : 'novel18.syosetu.com';
        return `https://${host}/${value}/`;
    }
    if (site === 'kakuyomu' && /^\d+$/.test(value)) return `https://kakuyomu.jp/works/${value}`;
    return null;
}

export function getEpisodeSourceUrl(site, id, epNo, info, data) {
    const base = getWorkSourceUrl(site, id);
    if (!base || !Number.isSafeInteger(Number(epNo)) || Number(epNo) < 1) return null;
    const episode = info?.chapters?.flatMap(ch => ch.episodes || []).find(ep => Number(ep.ep_no) === Number(epNo));
    if (site === 'kakuyomu') {
        const episodeId = data?.episode_id || episode?.episode_id;
        return /^\d+$/.test(String(episodeId || '')) ? `${base}/episodes/${episodeId}` : null;
    }
    if (!info || !episode) return null;
    const shortStory = Number(info.total_episodes) === 1 && info.chapters?.length === 1 &&
        info.chapters[0].chapter_title === '本編' && episode.ep_title === info.title;
    return shortStory ? base : `${base}${Number(epNo)}/`;
}
