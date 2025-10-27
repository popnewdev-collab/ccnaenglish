// === Settings ===
const SHEET_CSV_URL = "";
const CATEGORIES = [
    "Network Fundamentals",
    "Network Access",
    "IP Connectivity",
    "IP Services",
    "Security Fundamentals",
    "Automation & Programmability"
];
const SIM_CONFIG = {
    "Network Fundamentals": 20,
    "Network Access": 20,
    "IP Connectivity": 25,
    "IP Services": 10,
    "Security Fundamentals": 15,
    "Automation & Programmability": 10
};
const SIM_TOTAL = Object.values(SIM_CONFIG).reduce((a, b) => a + b, 0);

// === State Variables ===
let allQuestions = [];
let current = null;
let answeredQuestions = new Set();
let asked = 0, correctCount = 0, wrongCount = 0;
let mode = 'quiz';
let simQuestions = [];
let simAnswers = [];
let simIndex = 0;
let timer = null;
let timeLeft = 0;
let simCategoryScores = {};

// === Helper Functions ===
function escapeHTML(str = '') {
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function formatTime(s) {
    if (s < 0) s = 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
}

function arraysEqual(a, b) {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

function focusFirstOption() {
    const first = document.querySelector('.opt:not(.opt-disabled)');
    if (first) first.focus();
}

function parseCSV(csv) {
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== "");
    const headers = lines.shift().split(/,|;|\t/).map(h => h.trim());
    return lines.map(line => {
        const values = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) { values.push(cur); cur = ''; }
            else cur += ch;
        }
        values.push(cur);
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = (values[i] || '').trim().replace(/^"|"$/g, '');
        });
        return obj;
    });
}

// === Helper Function to Show Errors ===
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #ff4d4d; color: white; padding: 10px 20px; border-radius: 5px;
        z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// === Function to Show Temporary Correct Answer Message ===
function showCorrectMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'correct-message';
    messageDiv.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #28a745; color: white; padding: 10px 20px; border-radius: 5px;
        z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    messageDiv.setAttribute('aria-live', 'assertive');
    messageDiv.textContent = 'Correct ✔';
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 1000);
}

// === Data Loading ===
async function loadSheet() {
    try {
        if (!Config?.SHEET_API_URL) {
            document.getElementById('qMeta').textContent = 'Error: API configuration not found in config.js.';
            return;
        }

        let data = null;
        if (Config.SHEET_API_URL) {
            const res = await fetch(Config.SHEET_API_URL);
            if (!res.ok) throw new Error(`API Failure: ${res.status}`);
            data = await res.json();
        } else if (SHEET_CSV_URL && SHEET_CSV_URL.length > 10 && !SHEET_CSV_URL.includes('PASTE_YOUR')) {
            const res = await fetch(SHEET_CSV_URL);
            if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
            const txt = await res.text();
            data = parseCSV(txt);
        } else {
            document.getElementById('qMeta').textContent = 'Configure SHEET_API_URL or SHEET_CSV_URL in config.js.';
            return;
        }

        allQuestions = (data || []).map((r, idx) => ({
            id: String(r.id || idx + 1),
            question: (r.question || r.pergunta || '').toString(),
            questionImage: (r.questionImage || r.questionimage || r.image || '').toString(),
            options: {
                A: (r.optionA || r.A || '').toString(),
                B: (r.optionB || r.B || '').toString(),
                C: (r.optionC || r.C || '').toString(),
                D: (r.optionD || r.D || '').toString()
            },
            optionImages: {
                A: (r.optionAImage || r.optionaimage || '').toString(),
                B: (r.optionBImage || r.optionbimage || '').toString(),
                C: (r.optionCImage || r.optioncimage || '').toString(),
                D: (r.optionDImage || r.optiondimage || '').toString()
            },
            correct: (r.correct || r.answer || '').toString().replace(/\s+/g,'').replace(/,/g,';').split(';').filter(Boolean).map(s => s.toUpperCase()),
            category: (r.category || '').toString().trim(),
            explanation: (r.explanation || '').toString()
        })).filter(q => q.question && Object.values(q.options).some(opt => opt));

        const sel = document.getElementById('categorySelect');
        sel.querySelectorAll('option:not([value="all"])').forEach(o => o.remove());
        const presentCats = new Set(allQuestions.map(q => q.category));
        CATEGORIES.filter(cat => presentCats.has(cat)).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            sel.appendChild(opt);
        });

        if (allQuestions.length === 0) {
            document.getElementById('qMeta').textContent = 'No valid questions available at the moment, please try again later.';
            return;
        }

        updateStats();
        nextQuestion();
    } catch (err) {
        console.error(err);
        document.getElementById('qMeta').textContent = `Error loading: ${err.message}`;
    }
}

// === Question Rendering ===
function renderQuestion(q) {
    const qMeta = document.getElementById('qMeta');
    const qText = document.getElementById('questionText');
    const qImg = document.getElementById('questionImage');
    const opts = document.getElementById('options');
    const expl = document.getElementById('explanation');

    if (!q) {
        qMeta.textContent = 'No question available';
        qText.textContent = '—';
        opts.innerHTML = '';
        expl.style.display = 'none';
        qImg.style.display = 'none';
        return;
    }

    current = q;
    qMeta.textContent = mode === 'simulated' 
        ? `Question ${simIndex + 1} of ${SIM_TOTAL} — Category: ${escapeHTML(q.category || '—')}`
        : `ID ${escapeHTML(q.id)} — Category: ${escapeHTML(q.category || '—')}`;

    qText.textContent = q.question;

    if (q.questionImage) {
        qImg.src = q.questionImage;
        qImg.style.display = 'block';
    } else {
        qImg.style.display = 'none';
        qImg.src = '';
    }

    opts.innerHTML = '';
    expl.style.display = 'none';
    expl.innerHTML = '';

    ['A', 'B', 'C', 'D'].forEach(letter => {
        const txt = q.options[letter];
        if (!txt) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'opt';
        btn.dataset.letter = letter;
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', `Option ${letter}: ${txt}`);
        btn.tabIndex = 0;

        let imgHtml = '';
        if (q.optionImages?.[letter]) {
            imgHtml = `<img src="${escapeHTML(q.optionImages[letter])}" alt="Image for option ${letter}">`;
        }

        btn.innerHTML = `<span class="letter">${letter}</span><span class="text">${escapeHTML(txt)}</span>${imgHtml}`;
        btn.addEventListener('click', onSelectOption);
        btn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click();
            }
        });
        opts.appendChild(btn);
    });

    setTimeout(() => document.activeElement.blur(), 120);
    document.getElementById('questionCard').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });

    answeredQuestions.add(q.id);
}

// === Explanation Display ===
function showExplanation(isCorrect) {
    const expl = document.getElementById('explanation');
    expl.style.display = 'block';
    expl.innerHTML = `<strong>${isCorrect ? 'Correct ✔' : 'Incorrect ✖'}</strong><div style="margin-top:0.5rem">${escapeHTML(current.explanation || 'No explanation available.')}</div>`;

    if (!isCorrect) {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
        document.getElementById('questionCard').animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(0)' }
        ], { duration: 360 });
    }

    const acc = document.getElementById('accessibilityStatus');
    acc.textContent = isCorrect ? 'Correct answer' : 'Incorrect answer';
}

// === Option Selection and Validation ===
function onSelectOption(e) {
    if (!current) return;
    const btn = e.currentTarget;
    if (btn.classList.contains('opt-disabled')) return;
    btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    btn.classList.toggle('selected');
    const selected = Array.from(document.querySelectorAll('.opt.selected')).map(x => x.dataset.letter);
    const needed = current.correct.length || 1;
    if (current.correct.length <= 1 || selected.length >= needed) {
        validateAnswer(selected);
    }
}

function validateAnswer(selected) {
    document.querySelectorAll('.opt').forEach(o => {
        o.classList.add('opt-disabled');
        o.removeEventListener('click', onSelectOption);
    });

    const correct = current.correct.slice().sort();
    const selSorted = selected.slice().sort();
    const isCorrect = arraysEqual(correct, selSorted);
    asked++;
    if (isCorrect) correctCount++; else wrongCount++;
    updateStats();

    if (mode === 'simulated') {
        simAnswers.push({ question: current, selected, isCorrect });
    }

    if (mode === 'quiz') {
        document.querySelectorAll('.opt').forEach(o => {
            const l = o.dataset.letter;
            if (correct.includes(l)) o.classList.add('correct');
            if (selected.includes(l) && !correct.includes(l)) o.classList.add('wrong');
        });

        // Clear and hide the explanation element
        const expl = document.getElementById('explanation');
        expl.style.display = 'none';
        expl.innerHTML = '';

        if (isCorrect) {
            // Show temporary correct answer message
            showCorrectMessage();
            // Move to the next question after 1 second
            setTimeout(nextQuestion, 1000);
        } else {
            // Show explanation only when incorrect
            showExplanation(false);
        }
    } else {
        const cat = current.category;
        if (isCorrect) simCategoryScores[cat] = (simCategoryScores[cat] || 0) + 1;
        simIndex++;
        if (simIndex < simQuestions.length) {
            setTimeout(() => loadSimQuestion(simIndex), 900);
        } else {
            setTimeout(showSimulatedScore, 700);
        }
    }
}

// === Statistics Update ===
function updateStats() {
    document.getElementById('totalAsked').textContent = asked;
    document.getElementById('totalCorrect').textContent = correctCount;
    document.getElementById('totalWrong').textContent = wrongCount;
    const pct = Math.round((correctCount / Math.max(1, asked)) * 100);
    document.getElementById('progress').textContent = `${pct}%`;
}

function updateStatsInlineVisibility() {
    document.getElementById('statsInline').style.display = mode === 'quiz' ? 'flex' : 'none';
}

function updateActionsInlineVisibility() {
    const actions = document.getElementById('actionsInline');
    actions.classList.toggle('simulated-active', mode === 'simulated');
}

// === Question Navigation ===
function nextQuestion() {
    const cat = document.getElementById('categorySelect').value;
    let candidates = cat === 'all' ? allQuestions : allQuestions.filter(q => q.category === cat);
    if (candidates.length === 0) {
        document.getElementById('qMeta').textContent = 'No questions available for this category.';
        return;
    }

    const pool = candidates.filter(q => !answeredQuestions.has(q.id));

    if (pool.length === 0) {
        document.getElementById('qMeta').textContent = 'All questions in this category have been displayed. Restarting...';
        setTimeout(() => {
            answeredQuestions.clear();
            nextQuestion();
        }, 1000);
        return;
    }

    const q = pool[Math.floor(Math.random() * pool.length)];
    renderQuestion(q);
}

// === Simulated Mode Preparation ===
function prepareSimulated() {
    simQuestions = [];
    simAnswers = [];
    simCategoryScores = {};

    // Check if there are enough questions for each category
    for (const cat in SIM_CONFIG) {
        const questionsCat = allQuestions.filter(q => q.category === cat);
        if (questionsCat.length < SIM_CONFIG[cat]) {
            showError(`Not enough questions for the category "${cat}". Required: ${SIM_CONFIG[cat]}, Available: ${questionsCat.length}.`);
            return false;
        }
    }

    // If all categories have enough questions, proceed
    for (const cat in SIM_CONFIG) {
        const questionsCat = shuffleArray(allQuestions.filter(q => q.category === cat));
        simQuestions.push(...questionsCat.slice(0, SIM_CONFIG[cat]));
        simCategoryScores[cat] = 0;
    }

    if (simQuestions.length !== SIM_TOTAL) {
        showError(`Error preparing the simulated test: ${simQuestions.length} questions were selected, but ${SIM_TOTAL} were expected.`);
        return false;
    }

    simQuestions = shuffleArray(simQuestions);
    simIndex = 0;
    answeredQuestions.clear();
    asked = correctCount = wrongCount = 0;
    updateStats();
    return true;
}

function loadSimQuestion(i) {
    if (!simQuestions[i]) return renderQuestion(null);
    renderQuestion(simQuestions[i]);
}

// === Timer Management ===
function startTimer(seconds) {
    stopTimer();
    timeLeft = seconds;
    document.getElementById('timerDisplay').textContent = formatTime(timeLeft);
    timer = setInterval(() => {
        timeLeft--;
        document.getElementById('timerDisplay').textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            stopTimer();
            showSimulatedScore(true);
        }
    }, 1000);
}

function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
}

// === Display Final Score in Simulated Mode ===
function showSimulatedScore(timeout = false) {
    stopTimer();
    const modal = document.getElementById('finalScoreModal');
    let html = `<h2 id="modalTitle">${timeout ? 'Time Expired!' : 'Simulated Test Completed!'}</h2>`;
    html += `<p>Correct Answers: <strong>${correctCount}</strong> out of ${SIM_TOTAL} (${Math.round((correctCount / SIM_TOTAL) * 100)}%)</p>`;
    html += '<ul>';
    for (const cat in SIM_CONFIG) {
        html += `<li>${cat}: <strong>${simCategoryScores[cat] || 0}</strong> out of ${SIM_CONFIG[cat]}</li>`;
    }
    html += '</ul>';
    const approved = correctCount >= 82;
    html += `<p class="${approved ? 'approved' : 'failed'}" style="font-size:1.2em">Result: ${approved ? 'APPROVED 🎉' : 'FAILED ❌'}</p>`;
    html += '<h3>Answer Review</h3>';
    simAnswers.forEach((ans, idx) => {
        const q = ans.question;
        const selected = ans.selected;
        const correct = q.correct;
        const isCorrect = ans.isCorrect;
        html += '<div class="question-review">';
        html += `<p><strong>Question ${idx + 1}:</strong> ${escapeHTML(q.question)}</p>`;
        if (q.questionImage) {
            html += `<img src="${escapeHTML(q.questionImage)}" alt="Image for question ${idx + 1}" style="max-width:100%; border-radius:0.5rem; margin:0.5rem 0;">`;
        }
        html += `<p><strong>Your answer:</strong> ${selected.length ? selected.map(l => `${l}: ${escapeHTML(q.options[l] || '—')}`).join(', ') : 'None selected'}</p>`;
        html += `<p><strong>Correct answer:</strong> ${correct.map(l => `${l}: ${escapeHTML(q.options[l] || '—')}`).join(', ')}</p>`;
        html += `<p><strong>Explanation:</strong> ${escapeHTML(q.explanation || 'No explanation.')}</p>`;
        html += `<p><strong>Result:</strong> <span class="${isCorrect ? 'approved' : 'failed'}">${isCorrect ? 'Correct ✔' : 'Incorrect ✖'}</span></p>`;
        html += '</div>';
    });
    html += '<button class="btn-primary" id="closeScoreBtn" tabindex="0">Close</button>';
    modal.innerHTML = html;
    modal.classList.add('visible');
    modal.focus();

    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    modal.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    document.getElementById('closeScoreBtn').onclick = () => {
        modal.classList.remove('visible');
        mode = 'quiz';
        document.getElementById('modeIndicator').innerHTML = 'Mode: <strong>Quiz</strong>';
        asked = correctCount = wrongCount = 0;
        updateStats();
        updateStatsInlineVisibility();
        updateActionsInlineVisibility();
        answeredQuestions.clear();
        nextQuestion();
    };
}

// === Events ===
document.getElementById('btnQuiz').addEventListener('click', () => {
    mode = 'quiz';
    document.getElementById('modeIndicator').innerHTML = 'Mode: <strong>Quiz</strong>';
    stopTimer();
    document.getElementById('timerDisplay').textContent = '--:--:--';
    asked = correctCount = wrongCount = 0;
    answeredQuestions.clear();
    updateStats();
    document.getElementById('btnQuiz').setAttribute('aria-pressed', 'true');
    document.getElementById('btnSimulated').setAttribute('aria-pressed', 'false');
    updateStatsInlineVisibility();
    updateActionsInlineVisibility();
    nextQuestion();
});

document.getElementById('btnSimulated').addEventListener('click', () => {
    mode = 'simulated';
    document.getElementById('modeIndicator').innerHTML = 'Mode: <strong>Simulated</strong>';
    document.getElementById('btnQuiz').setAttribute('aria-pressed', 'false');
    document.getElementById('btnSimulated').setAttribute('aria-pressed', 'true');
    updateStatsInlineVisibility();
    updateActionsInlineVisibility();

    if (prepareSimulated()) {
        startTimer(120 * 60);
        loadSimQuestion(0);
    } else {
        mode = 'quiz';
        document.getElementById('modeIndicator').innerHTML = 'Mode: <strong>Quiz</strong>';
        document.getElementById('btnQuiz').setAttribute('aria-pressed', 'true');
        document.getElementById('btnSimulated').setAttribute('aria-pressed', 'false');
        updateStatsInlineVisibility();
        updateActionsInlineVisibility();
        nextQuestion();
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    if (mode === 'quiz') {
        nextQuestion();
    } else if (simIndex < simQuestions.length) {
        loadSimQuestion(simIndex);
    }
});

document.getElementById('restartBtn').addEventListener('click', () => {
    answeredQuestions.clear();
    asked = correctCount = wrongCount = 0;
    updateStats();
    if (mode === 'simulated') {
        if (prepareSimulated()) {
            startTimer(120 * 60);
            loadSimQuestion(0);
        } else {
            mode = 'quiz';
            document.getElementById('modeIndicator').innerHTML = 'Mode: <strong>Quiz</strong>';
            document.getElementById('btnQuiz').setAttribute('aria-pressed', 'true');
            document.getElementById('btnSimulated').setAttribute('aria-pressed', 'false');
            updateStatsInlineVisibility();
            updateActionsInlineVisibility();
            nextQuestion();
        }
    } else {
        nextQuestion();
    }
});

document.getElementById('categorySelect').addEventListener('change', () => {
    if (mode === 'quiz') {
        answeredQuestions.clear();
        nextQuestion();
    }
});

// === Initialization ===
loadSheet();
updateStatsInlineVisibility();
updateActionsInlineVisibility();
