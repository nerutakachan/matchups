// グローバル変数の初期化
let matchSnapshots = [];
let consecutiveCounts = {};
let matchHistory = new Map(); // 個人同士の対戦履歴（1人被りなどの判定用）
let exactMatchHistory = new Map(); // ★追加：全く同じ対戦カードの履歴
let totalCounts = {}; // ★追加：総出場回数

/**
 * 補助関数：チームの完全一致を判定するためのキーを作成
 * 例: [2,1] と [4,3] の対戦を "1,2 VS 3,4" という文字列にする
 */
function getMatchKey(t1, t2) {
  const str1 = [...t1].sort((a, b) => a - b).join(',');
  const str2 = [...t2].sort((a, b) => a - b).join(',');
  return [str1, str2].sort().join(' VS ');
}

/**
 * メインの生成ロジック
 */
function runGeneration(startM, totalMatches, activePlayers, soloPlayers, pairHistory, lastWaiting) {
  const resultArea = document.getElementById('resultArea');
  
  activePlayers.forEach(p => { 
    if (!(p in consecutiveCounts)) consecutiveCounts[p] = 0;
		if (!(p in totalCounts)) totalCounts[p] = 0;
  });

  for (let m = startM; m <= totalMatches; m++) {
    // 優先順位（1.前回休み > 2.普通 > 3. 2連投以上）
    let priorityPlayers = [...lastWaiting].filter(p => activePlayers.includes(p));
    let heavyPlayers = activePlayers.filter(p => consecutiveCounts[p] >= 2);
    let others = activePlayers.filter(p => !priorityPlayers.includes(p) && !heavyPlayers.includes(p));
    // 出場回数が少ない順に並べ、同じ回数の場合のみランダムにシャッフルする
		const fairSort = (a, b) => (totalCounts[a] - totalCounts[b]) || (Math.random() - 0.5);

		priorityPlayers.sort(fairSort);
		others.sort(fairSort);
		heavyPlayers.sort(fairSort);
    let pool = [...priorityPlayers, ...others, ...heavyPlayers];

    // --- 1. チーム作成フェーズ（ペア被りを防ぐ） ---
    const teams = [];
    const tempPool = [...pool];
    const skipped = []; 

    while (tempPool.length > 0) {
      const p1 = tempPool.shift();

      // ソロ希望
      if (soloPlayers.includes(p1)) {
        teams.push([p1]);
        continue;
      }

      // ペア希望
      let bestPartnerIndex = -1;
      let minPairCount = Infinity;
      const candidates = [];
      for (let i = 0; i < tempPool.length; i++) {
        if (!soloPlayers.includes(tempPool[i])) candidates.push(i);
      }

      if (candidates.length > 0) {
        // ペア候補もランダムに並べ替えて、同じ組み合わせを避ける
        candidates.sort(() => Math.random() - 0.5);
        for (const i of candidates) {
          const key = [p1, tempPool[i]].sort((a, b) => a - b).join('-');
          const count = pairHistory.get(key) || 0;
          if (count < minPairCount) {
            minPairCount = count;
            bestPartnerIndex = i;
          }
          if (minPairCount === 0) break; // 一度も組んでいない相手なら即決
        }
        
        const p2 = tempPool.splice(bestPartnerIndex, 1)[0];
        const newPair = [p1, p2];
        teams.push(newPair);
      } else {
        // ペア相手不在の場合は待機させる
        skipped.push(p1);
      }
    }
		// --- 2. チーム数に基づくコート数決定 ---
    const manualCourtLimit = parseInt(document.getElementById('courtLimitSelect').value);
    let courtLimit = Math.floor(teams.length / 2);

    if (manualCourtLimit > 0) {
      courtLimit = Math.min(courtLimit, manualCourtLimit);
    } else {
      // 自動の場合の制限
      const hasSolo = teams.some(t => t.length === 1);
      const limit = hasSolo ? 6 : 5;
      if (courtLimit > 3) courtLimit = 3;
      else if (teams.length <= limit && courtLimit > 2) courtLimit = 2;
    }

    // 参加枠からあぶれたチーム（連投者など）を強制待機に回す
    const playingTeamCount = courtLimit * 2;
    teams.splice(playingTeamCount);
    // --- 3. コート割り当て（完全一致の対戦を絶対に避ける） ---
    const courts = [];
    const usedPlayers = [];
    
    for (let c = 0; c < courtLimit; c++) {
      if (teams.length >= 2) {
        const t1 = teams.shift();
        
        let bestOpponentIndex = 0;
        let minScore = Infinity;

        // 対戦相手の候補をランダム化
				const oppCandidates = Array.from({ length: teams.length }, (_, i) => i);
				oppCandidates.sort(() => Math.random() - 0.5);

				// 【役割の分離】t1がソロ(1人)の場合、ペア(2人)が存在すれば候補をペアチームのみに絞り込む
				let targetCandidates = oppCandidates;
				if (t1.length === 1) {
						const pairCandidates = oppCandidates.filter(i => teams[i].length === 2);
						if (pairCandidates.length > 0) {
								targetCandidates = pairCandidates;
						}
				}

				// 絞り込まれた候補の中から、過去の対戦履歴スコアが最も低い相手を選出
				for (let i of targetCandidates) {
						let pVsPCount = 0;
						// 1. 個人同士の対戦回数をカウント（1人被りの判定用）
						t1.forEach(pA => {
								teams[i].forEach(pB => {
										const key = [pA, pB].sort((a, b) => a - b).join('v');
										pVsPCount += (matchHistory.get(key) || 0);
								});
						});

						// 2. 「全く同じ対戦カード」の回数をカウント
						const exactKey = getMatchKey(t1, teams[i]);
						const exactCount = exactMatchHistory.get(exactKey) || 0;
						
						// スコア計算（純粋な対戦履歴の 重み付けのみを行う）
						let score = pVsPCount + (exactCount * 100);

						if (score < minScore) {
								minScore = score;
								bestOpponentIndex = i;
						}
						if (minScore === 0) break;
				}
        const t2 = teams.splice(bestOpponentIndex, 1)[0];

        // ★出場の確定したペアのみペア履歴を加算
        if (t1.length === 2) {
          const k1 = t1.slice().sort((a, b) => a - b).join('-');
          pairHistory.set(k1, (pairHistory.get(k1) || 0) + 1);
        }
        if (t2.length === 2) {
          const k2 = t2.slice().sort((a, b) => a - b).join('-');
          pairHistory.set(k2, (pairHistory.get(k2) || 0) + 1);
        }

        // 対戦履歴の更新
        t1.forEach(pA => {
          t2.forEach(pB => {
            const key = [pA, pB].sort((a, b) => a - b).join('v');
            matchHistory.set(key, (matchHistory.get(key) || 0) + 1);
          });
        });
        
        // 全く同じ対戦カードの履歴も更新
        const exactKey = getMatchKey(t1, t2);
        exactMatchHistory.set(exactKey, (exactMatchHistory.get(exactKey) || 0) + 1);

        courts.push({ id: c + 1, t1, t2 });
        usedPlayers.push(...t1, ...t2);
      }
    }

    // --- 4. 状態の更新 ---
		activePlayers.forEach(p => {
			if (usedPlayers.includes(p)) {
				consecutiveCounts[p]++;
				totalCounts[p]++; // 追加
			} else {
				consecutiveCounts[p] = 0;
			}
		});

    const currentWaiting = activePlayers.filter(p => !usedPlayers.includes(p));
    renderMobileCard(m, courts, currentWaiting);
    lastWaiting = currentWaiting;

    // スナップショットの保存
    matchSnapshots.push({
      activePlayers: [...activePlayers],
      pairHistory: new Map(pairHistory),
      matchHistory: new Map(matchHistory),
      exactMatchHistory: new Map(exactMatchHistory), // 追記
			totalCounts: { ...totalCounts },
      lastWaiting: [...currentWaiting],
      consecutiveCounts: { ...consecutiveCounts }
    });
  }
}

/**
 * 補助関数：入力欄から数字を配列で取得
 */
function parsePlayerNumbers() {
	const checkboxes = document.querySelectorAll('input[name="soloPlayer"]:checked');
	return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

/**
 * 初回生成ボタン
 */
document.getElementById('generateBtn').addEventListener('click', () => {
	if (screen.orientation && screen.orientation.lock) {
		screen.orientation.lock('portrait').catch((e) => console.log('向き固定失敗:', e));
	}
	// スリープを防止
	if ('wakeLock' in navigator) {
		navigator.wakeLock.request('screen').catch((e) => console.log('スリープ防止失敗:', e));
	}
  const playerCount = parseInt(document.getElementById('playerCount').value);
  const matchCount = parseInt(document.getElementById('matchCount').value);
  const soloPlayers = parsePlayerNumbers('playernumber');

  if (isNaN(playerCount) || playerCount < 2) return alert('人数を正しく入力してください');

  document.getElementById('resultArea').innerHTML = '';
  matchSnapshots = [];
  consecutiveCounts = {};
  matchHistory = new Map();
  exactMatchHistory = new Map(); // リセット追加
	totalCounts = {};
  
  const activePlayers = Array.from({ length: playerCount }, (_, i) => i + 1);
  runGeneration(1, matchCount, activePlayers, soloPlayers, new Map(), []);
});

/**
 * 再計算ボタン
 */
document.getElementById('recalcBtn').addEventListener('click', () => {
  // 退席者をチェックボックスから取得
  const removeIds = parseReducePlayerNumbers();

  const matchCount = parseInt(document.getElementById('matchCount').value);
  const soloPlayers = parsePlayerNumbers();
  const cards = Array.from(document.querySelectorAll('.match-card'));
  const lastDoneIndex = cards.findLastIndex(card => card.classList.contains('is-done'));

  if (lastDoneIndex >= 0) {
    // 【完了試合がある場合】完了済みの最終試合の状態から再開
    const snap = matchSnapshots[lastDoneIndex];
    if (!snap) return;

    // 退席者を数値で判定して除外
    const newActivePlayers = snap.activePlayers.filter(p => !removeIds.includes(p));
    const newLastWaiting = snap.lastWaiting.filter(p => !removeIds.includes(p));

    // 状態と履歴の復元
    totalCounts = snap.totalCounts ? { ...snap.totalCounts } : {};
    consecutiveCounts = snap.consecutiveCounts ? { ...snap.consecutiveCounts } : {};
    matchHistory = new Map(snap.matchHistory);
    exactMatchHistory = new Map(snap.exactMatchHistory);

    // 未完了カードの削除とスナップショットの切り詰め
    for (let i = cards.length - 1; i > lastDoneIndex; i--) {
      cards[i].remove();
    }
    matchSnapshots = matchSnapshots.slice(0, lastDoneIndex + 1);

    // 残り試合の再生成
    const nextMatchNum = lastDoneIndex + 2;
    runGeneration(nextMatchNum, matchCount, newActivePlayers, soloPlayers, new Map(snap.pairHistory), newLastWaiting);
  } else {
    // 【完了試合が1つもない場合】第1試合から退席者を除外して再計算
    const playerCount = parseInt(document.getElementById('playerCount').value);
    if (isNaN(playerCount) || playerCount < 2) return alert('人数を正しく入力してください');

    const allPlayers = Array.from({ length: playerCount }, (_, i) => i + 1);
    const newActivePlayers = allPlayers.filter(p => !removeIds.includes(p));

    // 画面表示と各種履歴のリセット
    document.getElementById('resultArea').innerHTML = '';
    matchSnapshots = [];
    consecutiveCounts = {};
    totalCounts = {};
    matchHistory = new Map();
    exactMatchHistory = new Map();

    runGeneration(1, matchCount, newActivePlayers, soloPlayers, new Map(), []);
  }
});

/**
 * 描画関数
 */
function renderMobileCard(matchNum, courts, waiting) {
  const resultArea = document.getElementById('resultArea');
  const card = document.createElement('div');
  card.className = 'match-card';

  let courtsHtml = '';
  courts.forEach(c => {
    courtsHtml += `
      <div class="court-row">
        <div class="court-name">${c.id}コート</div>
        <div class="game-display">
          <div class="team">${c.t1.join(' - ')}</div>
          <div class="vs">VS</div>
          <div class="team">${c.t2.join(' - ')}</div>
        </div>
      </div>`;
  });

  card.innerHTML = `
		<div class="match-header">
			<span>第 ${matchNum} 試合</span>
			<button type="button" class="speak-btn" onclick="speakMatch(this)">音声</button>
			<label class="done-check">
				<input type="checkbox" onchange="this.closest('.match-card').classList.toggle('is-done')">終わったよん</label>
		</div>
		${courtsHtml}
		<div class="waiting-section">待機: ${waiting.length > 0 ? waiting.join(', ') : '全員出場中'}</div>`;
	resultArea.appendChild(card);
}

// 以下の関数を末尾に追加
function speakMatch(btn) {
	const card = btn.closest('.match-card');
	const rows = card.querySelectorAll('.court-row');
	let speechText = "";

	rows.forEach(row => {
		const courtName = row.querySelector('.court-name').innerText; // "1コート"
		const teams = row.querySelectorAll('.team');
		
		// チーム内の "-" を "、" に置換して読み上げやすくする
		const t1 = teams[0].innerText.replace(/-/g, '、'); 
		const t2 = teams[1].innerText.replace(/-/g, '、');

		// 「1コート、1、2、対、3、4」のように構築
		speechText += `${courtName}、${t1}、対するは、${t2}。`;
	});

	// 音声合成の実行
	const utterance = new SpeechSynthesisUtterance(speechText);
	utterance.lang = 'ja-JP';
	window.speechSynthesis.speak(utterance);
}
// --- ソロ参加者選択モーダル関連 ---
document.getElementById('openSoloModal').addEventListener('click', () => {
	const count = parseInt(document.getElementById('playerCount').value);
	if (isNaN(count)) return alert('まず参加人数を入力してください');
	
	// 現在のチェック状態を取得
	const checkedValues = parsePlayerNumbers();
	const options = document.getElementById('soloOptions');
	options.innerHTML = '';
	
	for (let i = 1; i <= count; i++) {
		const label = document.createElement('label');
		// 記憶していた値があれば checked を付与
		const isChecked = checkedValues.includes(i) ? 'checked' : '';
		label.innerHTML = `<input type="checkbox" name="soloPlayer" value="${i}" ${isChecked}> ${i}番`;
		options.appendChild(label);
	}
	document.getElementById('soloModal').style.display = 'block';
});

document.getElementById('closeSoloModal').addEventListener('click', () => {
	document.getElementById('soloModal').style.display = 'none';
});

/**
 * 補助関数：モーダルのチェックボックスからソロ参加者を取得
 */
function parsePlayerNumbers() {
	const checkboxes = document.querySelectorAll('input[name="soloPlayer"]:checked');
	return Array.from(checkboxes).map(cb => parseInt(cb.value));
}
document.getElementById('openConfigModal').addEventListener('click', () => {
  // モーダルを開く直前に選択肢を最新の人数状態に合わせて更新
  updateCourtLimitOptions();

  document.getElementById('configModal').style.display = 'block';
});

document.getElementById('closeConfigModal').addEventListener('click', () => {
	document.getElementById('configModal').style.display = 'none';
});
// --- 退席者選択モーダル関連（ソロ用と独立処理） ---
document.getElementById('openReduceModal').addEventListener('click', () => {
  const count = parseInt(document.getElementById('playerCount').value);
  if (isNaN(count)) return alert('まず参加人数を入力してください');

  // 選択済みの退席者チェック状態を取得
  const checkedValues = parseReducePlayerNumbers();
  const options = document.getElementById('reduceOptions');
  options.innerHTML = '';

  for (let i = 1; i <= count; i++) {
    const label = document.createElement('label');
    const isChecked = checkedValues.includes(i) ? 'checked' : '';
    label.innerHTML = `<input type="checkbox" name="reducePlayer" value="${i}" ${isChecked}> ${i}番`;
    options.appendChild(label);
  }

  document.getElementById('reduceModal').style.display = 'block';
});

document.getElementById('closeReduceModal').addEventListener('click', () => {
  document.getElementById('reduceModal').style.display = 'none';
});

/**
 * 補助関数：モーダルのチェックボックスから退席者プレイヤー番号を取得
 */
function parseReducePlayerNumbers() {
  const checkboxes = document.querySelectorAll('input[name="reducePlayer"]:checked');
  return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

/**
 * 現在の人数・ソロ・退席者数から、選択可能なコート数を制御する関数
 */
function updateCourtLimitOptions() {
  const playerCount = parseInt(document.getElementById('playerCount').value) || 0;
  const soloPlayers = parsePlayerNumbers();       // ソロ参加者の番号配列
  const removeIds = parseReducePlayerNumbers();   // 退席者の番号配列

  // 有効な参加者数（全体人数 - 退席者）
  const activeCount = Math.max(0, playerCount - removeIds.length);

  // 有効なソロプレイヤー数
  const activeSoloCount = soloPlayers.filter(p => p <= playerCount && !removeIds.includes(p)).length;
  
  // ペアを組むプレイヤー数
  const pairCount = Math.max(0, activeCount - activeSoloCount);

  // 作成可能なチーム数（ソロ数 + ペアチーム数）
  const teamsCount = activeSoloCount + Math.floor(pairCount / 2);

  // 作成可能な最大コート数（最低1面〜最大3面）
  const maxCourts = Math.min(3, Math.floor(teamsCount / 2));

  const select = document.getElementById('courtLimitSelect');
  const currentValue = parseInt(select.value, 10);

  // 各 <option> の有効/無効および表示/非表示を切り替え
  Array.from(select.options).forEach(opt => {
    const val = parseInt(opt.value, 10);
    if (val === 0) {
      // 「自動」は常に選択可能
      opt.disabled = false;
      opt.hidden = false;
    } else {
      if (val > maxCourts) {
        opt.disabled = true;
        opt.hidden = true; // モバイル環境等でリストから非表示化
      } else {
        opt.disabled = false;
        opt.hidden = false;
      }
    }
  });

  // もし現在選ばれているコート数が最大数を超えている場合、「自動(0)」に安全にリセット
  if (currentValue > maxCourts) {
    select.value = "0";
  }
}