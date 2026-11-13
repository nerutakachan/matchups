// ====================================================
// リアルタイム同期専用処理 (sync.js) - 自動スライド追従版
// ====================================================

// 1. 部屋IDの取得・自動生成
function getOrCreateRoomId() {
    const urlParams = new URLSearchParams(window.location.search);
    let roomId = urlParams.get('room');

    if (!roomId) {
        roomId = localStorage.getItem('my_matchup_room_id');
        if (!roomId) {
            roomId = 'room_' + Math.random().toString(36).substring(2, 8);
            localStorage.setItem('my_matchup_room_id', roomId);
        }
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + roomId;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    } else {
        localStorage.setItem('my_matchup_room_id', roomId);
    }
    return roomId;
}

const currentRoomId = getOrCreateRoomId();
let isReceiving = false;

// 2. サーバーへ最新表示（対戦表HTML）を送信
async function sendCurrentState() {
    if (isReceiving) return;

    const resultArea = document.getElementById('resultArea');
    if (!resultArea || !resultArea.innerHTML.trim()) return;

    // チェックボックスのチェック状態を保持
    const checkboxes = resultArea.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            cb.setAttribute('checked', 'checked');
        } else {
            cb.removeAttribute('checked');
        }
    });

    const payload = {
        html: resultArea.innerHTML,
        timestamp: Date.now()
    };

    try {
        await fetch(`save.php?room=${currentRoomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error('送信エラー:', err);
    }
}

// 操作ボタン・チェックボックスが押されたら送信
document.addEventListener('click', (e) => {
    if (e.target.closest('#generateBtn, #recalcBtn, #resetBtn, .done-check, input[type="checkbox"]')) {
        setTimeout(sendCurrentState, 300);
    }
});

document.addEventListener('change', (e) => {
    if (e.target.closest('#resultArea')) {
        sendCurrentState();
    }
});

// 3. 閲覧側：画面更新 ＋ 次の試合カードへ自動スライド
let lastLoadedTimestamp = 0;

async function checkAndSyncState() {
    try {
        const res = await fetch(`save.php?room=${currentRoomId}&t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data && data.timestamp && data.timestamp > lastLoadedTimestamp) {
            lastLoadedTimestamp = data.timestamp;
            const resultArea = document.getElementById('resultArea');
            if (resultArea && data.html) {
                isReceiving = true;
                resultArea.innerHTML = data.html;

                // 💡 閲覧者の画面も「まだ終わっていない次の試合カード」へ自動スライドさせる
                const nextActiveCard = resultArea.querySelector('.match-card:not(.is-done)');
                if (nextActiveCard) {
                    setTimeout(() => {
                        nextActiveCard.scrollIntoView({
                            behavior: 'smooth',
                            inline: 'center',
                            block: 'nearest'
                        });
                    }, 200);
                }

                setTimeout(() => { isReceiving = false; }, 500);
            }
        }
    } catch (err) {
        console.error('受信エラー:', err);
    }
}

// 初回取得 ＋ 2秒ごとの自動同期
checkAndSyncState();
setInterval(checkAndSyncState, 2000);

// 4. 共有ボタン
document.addEventListener('DOMContentLoaded', () => {
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert('共有URLをコピーしました！');
            } catch (err) {
                prompt('以下のURLをコピーして共有してください：', window.location.href);
            }
        });
    }
});