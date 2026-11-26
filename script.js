(() => {
  "use strict";

  // ===== 게임 상태 =====
  const EMPTY = null;
  const PLAYER = "player";
  const COMPUTER = "computer";
  const TURN_LIMIT_MS = 10000; // 각 턴 10초 제한시간

  const state = {
    size: 5,               // 기본 5x5 게임판
    mode: "classic",       // "classic" (기본) | "capture" (포위전)
    difficulty: "normal",  // "easy" (쉬움) | "normal" (보통) | "hard" (어려움)
    board: [],             // 각 칸의 소유자 (null | "player" | "computer")
    firstPlayer: PLAYER,   // 매 게임 무작위 선공 ("player" | "computer")
    isStarted: false,      // 시작 버튼 클릭 여부 (대기 상태 구분)
    isPlayerTurn: true,
    isGameOver: false,
    lastMoveIndex: null,
    soundEnabled: true,
    cpuTimerId: null,
    turnIntervalId: null,
    turnDeadline: 0,
    lastTickSecond: null,
  };

  // ===== DOM 요소 =====
  const introScreenEl = document.getElementById("intro-screen");
  const enterGameBtn = document.getElementById("enter-game-btn");
  const homeBtn = document.getElementById("home-btn");
  const boardWrapperEl = document.querySelector(".board-wrapper");
  const boardEl = document.getElementById("game-board");
  const fxLayerEl = document.getElementById("fx-layer");
  const turnBannerEl = document.getElementById("turn-banner");
  const startOverlayEl = document.getElementById("board-start-overlay");
  const startOverlayDescEl = document.getElementById("start-overlay-desc");
  const startGameBtn = document.getElementById("start-game-btn");
  const playerScoreEl = document.getElementById("player-score");
  const computerScoreEl = document.getElementById("computer-score");
  const playerBreakdownEl = document.getElementById("player-breakdown");
  const computerBreakdownEl = document.getElementById("computer-breakdown");
  const playerOrderBadgeEl = document.getElementById("player-order-badge");
  const computerOrderBadgeEl = document.getElementById("computer-order-badge");
  const playerCardEl = document.getElementById("player-card");
  const computerCardEl = document.getElementById("computer-card");
  const playerBarEl = document.getElementById("player-bar");
  const computerBarEl = document.getElementById("computer-bar");
  const timerOwnerLabelEl = document.getElementById("timer-owner-label");
  const turnTimerTextEl = document.getElementById("turn-timer-text");
  const turnTimerBarEl = document.getElementById("turn-timer-bar");
  const timerTrackEl = document.querySelector(".timer-track");
  const statusMsgEl = document.getElementById("status-message");
  const remainingBadgeEl = document.getElementById("remaining-badge");
  const modeHintEl = document.getElementById("mode-hint");

  const restartBtn = document.getElementById("restart-btn");
  const soundToggleBtn = document.getElementById("sound-toggle");
  const sizeButtons = document.querySelectorAll("[data-size]");
  const modeButtons = document.querySelectorAll("[data-mode]");
  const difficultyButtons = document.querySelectorAll("[data-difficulty]");

  const resultModalEl = document.getElementById("result-modal");
  const resultEmojiEl = document.getElementById("result-emoji");
  const resultTitleEl = document.getElementById("result-title");
  const resultSubtitleEl = document.getElementById("result-subtitle");
  const finalPlayerLabelEl = document.getElementById("final-player-label");
  const finalComputerLabelEl = document.getElementById("final-computer-label");
  const finalPlayerScoreEl = document.getElementById("final-player-score");
  const finalComputerScoreEl = document.getElementById("final-computer-score");
  const finalPlayerDetailEl = document.getElementById("final-player-detail");
  const finalComputerDetailEl = document.getElementById("final-computer-detail");
  const modalRestartBtn = document.getElementById("modal-restart-btn");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  // ===== 간단한 Web Audio 효과음 =====
  let audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration = 0.11, type = "sine", volume = 0.12, delay = 0) {
    if (!state.soundEnabled) return;
    ensureAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  const sfx = {
    playerMove() {
      playTone(523.25, 0.09, "triangle", 0.14, 0);
      playTone(659.25, 0.11, "triangle", 0.12, 0.05);
    },
    cpuMove() {
      playTone(392.0, 0.09, "sine", 0.12, 0);
      playTone(329.63, 0.1, "sine", 0.1, 0.05);
    },
    capture() {
      playTone(783.99, 0.1, "triangle", 0.12, 0.04);
      playTone(1046.5, 0.14, "triangle", 0.12, 0.1);
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => {
        playTone(n, 0.18, "triangle", 0.14, i * 0.09);
      });
    },
    lose() {
      [392.0, 349.23, 311.13, 261.63].forEach((n, i) => {
        playTone(n, 0.2, "sine", 0.12, i * 0.1);
      });
    },
    draw() {
      [440, 523.25, 440].forEach((n, i) => {
        playTone(n, 0.15, "triangle", 0.12, i * 0.1);
      });
    },
    timeout() {
      playTone(280, 0.14, "sawtooth", 0.08, 0);
      playTone(220, 0.18, "sawtooth", 0.08, 0.12);
    },
    gameStart() {
      [440, 554.37, 659.25].forEach((n, i) => {
        playTone(n, 0.12, "triangle", 0.12, i * 0.07);
      });
    },
    tick() {
      playTone(880, 0.05, "sine", 0.07, 0);
    },
  };

  // ===== 승리 축하 폭죽 애니메이션 =====
  const confettiCanvas = document.getElementById("confetti-canvas");
  const ctx = confettiCanvas.getContext("2d");
  let confettiPieces = [];
  let confettiFrameId = null;

  function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }

  function launchConfetti() {
    resizeConfettiCanvas();
    const colors = ["#3b82f6", "#ff6b6b", "#fbbf24", "#10b981", "#a855f7", "#38bdf8"];
    confettiPieces = Array.from({ length: 85 }, () => ({
      x: Math.random() * confettiCanvas.width,
      y: -20 - Math.random() * 140,
      w: 7 + Math.random() * 6,
      h: 10 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 4,
      vy: 2.8 + Math.random() * 4.2,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.22,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
    }));

    if (confettiFrameId) cancelAnimationFrame(confettiFrameId);
    animateConfetti();
  }

  function animateConfetti() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    let alive = 0;

    for (const p of confettiPieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.vRot;
      if (p.y > confettiCanvas.height * 0.72) {
        p.alpha = Math.max(0, p.alpha - 0.025);
      }

      if (p.alpha > 0 && p.y < confettiCanvas.height + 30) {
        alive++;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }

    if (alive > 0) {
      confettiFrameId = requestAnimationFrame(animateConfetti);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confettiFrameId = null;
    }
  }

  function clearConfetti() {
    if (confettiFrameId) {
      cancelAnimationFrame(confettiFrameId);
      confettiFrameId = null;
    }
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }

  // ===== 시각 효과 (파티클 · 리플 · 플로팅 텍스트 · 보드 흔들림 · 배너) =====
  function clearFxLayer() {
    if (fxLayerEl) fxLayerEl.innerHTML = "";
  }

  function triggerBoardShake() {
    if (!boardWrapperEl) return;
    boardWrapperEl.classList.remove("shake");
    void boardWrapperEl.offsetWidth;
    boardWrapperEl.classList.add("shake");
  }

  function showTurnBanner(text, ownerType) {
    if (!turnBannerEl) return;
    turnBannerEl.textContent = text;
    turnBannerEl.className = `turn-banner ${ownerType === PLAYER ? "player-banner" : "cpu-banner"}`;
    void turnBannerEl.offsetWidth;
    turnBannerEl.classList.add("show");
  }

  function spawnTileEffects(index, owner, capturedCount, clusterGrew) {
    if (!fxLayerEl) return;
    const cellEl = boardEl.children[index];
    if (!cellEl) return;

    const layerRect = fxLayerEl.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    const cx = cellRect.left - layerRect.left + cellRect.width / 2;
    const cy = cellRect.top - layerRect.top + cellRect.height / 2;

    // 1. 퍼지는 리플 링
    const ripple = document.createElement("span");
    ripple.className = `fx-ripple ${owner}`;
    ripple.style.left = `${cx}px`;
    ripple.style.top = `${cy}px`;
    fxLayerEl.appendChild(ripple);
    setTimeout(() => ripple.remove(), 560);

    // 2. 타일 색상 파티클 버스트
    const palette =
      owner === PLAYER
        ? ["#3b82f6", "#60a5fa", "#93c5fd", "#fde047"]
        : ["#f97316", "#fb923c", "#fdba74", "#fde047"];
    const particleCount = capturedCount > 0 ? 14 : 9;

    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement("span");
      p.className = "fx-particle";
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
      const dist = 26 + Math.random() * (capturedCount > 0 ? 34 : 24);
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.background = palette[i % palette.length];
      p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      fxLayerEl.appendChild(p);
      setTimeout(() => p.remove(), 620);
    }

    // 3. 플로팅 텍스트 (+1 / 연결 보너스 / 빼앗기)
    const label = document.createElement("span");
    let text = "+1";
    let extraClass = owner;
    if (capturedCount > 0) {
      text = `⚡ +${capturedCount + 1} 빼앗기!`;
      extraClass = "bonus";
    } else if (clusterGrew) {
      text = "✨ 연결 +1!";
      extraClass = "bonus";
    }
    label.className = `fx-float-text ${extraClass}`;
    label.textContent = text;
    label.style.left = `${cx}px`;
    label.style.top = `${cy - 6}px`;
    fxLayerEl.appendChild(label);
    setTimeout(() => label.remove(), 900);
  }

  // ===== 턴 제한시간 타이머 관리 =====
  function stopAllTimers() {
    if (state.cpuTimerId) {
      clearTimeout(state.cpuTimerId);
      state.cpuTimerId = null;
    }
    if (state.turnIntervalId) {
      clearInterval(state.turnIntervalId);
      state.turnIntervalId = null;
    }
    state.lastTickSecond = null;
  }

  function renderTurnTimer(remainingMs) {
    const clampedMs = Math.max(0, Math.min(TURN_LIMIT_MS, remainingMs));
    const seconds = clampedMs / 1000;
    const percent = (clampedMs / TURN_LIMIT_MS) * 100;
    const isCpu = !state.isPlayerTurn;

    if (!state.isStarted) {
      timerOwnerLabelEl.textContent = "시작 대기 중";
    } else if (state.isGameOver) {
      timerOwnerLabelEl.textContent = "게임 종료";
    } else {
      timerOwnerLabelEl.textContent = isCpu ? "컴퓨터 차례 남은 시간" : "내 차례 남은 시간";
    }

    turnTimerTextEl.textContent = `${seconds.toFixed(1)}초`;
    turnTimerBarEl.style.width = `${percent}%`;
    if (timerTrackEl) {
      timerTrackEl.setAttribute("aria-valuenow", seconds.toFixed(1));
    }

    turnTimerTextEl.classList.remove("cpu-turn", "warning", "danger");
    turnTimerBarEl.classList.remove("cpu-turn", "warning", "danger");

    if (!state.isStarted) return;

    if (seconds <= 3) {
      turnTimerTextEl.classList.add("danger");
      turnTimerBarEl.classList.add("danger");
    } else if (seconds <= 5) {
      turnTimerTextEl.classList.add("warning");
      turnTimerBarEl.classList.add("warning");
    } else if (isCpu) {
      turnTimerTextEl.classList.add("cpu-turn");
      turnTimerBarEl.classList.add("cpu-turn");
    }
  }

  function startTurnTimer() {
    if (state.turnIntervalId) {
      clearInterval(state.turnIntervalId);
      state.turnIntervalId = null;
    }
    if (!state.isStarted || state.isGameOver) return;

    state.turnDeadline = Date.now() + TURN_LIMIT_MS;
    state.lastTickSecond = null;
    renderTurnTimer(TURN_LIMIT_MS);

    state.turnIntervalId = setInterval(() => {
      if (!state.isStarted || state.isGameOver) {
        stopAllTimers();
        return;
      }
      const remaining = state.turnDeadline - Date.now();
      if (remaining <= 0) {
        renderTurnTimer(0);
        clearInterval(state.turnIntervalId);
        state.turnIntervalId = null;
        handleTurnTimeout();
      } else {
        // 사용자 턴 마지막 3초 카운트다운 틱 효과음
        const ceilSec = Math.ceil(remaining / 1000);
        if (state.isPlayerTurn && ceilSec <= 3 && ceilSec !== state.lastTickSecond) {
          state.lastTickSecond = ceilSec;
          sfx.tick();
        }
        renderTurnTimer(remaining);
      }
    }, 50);
  }

  function handleTurnTimeout() {
    if (!state.isStarted || state.isGameOver) return;

    if (state.isPlayerTurn) {
      // 사용자가 10초 안에 선택하지 못하면 자동으로 컴퓨터에게 턴을 넘김
      sfx.timeout();
      triggerBoardShake();
      state.isPlayerTurn = false;
      updateUI("⏰ 시간 초과! 컴퓨터 차례로 넘어갑니다.");
      scheduleComputerTurn();
    } else {
      // 안전장치: 컴퓨터 턴 제한시간 도달 시 즉시 선택
      if (state.cpuTimerId) {
        clearTimeout(state.cpuTimerId);
        state.cpuTimerId = null;
      }
      computerTurn();
    }
  }

  /**
   * 난이도별 랜덤 컴퓨터 생각 시간 (항상 10초 제한시간 이내)
   */
  function getRandomCpuDelay() {
    const ranges = {
      easy: [700, 2100],
      normal: [900, 2700],
      hard: [1100, 3300],
    };
    const [minMs, maxMs] = ranges[state.difficulty] || ranges.normal;
    return Math.floor(minMs + Math.random() * (maxMs - minMs));
  }

  function scheduleComputerTurn() {
    if (state.cpuTimerId) {
      clearTimeout(state.cpuTimerId);
      state.cpuTimerId = null;
    }
    startTurnTimer();
    const delay = getRandomCpuDelay();
    state.cpuTimerId = setTimeout(computerTurn, delay);
  }

  // ===== 게임 로직 =====
  /**
   * 대기(준비) 상태로 게임판 초기화 — 시작 버튼을 누를 때까지 타이머·턴을 시작하지 않음
   */
  function prepareGame(customDesc) {
    stopAllTimers();
    clearConfetti();
    clearFxLayer();

    const totalCells = state.size * state.size;
    state.board = new Array(totalCells).fill(EMPTY);
    state.isStarted = false;
    state.isPlayerTurn = true;
    state.isGameOver = false;
    state.lastMoveIndex = null;

    hideResultModal();
    if (turnBannerEl) {
      turnBannerEl.className = "turn-banner hidden";
    }
    if (startOverlayDescEl) {
      startOverlayDescEl.textContent =
        customDesc || "준비가 되면 시작 버튼을 눌러주세요!";
    }
    if (startOverlayEl) {
      startOverlayEl.classList.remove("hidden");
    }

    renderBoard();
    updateOrderBadges();
    updateModeHint();
    renderTurnTimer(TURN_LIMIT_MS);
    updateUI("▶ 게임 시작 버튼을 눌러 대결을 시작해 주세요!");
  }

  /**
   * 사용자가 '게임 시작' 버튼을 클릭했을 때 실제 대결 시작
   */
  function startGame() {
    if (state.isStarted) return;

    stopAllTimers();
    clearFxLayer();

    state.isStarted = true;
    state.isGameOver = false;
    // 매 게임마다 사용자와 컴퓨터의 선공 여부를 무작위로 결정
    state.firstPlayer = Math.random() < 0.5 ? PLAYER : COMPUTER;
    state.isPlayerTurn = state.firstPlayer === PLAYER;

    if (startOverlayEl) {
      startOverlayEl.classList.add("hidden");
    }

    sfx.gameStart();
    updateOrderBadges();
    updateModeHint();

    if (state.firstPlayer === PLAYER) {
      showTurnBanner("🎲 내가 선공! ⭐", PLAYER);
      updateUI("🎲 선공 추첨: 내가 선공! 10초 안에 빈 칸을 선택하세요!");
      startTurnTimer();
    } else {
      showTurnBanner("🎲 컴퓨터 선공! 🤖", COMPUTER);
      updateUI("🎲 선공 추첨: 컴퓨터 선공! 컴퓨터가 고민 중...");
      scheduleComputerTurn();
    }
  }

  function updateOrderBadges() {
    if (!state.isStarted) {
      playerOrderBadgeEl.textContent = "대기";
      playerOrderBadgeEl.className = "order-badge";
      computerOrderBadgeEl.textContent = "대기";
      computerOrderBadgeEl.className = "order-badge";
      return;
    }
    const playerFirst = state.firstPlayer === PLAYER;
    playerOrderBadgeEl.textContent = playerFirst ? "선공" : "후공";
    playerOrderBadgeEl.className = `order-badge ${playerFirst ? "first" : "second"}`;

    computerOrderBadgeEl.textContent = playerFirst ? "후공" : "선공";
    computerOrderBadgeEl.className = `order-badge ${playerFirst ? "second" : "first"}`;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.className = `game-board size-${state.size}`;

    const totalCells = state.size * state.size;
    for (let i = 0; i < totalCells; i++) {
      const row = Math.floor(i / state.size) + 1;
      const col = (i % state.size) + 1;

      const cellBtn = document.createElement("button");
      cellBtn.type = "button";
      cellBtn.className = "cell";
      cellBtn.dataset.index = String(i);
      cellBtn.setAttribute("role", "gridcell");
      cellBtn.setAttribute("aria-label", `${row}행 ${col}열 빈 칸`);
      cellBtn.addEventListener("click", () => handleCellClick(i));

      boardEl.appendChild(cellBtn);
    }
  }

  function handleCellClick(index) {
    // 대기 상태, 게임 종료 상태, 컴퓨터 차례, 이미 선택된 칸은 무시
    if (!state.isStarted || state.isGameOver || !state.isPlayerTurn) return;
    if (state.board[index] !== EMPTY) return;

    stopAllTimers();

    const prevCluster = getLargestCluster(PLAYER);
    const captured = claimCell(index, PLAYER);
    const nextCluster = getLargestCluster(PLAYER);
    const clusterGrew = nextCluster > prevCluster && nextCluster >= 2;

    sfx.playerMove();
    spawnTileEffects(index, PLAYER, captured.length, clusterGrew);
    if (captured.length > 0) {
      sfx.capture();
      triggerBoardShake();
    }

    // 모든 칸이 채워졌는지 확인
    if (checkGameEnd()) return;

    // 컴퓨터 차례로 전환 (랜덤 생각 시간 + 10초 타이머 시작)
    state.isPlayerTurn = false;
    updateUI(
      captured.length > 0
        ? `오! ${captured.length}칸을 빼앗았어요! 컴퓨터가 고민 중...`
        : "컴퓨터가 빈 칸을 고민하는 중..."
    );

    scheduleComputerTurn();
  }

  function computerTurn() {
    state.cpuTimerId = null;
    if (!state.isStarted || state.isGameOver) return;

    stopAllTimers();

    // 남아 있는 빈 칸 목록 수집
    const emptyIndices = [];
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] === EMPTY) {
        emptyIndices.push(i);
      }
    }

    if (emptyIndices.length === 0) {
      checkGameEnd();
      return;
    }

    // 난이도에 따라 컴퓨터가 칸 선택
    const prevCluster = getLargestCluster(COMPUTER);
    const chosenIndex = chooseComputerMove(emptyIndices);
    const captured = claimCell(chosenIndex, COMPUTER);
    const nextCluster = getLargestCluster(COMPUTER);
    const clusterGrew = nextCluster > prevCluster && nextCluster >= 2;

    sfx.cpuMove();
    spawnTileEffects(chosenIndex, COMPUTER, captured.length, clusterGrew);
    if (captured.length > 0) {
      sfx.capture();
      triggerBoardShake();
    }

    // 모든 칸이 채워졌는지 확인
    if (checkGameEnd()) return;

    // 다시 사용자 차례 (10초 타이머 시작)
    state.isPlayerTurn = true;
    updateUI(
      captured.length > 0
        ? `앗! 컴퓨터가 ${captured.length}칸을 빼앗았어요! 내 차례예요.`
        : "내 차례예요! 10초 안에 빈 칸을 선택해 주세요."
    );
    startTurnTimer();
  }

  /**
   * 가상 보드에서 특정 칸을 놓았을 때의 점수 차(내 점수 - 상대 점수) 계산
   */
  function evaluateMoveOnBoard(index, owner) {
    const simBoard = state.board.slice();
    simBoard[index] = owner;

    if (state.mode === "capture") {
      const opp = owner === PLAYER ? COMPUTER : PLAYER;
      const size = state.size;
      const sr = Math.floor(index / size);
      const sc = index % size;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

      for (const [dr, dc] of dirs) {
        const line = [];
        let r = sr + dr;
        let c = sc + dc;
        while (r >= 0 && r < size && c >= 0 && c < size) {
          const idx = r * size + c;
          if (simBoard[idx] === opp) {
            line.push(idx);
          } else if (simBoard[idx] === owner) {
            for (const k of line) simBoard[k] = owner;
            break;
          } else {
            break;
          }
          r += dr;
          c += dc;
        }
      }
    }

    const opp = owner === PLAYER ? COMPUTER : PLAYER;
    const myTiles = simBoard.filter((c) => c === owner).length;
    const oppTiles = simBoard.filter((c) => c === opp).length;
    const myCluster = getLargestClusterFrom(simBoard, owner);
    const oppCluster = getLargestClusterFrom(simBoard, opp);

    return (myTiles + myCluster) - (oppTiles + oppCluster);
  }

  /**
   * 난이도별 컴퓨터 착수 선택:
   * - easy(쉬움): 완전 랜덤
   * - normal(보통): 55% 전략적 선택 + 45% 랜덤
   * - hard(어려움): 내 점수 극대화 + 상대 연결 차단 + 중앙 선호
   */
  function chooseComputerMove(emptyIndices) {
    if (state.difficulty === "easy") {
      return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    }

    if (state.difficulty === "normal" && Math.random() < 0.45) {
      return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    }

    const size = state.size;
    const center = (size - 1) / 2;
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const idx of emptyIndices) {
      const myGain = evaluateMoveOnBoard(idx, COMPUTER);
      let score = myGain;

      if (state.difficulty === "hard") {
        // 상대가 이 칸을 가져갔을 때의 이득도 함께 차단
        const blockGain = evaluateMoveOnBoard(idx, PLAYER);
        const r = Math.floor(idx / size);
        const c = idx % size;
        const centerBonus = (size - (Math.abs(r - center) + Math.abs(c - center))) * 0.08;
        score = myGain * 1.15 + blockGain * 0.65 + centerBonus;
      }

      if (score > bestScore + 0.001) {
        bestScore = score;
        bestMoves = [idx];
      } else if (Math.abs(score - bestScore) <= 0.001) {
        bestMoves.push(idx);
      }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function claimCell(index, owner) {
    state.board[index] = owner;
    state.lastMoveIndex = index;

    let capturedIndices = [];
    if (state.mode === "capture") {
      capturedIndices = applyCaptureRule(index, owner);
    }

    updateCellElement(index, owner, "pop");
    for (const capIdx of capturedIndices) {
      updateCellElement(capIdx, owner, "captured");
    }

    // 최근 선택된 칸 하이라이트 갱신
    const prevLast = boardEl.querySelector(".cell.last-move");
    if (prevLast) prevLast.classList.remove("last-move");
    const currentCell = boardEl.children[index];
    if (currentCell) currentCell.classList.add("last-move");

    return capturedIndices;
  }

  /**
   * 포위전 모드 규칙:
   * 방금 놓은 칸을 기준으로 상하좌우 4방향에서 상대 칸을 내 칸으로 감싸면
   * 사이에 낀 상대 칸들을 내 영역으로 변환합니다.
   */
  function applyCaptureRule(index, owner) {
    const opponent = owner === PLAYER ? COMPUTER : PLAYER;
    const size = state.size;
    const startRow = Math.floor(index / size);
    const startCol = index % size;
    const directions = [
      [-1, 0], // 위
      [1, 0],  // 아래
      [0, -1], // 왼쪽
      [0, 1],  // 오른쪽
    ];

    const captured = [];

    for (const [dr, dc] of directions) {
      const line = [];
      let r = startRow + dr;
      let c = startCol + dc;

      while (r >= 0 && r < size && c >= 0 && c < size) {
        const idx = r * size + c;
        if (state.board[idx] === opponent) {
          line.push(idx);
        } else if (state.board[idx] === owner) {
          if (line.length > 0) {
            captured.push(...line);
          }
          break;
        } else {
          break;
        }
        r += dr;
        c += dc;
      }
    }

    for (const idx of captured) {
      state.board[idx] = owner;
    }
    return captured;
  }

  function updateCellElement(index, owner, animClass) {
    const cellEl = boardEl.children[index];
    if (!cellEl) return;

    const row = Math.floor(index / state.size) + 1;
    const col = (index % state.size) + 1;
    const ownerName = owner === PLAYER ? "사용자 영역" : "컴퓨터 영역";

    cellEl.classList.remove("player", "computer", "pop", "captured");
    void cellEl.offsetWidth; // 애니메이션 리트리거
    cellEl.classList.add(owner, animClass);
    cellEl.textContent = owner === PLAYER ? "⭐" : "🤖";
    cellEl.disabled = true; // 이미 선택된 칸은 다시 선택 불가
    cellEl.setAttribute("aria-label", `${row}행 ${col}열 ${ownerName}`);
  }

  /**
   * 상하좌우로 인접하게 연결된 가장 큰 영토 크기 계산 (연결 보너스)
   */
  function getLargestClusterFrom(board, owner) {
    const size = state.size;
    const total = board.length;
    const visited = new Uint8Array(total);
    let maxCluster = 0;

    for (let i = 0; i < total; i++) {
      if (board[i] !== owner || visited[i]) continue;

      let count = 0;
      const queue = [i];
      visited[i] = 1;

      while (queue.length > 0) {
        const cur = queue.pop();
        count++;
        const r = Math.floor(cur / size);
        const c = cur % size;
        const neighbors = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
            const ni = nr * size + nc;
            if (board[ni] === owner && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }
      if (count > maxCluster) maxCluster = count;
    }

    return maxCluster;
  }

  function getLargestCluster(owner) {
    return getLargestClusterFrom(state.board, owner);
  }

  /**
   * 공정한 점수 계산:
   * 총점 = 차지한 칸 수 + 최대 연결 영토 보너스 + 홀수판 후공 보정(+2점)
   * -> 홀수 판(5×5)에서 선공이 1칸 더 놓는 구조적 유리함을 보정하고,
   *    영토를 넓게 연결할수록 점수가 높아져 선공·후공 모두 전략적으로 승리 가능
   */
  function getScores() {
    let playerTiles = 0;
    let computerTiles = 0;
    let empty = 0;

    for (const cell of state.board) {
      if (cell === PLAYER) playerTiles++;
      else if (cell === COMPUTER) computerTiles++;
      else empty++;
    }

    const playerCluster = getLargestCluster(PLAYER);
    const computerCluster = getLargestCluster(COMPUTER);

    const isOddBoard = state.board.length % 2 === 1;
    const playerKomi = state.isStarted && isOddBoard && state.firstPlayer === COMPUTER ? 2 : 0;
    const computerKomi = state.isStarted && isOddBoard && state.firstPlayer === PLAYER ? 2 : 0;

    const playerTotal = playerTiles + playerCluster + playerKomi;
    const computerTotal = computerTiles + computerCluster + computerKomi;

    return {
      player: {
        tiles: playerTiles,
        cluster: playerCluster,
        komi: playerKomi,
        total: playerTotal,
      },
      computer: {
        tiles: computerTiles,
        cluster: computerCluster,
        komi: computerKomi,
        total: computerTotal,
      },
      empty,
    };
  }

  function formatBreakdown(scoreObj) {
    const parts = [`칸 ${scoreObj.tiles}`, `연결 +${scoreObj.cluster}`];
    if (scoreObj.komi > 0) {
      parts.push(`후공 +${scoreObj.komi}`);
    }
    return parts.join(" · ");
  }

  function updateUI(message) {
    const { player, computer, empty } = getScores();

    updateScoreText(playerScoreEl, player.total);
    updateScoreText(computerScoreEl, computer.total);
    playerBreakdownEl.textContent = formatBreakdown(player);
    computerBreakdownEl.textContent = formatBreakdown(computer);

    const totalScoreSum = player.total + computer.total;
    if (totalScoreSum > 0) {
      playerBarEl.style.width = `${(player.total / totalScoreSum) * 100}%`;
      computerBarEl.style.width = `${(computer.total / totalScoreSum) * 100}%`;
    } else {
      playerBarEl.style.width = "0%";
      computerBarEl.style.width = "0%";
    }

    remainingBadgeEl.textContent = `남은 칸: ${empty}`;

    if (message) {
      statusMsgEl.textContent = message;
    }

    if (!state.isStarted || state.isGameOver) {
      playerCardEl.classList.remove("active-turn");
      computerCardEl.classList.remove("active-turn");
    } else {
      playerCardEl.classList.toggle("active-turn", state.isPlayerTurn);
      computerCardEl.classList.toggle("active-turn", !state.isPlayerTurn);
    }
  }

  function updateScoreText(el, newValue) {
    if (el.textContent !== String(newValue)) {
      el.textContent = String(newValue);
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }

  function checkGameEnd() {
    const { player, computer, empty } = getScores();
    if (empty > 0) return false;

    stopAllTimers();
    state.isGameOver = true;
    state.isPlayerTurn = false;
    renderTurnTimer(0);

    let resultType = "draw";
    let emoji = "🤝";
    let title = "무승부!";
    let subtitle = "우와, 한 치의 양보도 없는 팽팽한 대결이었어요!";
    let statusText = `게임 종료! ${player.total}점 : ${computer.total}점 무승부입니다!`;

    if (player.total > computer.total) {
      resultType = "win";
      emoji = "🏆";
      title = "승리했어요!";
      const roleText = state.firstPlayer === PLAYER ? "선공" : "후공";
      subtitle = `${roleText}으로 ${player.total - computer.total}점 차이 승리를 거뒀어요!`;
      statusText = `게임 종료! ${player.total}점 : ${computer.total}점 승리!`;
      sfx.win();
      launchConfetti();
    } else if (computer.total > player.total) {
      resultType = "lose";
      emoji = "😅";
      title = "아쉬운 패배!";
      const cpuRoleText = state.firstPlayer === COMPUTER ? "선공" : "후공";
      subtitle = `컴퓨터(${cpuRoleText})가 ${computer.total - player.total}점 더 높아요. 다시 도전해 볼까요?`;
      statusText = `게임 종료! ${player.total}점 : ${computer.total}점 패배...`;
      sfx.lose();
    } else {
      sfx.draw();
    }

    updateUI(statusText);

    // 짧은 딜레이 후 결과 모달 표시 (마지막 칸 애니메이션 감상용)
    setTimeout(() => {
      if (state.isGameOver) {
        showResultModal(resultType, emoji, title, subtitle, player, computer);
      }
    }, 420);

    return true;
  }

  function showResultModal(resultType, emoji, title, subtitle, player, computer) {
    const playerOrder = state.firstPlayer === PLAYER ? "선공" : "후공";
    const cpuOrder = state.firstPlayer === COMPUTER ? "선공" : "후공";

    resultEmojiEl.textContent = emoji;
    resultTitleEl.textContent = title;
    resultTitleEl.className = `result-title ${resultType}`;
    resultSubtitleEl.textContent = subtitle;
    finalPlayerLabelEl.textContent = `⭐ 나 (${playerOrder})`;
    finalComputerLabelEl.textContent = `🤖 컴퓨터 (${cpuOrder})`;
    finalPlayerScoreEl.textContent = `${player.total}점`;
    finalComputerScoreEl.textContent = `${computer.total}점`;
    finalPlayerDetailEl.textContent = formatBreakdown(player);
    finalComputerDetailEl.textContent = formatBreakdown(computer);
    resultModalEl.classList.remove("hidden");
  }

  function hideResultModal() {
    resultModalEl.classList.add("hidden");
  }

  function updateModeHint() {
    const diffNames = { easy: "쉬움", normal: "보통", hard: "어려움" };
    const komiHint = state.size % 2 === 1 ? " · 홀수 판 후공 +2점" : "";
    if (state.mode === "classic") {
      modeHintEl.textContent =
        `💡 턴당 10초 · 난이도 [${diffNames[state.difficulty]}] · 총점 = 칸 + 최대 연결 영토${komiHint}`;
    } else {
      modeHintEl.textContent =
        `⚔️ 포위전 · 턴당 10초 · 난이도 [${diffNames[state.difficulty]}] · 감싸기 + 연결 보너스${komiHint}`;
    }
  }

  // ===== 이벤트 리스너 =====
  enterGameBtn.addEventListener("click", () => {
    if (introScreenEl) {
      introScreenEl.classList.add("hidden");
    }
    sfx.gameStart();
  });

  homeBtn.addEventListener("click", () => {
    prepareGame("준비가 되면 시작 버튼을 눌러주세요!");
    if (introScreenEl) {
      introScreenEl.classList.remove("hidden");
    }
  });

  startGameBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", () =>
    prepareGame("새 판이 준비됐어요! 시작 버튼을 눌러주세요.")
  );
  modalRestartBtn.addEventListener("click", () =>
    prepareGame("다시 도전할 준비 완료! 시작 버튼을 눌러주세요.")
  );
  modalCloseBtn.addEventListener("click", hideResultModal);

  resultModalEl.addEventListener("click", (e) => {
    if (e.target === resultModalEl) {
      hideResultModal();
    }
  });

  soundToggleBtn.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundToggleBtn.textContent = state.soundEnabled ? "🔊" : "🔇";
    soundToggleBtn.setAttribute(
      "aria-label",
      state.soundEnabled ? "효과음 끄기" : "효과음 켜기"
    );
    if (state.soundEnabled) {
      playTone(587.33, 0.08, "triangle", 0.1);
    }
  });

  sizeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextSize = Number(btn.dataset.size);
      if (nextSize === state.size) return;

      sizeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.size = nextSize;
      prepareGame(`${nextSize}×${nextSize} 게임판 준비 완료! 시작 버튼을 눌러주세요.`);
    });
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextMode = btn.dataset.mode;
      if (nextMode === state.mode) return;

      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = nextMode;
      prepareGame("규칙이 변경됐어요! 시작 버튼을 눌러주세요.");
    });
  });

  difficultyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextDiff = btn.dataset.difficulty;
      if (nextDiff === state.difficulty) return;

      difficultyButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.difficulty = nextDiff;
      prepareGame("난이도가 변경됐어요! 시작 버튼을 눌러주세요.");
    });
  });

  window.addEventListener("resize", resizeConfettiCanvas);

  // ===== 초기 실행 =====
  resizeConfettiCanvas();
  prepareGame();
})();
