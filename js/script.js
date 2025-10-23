// === Configurações ===
const SHEET_CSV_URL = "";
const CATEGORIES = [
    "Network Fundamentals",
    "Network Access",
    "IP connectivity",
    "IP services",
    "Security Fundamentals",
    "Programmability"
];
const SIM_CONFIG = {
    "Network Fundamentals": 20,
    "Network Access": 20,
    "IP connectivity": 25,
    "IP services": 10,
    "Security Fundamentals": 15,
    "Programmability": 10
};
const SIM_TOTAL = Object.values(SIM_CONFIG).reduce((a, b) => a + b, 0);

// === Variáveis de Estado ===
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

// === Funções Auxiliares ===
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

// === Carregamento de Dados ===
async function loadSheet() {
    try {
        if (!Config?.SHEET_API_URL) {
            document.getElementById('qMeta').textContent = 'Erro: Configuração da API não encontrada em config.js.';
            return;
        }

        let data = null;
        if (Config.SHEET_API_URL) {
            const res = await fetch(Config.SHEET_API_URL);
            if (!res.ok) throw new Error(`Falha na API: ${res.status}`);
            data = await res.json();
        } else if (SHEET_CSV_URL && SHEET_CSV_URL.length > 10 && !SHEET_CSV_URL.includes('PASTE_YOUR')) {
            const res = await fetch(SHEET_CSV_URL);
            if (!res.ok) throw new Error(`Falha ao buscar CSV: ${res.status}`);
            const txt = await res.text();
            data = parseCSV(txt);
        } else {
            document.getElementById('qMeta').textContent = 'Configure SHEET_API_URL ou SHEET_CSV_URL em config.js.';
            return;
        }

        allQuestions = (data || []).map((r, idx) => ({
            id: r.id || idx + 1,
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
            document.getElementById('qMeta').textContent = 'Sem perguntas válidas na planilha.';
            return;
        }

        updateStats();
        nextQuestion();
    } catch (err) {
        console.error(err);
        document.getElementById('qMeta').textContent = `Erro ao carregar: ${err.message}`;
    }
}

// === Renderização de Pergunta ===
function renderQuestion(q) {
    const qMeta = document.getElementById('qMeta');
    const qText = document.getElementById('questionText');
    const qImg = document.getElementById('questionImage');
    const opts = document.getElementById('options');
    const expl = document.getElementById('explanation');

    if (!q) {
        qMeta.textContent = 'Nenhuma pergunta disponível';
        qText.textContent = '—';
        opts.innerHTML = '';
        expl.style.display = 'none';
        qImg.style.display = 'none';
        return;
    }

    current = q;
    qMeta.textContent = mode === 'simulado' 
        ? `Pergunta ${simIndex + 1} de ${SIM_TOTAL} — Categoria: ${escapeHTML(q.category || '—')}`
        : `ID ${escapeHTML(q.id.toString())} — Categoria: ${escapeHTML(q.category || '—')}`;

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
        btn.setAttribute('aria-label', `Alternativa ${letter}: ${txt}`);
        btn.tabIndex = 0;

        let imgHtml = '';
        if (q.optionImages?.[letter]) {
            imgHtml = `<img src="${escapeHTML(q.optionImages[letter])}" alt="Imagem da alternativa ${letter}">`;
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
}

// === Exibição de Explicação ===
function showExplanation(isCorrect) {
    const expl = document.getElementById('explanation');
    expl.style.display = 'block';
    expl.innerHTML = `<strong>${isCorrect ? 'Acertou ✔' : 'Errou ✖'}</strong><div style="margin-top:0.5rem">${escapeHTML(current.explanation || 'Sem explicação disponível.')}</div>`;

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
    acc.textContent = isCorrect ? 'Resposta correta' : 'Resposta errada';
}

// === Seleção e Validação de Opções ===
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

    if (mode === 'simulado') {
        simAnswers.push({ question: current, selected, isCorrect });
    }

    if (mode === 'quiz') {
        document.querySelectorAll('.opt').forEach(o => {
            const l = o.dataset.letter;
            if (correct.includes(l)) o.classList.add('correct');
            if (selected.includes(l) && !correct.includes(l)) o.classList.add('wrong');
        });
        showExplanation(isCorrect);
        if (isCorrect) {
            setTimeout(nextQuestion, 1000);
        }
    } else {
        answeredQuestions.add(current.id);
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

// === Atualização de Estatísticas ===
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
    actions.classList.toggle('simulado-active', mode === 'simulado');
}

// === Navegação entre Perguntas ===
function nextQuestion() {
    const cat = document.getElementById('categorySelect').value;
    let candidates = cat === 'all' ? allQuestions : allQuestions.filter(q => q.category === cat);
    if (candidates.length === 0) {
        document.getElementById('qMeta').textContent = 'Nenhuma pergunta disponível para esta categoria.';
        return;
    }

    const pool = mode === 'quiz' ? candidates : candidates.filter(q => !answeredQuestions.has(q.id)) || candidates;
    if (pool.length === 0) {
        document.getElementById('qMeta').textContent = 'Todas as perguntas respondidas. Reiniciando...';
        setTimeout(() => {
            answeredQuestions.clear();
            nextQuestion();
        }, 1000);
        return;
    }

    const q = pool[Math.floor(Math.random() * pool.length)];
    renderQuestion(q);
}

// === Preparação do Modo Simulado ===
function prepareSimulated() {
    simQuestions = [];
    simAnswers = [];
    simCategoryScores = {};
    for (const cat in SIM_CONFIG) {
        const questionsCat = shuffleArray(allQuestions.filter(q => q.category === cat));
        simQuestions.push(...questionsCat.slice(0, SIM_CONFIG[cat]));
        simCategoryScores[cat] = 0;
    }
    simQuestions = shuffleArray(simQuestions);
    simIndex = 0;
    answeredQuestions.clear();
    asked = correctCount = wrongCount = 0;
    updateStats();
}

function loadSimQuestion(i) {
    if (!simQuestions[i]) return renderQuestion(null);
    renderQuestion(simQuestions[i]);
}

// === Gerenciamento do Timer ===
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

// === Exibição de Pontuação Final no Simulado ===
function showSimulatedScore(timeout = false) {
    stopTimer();
    const modal = document.getElementById('finalScoreModal');
    let html = `<h2 id="modalTitle">${timeout ? 'Tempo Esgotado!' : 'Simulado Finalizado!'}</h2>`;
    html += `<p>Acertos: <strong>${correctCount}</strong> de ${SIM_TOTAL} (${Math.round((correctCount / SIM_TOTAL) * 100)}%)</p>`;
    html += '<ul>';
    for (const cat in SIM_CONFIG) {
        html += `<li>${cat}: <strong>${simCategoryScores[cat] || 0}</strong> de ${SIM_CONFIG[cat]}</li>`;
    }
    html += '</ul>';
    const aprovado = correctCount >= 82;
    html += `<p class="${aprovado ? 'aprovado' : 'reprovado'}" style="font-size:1.2em">Resultado: ${aprovado ? 'APROVADO 🎉' : 'REPROVADO ❌'}</p>`;
    html += '<h3>Revisão das Respostas</h3>';
    simAnswers.forEach((ans, idx) => {
        const q = ans.question;
        const selected = ans.selected;
        const correct = q.correct;
        const isCorrect = ans.isCorrect;
        html += '<div class="question-review">';
        html += `<p><strong>Pergunta ${idx + 1}:</strong> ${escapeHTML(q.question)}</p>`;
        if (q.questionImage) {
            html += `<img src="${escapeHTML(q.questionImage)}" alt="Imagem da pergunta ${idx + 1}" style="max-width:100%; border-radius:0.5rem; margin:0.5rem 0;">`;
        }
        html += `<p><strong>Sua resposta:</strong> ${selected.length ? selected.map(l => `${l}: ${escapeHTML(q.options[l] || '—')}`).join(', ') : 'Nenhuma selecionada'}</p>`;
        html += `<p><strong>Resposta correta:</strong> ${correct.map(l => `${l}: ${escapeHTML(q.options[l] || '—')}`).join(', ')}</p>`;
        html += `<p><strong>Explicação:</strong> ${escapeHTML(q.explanation || 'Sem explicação.')}</p>`;
        html += `<p><strong>Resultado:</strong> <span class="${isCorrect ? 'aprovado' : 'reprovado'}">${isCorrect ? 'Correta ✔' : 'Errada ✖'}</span></p>`;
        html += '</div>';
    });
    html += '<button class="btn-primary" id="closeScoreBtn" tabindex="0">Fechar</button>';
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
        document.getElementById('modeIndicator').innerHTML = 'Modo: <strong>Quiz</strong>';
        asked = correctCount = wrongCount = 0;
        updateStats();
        updateStatsInlineVisibility();
        updateActionsInlineVisibility();
        nextQuestion();
    };
}

// === Eventos ===
document.getElementById('btnQuiz').addEventListener('click', () => {
    mode = 'quiz';
    document.getElementById('modeIndicator').innerHTML = 'Modo: <strong>Quiz</strong>';
    stopTimer();
    document.getElementById('timerDisplay').textContent = '--:--:--';
    asked = correctCount = wrongCount = 0;
    updateStats();
    document.getElementById('btnQuiz').setAttribute('aria-pressed', 'true');
    document.getElementById('btnSimulado').setAttribute('aria-pressed', 'false');
    updateStatsInlineVisibility();
    updateActionsInlineVisibility();
    nextQuestion();
});

document.getElementById('btnSimulado').addEventListener('click', () => {
    mode = 'simulado';
    document.getElementById('modeIndicator').innerHTML = 'Modo: <strong>Simulado</strong>';
    document.getElementById('btnQuiz').setAttribute('aria-pressed', 'false');
    document.getElementById('btnSimulado').setAttribute('aria-pressed', 'true');
    updateStatsInlineVisibility();
    updateActionsInlineVisibility();
    prepareSimulated();
    startTimer(120 * 60);
    loadSimQuestion(0);
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
    if (mode === 'simulado') {
        prepareSimulated();
        startTimer(120 * 60);
        loadSimQuestion(0);
    } else {
        nextQuestion();
    }
});

document.getElementById('categorySelect').addEventListener('change', () => {
    if (mode === 'quiz') nextQuestion();
});

// === Inicialização ===
loadSheet();
updateStatsInlineVisibility();
updateActionsInlineVisibility();
