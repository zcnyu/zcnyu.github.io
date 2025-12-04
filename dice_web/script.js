// サイコロアプリのメインスクリプト
// - 6面の文字を設定
// - ローカルストレージに永続化
// - ふると疑似ランダムにアニメーション

(function () {
  'use strict';

  /** デフォルトの6面 */
  const DEFAULT_FACES = ['1', '2', '3', '4', '5', '6'];
  /** ローカルストレージキー */
  const STORAGE_KEY = 'dice_web_faces_v1';

  /** 要素参照 */
  const form = document.getElementById('faces-form');
  const inputs = /** @type {HTMLInputElement[]} */ ([
    form.querySelector('input[name="f1"]'),
    form.querySelector('input[name="f2"]'),
    form.querySelector('input[name="f3"]'),
    form.querySelector('input[name="f4"]'),
    form.querySelector('input[name="f5"]'),
    form.querySelector('input[name="f6"]'),
  ]);
  const cubeEl = document.getElementById('cube');
  const faceEls = Array.from(cubeEl.querySelectorAll('.face'));
  const rollBtn = document.getElementById('roll-btn');
  const resetBtn = document.getElementById('reset-btn');
  const liveEl = document.getElementById('result-live');

  /**
   * facesの読み書きユーティリティ
   */
  const storage = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 6) {
          // すべて文字列化
          return parsed.map((v) => (v ?? '').toString());
        }
      } catch (_) {}
      return null;
    },
    save(faces) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(faces));
      } catch (_) {}
    },
    reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    },
  };

  /** 現在のfaces（空欄はデフォルト値へフォールバック） */
  const getFaces = () => inputs.map((i, idx) => (i.value.trim() || DEFAULT_FACES[idx]));

  /** 入力欄にfacesを反映 */
  const setFacesToInputs = (faces) => {
    inputs.forEach((i, idx) => {
      i.value = faces[idx] ?? '';
    });
  };

  // 初期化: 保存値 or デフォルト
  const saved = storage.load();
  setFacesToInputs(saved ?? DEFAULT_FACES);

  // 3Dキューブ面へ文字を反映
  const syncFacesToCube = (faces) => {
    faceEls.forEach((el) => {
      const idx = Number(el.getAttribute('data-index')) || 0;
      const label = el.querySelector('.label');
      if (label) label.textContent = faces[idx];
    });
    // live領域は結果確定時にのみ更新する
    // テキスト更新後にリサイズ
    requestAnimationFrame(resizeAllLabels);
  };
  syncFacesToCube(getFaces());

  // 入力変更で保存
  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      const faces = getFaces();
      storage.save(faces);
      syncFacesToCube(faces);
    });
  });

  // デフォルトに戻す
  resetBtn.addEventListener('click', () => {
    setFacesToInputs(DEFAULT_FACES);
    storage.save(DEFAULT_FACES);
    syncFacesToCube(DEFAULT_FACES);
    liveEl.textContent = '?';
  });

  // ロール中フラグと累積回転（常に変化させてCSSトランジションを発火）
  let rolling = false;
  let spinX = 0;
  let spinY = 0;

  // 目に対応する向き（前面に表示されるように）
  // index: 0..5 -> front, right, back, left, top, bottom
  const orientationForIndex = (idx) => {
    switch (idx) {
      case 0: return { rx: 0, ry: 0 };          // front
      case 1: return { rx: 0, ry: -90 };        // right -> 前に出すにはYを-90回転
      case 2: return { rx: 0, ry: 180 };        // back
      case 3: return { rx: 0, ry: 90 };         // left
      case 4: return { rx: -90, ry: 0 };        // top -> 上を前に出すにはXを-90
      case 5: return { rx: 90, ry: 0 };         // bottom -> 下を前に出すにはXを90
      default: return { rx: 0, ry: 0 };
    }
  };

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // サイコロをふる（3D回転）
  rollBtn.addEventListener('click', () => {
    if (rolling) return;
    const faces = getFaces();
    const final = Math.floor(Math.random() * 6);
    const base = orientationForIndex(final);

    // ランダムに追加の回転（360度刻み）
    const addX = prefersReduced ? 0 : 360 * (1 + Math.floor(Math.random() * 2)); // 360 or 720
    const addY = prefersReduced ? 0 : 360 * (1 + Math.floor(Math.random() * 2));
    spinX += addX;
    spinY += addY;

    const rx = base.rx + spinX;
    const ry = base.ry + spinY;

    rolling = true;
    rollBtn.disabled = true;
    // 直前の結果表示をクリア（?のみを残す）
    faceEls.forEach((el) => el.classList.remove('is-result'));
    cubeEl.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

    const onDone = () => {
      cubeEl.removeEventListener('transitionend', onDone);
      rolling = false;
      rollBtn.disabled = false;
      // 最終結果をライブ領域に通知
      liveEl.textContent = faces[final];
      // 決定面のみ赤色表示
      const win = faceEls.find((el) => Number(el.getAttribute('data-index')) === final);
      if (win) win.classList.add('is-result');
      // 念のため再フィット（サイズ変更が起きた場合）
      resizeAllLabels();
    };
    cubeEl.addEventListener('transitionend', onDone);
  });

  // ラベルの自動フィット（1行で収める）
  function fitLabelToWidth(labelEl, minPx = 16, maxPx = 480, ratio = 0.8) {
    const face = labelEl.closest('.face');
    if (!face) return;
    const cs = getComputedStyle(face);
    const paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const available = face.clientWidth - paddingX;
    if (available <= 0) return;

    const target = available * ratio; // 横幅の約80%に調整
    // 二分探索で最大フォントサイズを求める
    let lo = minPx;
    let hi = Math.min(maxPx, Math.floor(available));
    let best = lo;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      labelEl.style.fontSize = mid + 'px';
      // scrollWidth で幅超過を判定（nowrap前提）
      const fits = labelEl.scrollWidth <= target;
      if (fits) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    labelEl.style.fontSize = best + 'px';
  }

  function resizeAllLabels() {
    const labels = cubeEl.querySelectorAll('.label');
    labels.forEach((l) => fitLabelToWidth(l));
  }

  // 初回・リサイズ時に実行
  resizeAllLabels();
  window.addEventListener('resize', () => {
    // リサイズ頻発を避けるためにアニメーションフレームでまとめる
    requestAnimationFrame(resizeAllLabels);
  });
})();
