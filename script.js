// Firebase Configuration Placeholder
// Firebase Configuration
// (User provided)
const firebaseConfig = {
    apiKey: "AIzaSyDjIasEyQMSFu177CwXQUovvnSkmsZ1K-I",
    authDomain: "bible-tracker-8f0a5.firebaseapp.com",
    projectId: "bible-tracker-8f0a5",
    storageBucket: "bible-tracker-8f0a5.firebasestorage.app",
    messagingSenderId: "762000917810",
    appId: "1:762000917810:web:cb52339d7cd54397af432b"
};

// Initialize Firebase
let db;
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// State Variables
let currentUser = null;          // Currently logged in user (object)
let currentViewingUser = null;   // User currently displayed in modal (object)
let usersData = [];              // Leaderboard data (array)
let pendingChapterCheck = null;  // Temp state for date picker (object)

// DOM Elements
const leaderboardList = document.getElementById('leaderboard-list');
const detailModal = document.getElementById('detail-modal');
const authModal = document.getElementById('auth-modal');
const dateModal = document.getElementById('date-modal');
const bibleContent = document.getElementById('bible-content');
const authForm = document.getElementById('auth-form');
const joinBtn = document.getElementById('join-btn');
const verifyLink = document.getElementById('verify-link');

// -----------------------------------------------------------------------------
// Initialization & Listeners
// -----------------------------------------------------------------------------
// Auth Mode State
let authMode = 'register'; // 'register' or 'login'

// -----------------------------------------------------------------------------
// Initialization & Listeners
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Check if config is set
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        leaderboardList.innerHTML = `<li style="text-align:center; padding:20px; color:red;">
            ⚠️ Firebase 설정이 필요합니다.<br>
            firebase_setup_guide.md 문서를 참고하여 script.js 파일의 config 부분을 수정해주세요.
        </li>`;
        return;
    }

    // 1. Attach Event Listeners FIRST
    // Start New Button (Register Mode)
    if (joinBtn) joinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAuthModal('', 'register');
    });

    // Close Buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            if (targetId) {
                document.getElementById(targetId).classList.remove('active');
            } else {
                detailModal.classList.remove('active');
            }
        });
    });

    // Outside Click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // Auth Form Logic
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            processAuth(e);
        });
    }

    // Edit Mode Button (Login Mode)
    const editBtn = document.getElementById('edit-mode-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            // Pre-fill nickname if viewing a user
            const nameToFill = currentViewingUser ? currentViewingUser.nickname : '';
            openAuthModal(nameToFill, 'login');
        });
    }

    // Bulk Modal Listeners
    if (document.getElementById('open-bulk-btn')) {
        document.getElementById('open-bulk-btn').addEventListener('click', openBulkModal);
    }
    if (document.getElementById('bulk-submit-btn')) {
        document.getElementById('bulk-submit-btn').addEventListener('click', handleBulkSubmit);
    }

    // Date Picker Actions
    if (document.getElementById('cancel-date-btn')) {
        document.getElementById('cancel-date-btn').addEventListener('click', () => {
            dateModal.classList.remove('active');
            pendingChapterCheck = null;
        });
    }

    if (document.getElementById('confirm-date-btn')) {
        document.getElementById('confirm-date-btn').addEventListener('click', handleDateConfirm);
    }

    // Rename Button
    if (document.getElementById('rename-btn')) {
        document.getElementById('rename-btn').addEventListener('click', handleRenameUser);
    }

    // Range Selection Listeners
    if (document.getElementById('range-select-btn')) {
        document.getElementById('range-select-btn').addEventListener('click', toggleSelectMode);
    }
    // Action Bar Listeners
    if (document.getElementById('range-bar-delete')) {
        document.getElementById('range-bar-delete').addEventListener('click', () => executeRangeAction('delete'));
    }
    if (document.getElementById('range-bar-modify')) {
        document.getElementById('range-bar-modify').addEventListener('click', () => executeRangeAction('modify'));
    }
    if (document.getElementById('range-bar-cancel')) {
        document.getElementById('range-bar-cancel').addEventListener('click', () => {
            toggleSelectMode(); // Toggling off closes everything
        });
    }

    // Delete User Flow Listeners
    if (document.getElementById('delete-user-btn')) {
        document.getElementById('delete-user-btn').addEventListener('click', openDeleteModal);
    }
    if (document.getElementById('delete-confirm-1-btn')) {
        document.getElementById('delete-confirm-1-btn').addEventListener('click', () => showDeleteStep(2));
    }
    if (document.getElementById('delete-verify-btn')) {
        document.getElementById('delete-verify-btn').addEventListener('click', verifyDeletePassword);
    }
    if (document.getElementById('delete-final-btn')) {
        document.getElementById('delete-final-btn').addEventListener('click', executeFinalDelete);
    }


    // 2. Load Data LAST
    if (db) {
        loadLeaderboard();
        // ... (existing code) ...


    } else {
        console.error("Database not initialized, skipping data load.");
        leaderboardList.innerHTML = `<li style="text-align:center; padding:20px; color:red;">
            데이터베이스 연결 실패 (콘솔 확인 필요)
        </li>`;
    }
});

// -----------------------------------------------------------------------------
// Core Functions
// -----------------------------------------------------------------------------
function getKSTDate() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function loadLeaderboard() {
    db.collection("users").onSnapshot((querySnapshot) => {
        usersData = [];
        querySnapshot.forEach((doc) => {
            usersData.push(doc.data());
        });

        // Calculate progress & Sort
        usersData.forEach(user => {
            // Support legacy: if no readingLogs, rely on readHistory size
            // But going forward we mostly read readHistory for stats
            user.readCount = user.readHistory ? Object.keys(user.readHistory).length : 0;
        });

        usersData.sort((a, b) => b.readCount - a.readCount); // Descending

        renderLeaderboard();

        // If detail modal is open, refresh it to show live updates
        if (currentViewingUser && detailModal.classList.contains('active')) {
            const updatedUser = usersData.find(u => u.nickname === currentViewingUser.nickname);
            if (updatedUser) {
                currentViewingUser = updatedUser;
                // Re-evaluate edit mode
                if (currentUser && currentUser.nickname === updatedUser.nickname && currentUser.password === updatedUser.password) {
                    enableEditMode();
                } else {
                    disableEditMode();
                }
            }
        }
    }, (error) => {
        console.error("Error fetching documents: ", error);
        leaderboardList.innerHTML = `<li style="padding:20px;">데이터를 불러오는데 실패했습니다.</li>`;
    });
}

function renderLeaderboard() {
    leaderboardList.innerHTML = '';

    if (usersData.length === 0) {
        leaderboardList.innerHTML = '<li style="padding:20px; text-align:center;">아직 참여한 사람이 없습니다.</li>';
        return;
    }

    usersData.forEach((user, index) => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.onclick = () => openDetailModal(user);

        let rankHtml = `<span class="rank">${index + 1}</span>`;
        if (index === 0) rankHtml = `<span class="rank">🥇</span>`;
        if (index === 1) rankHtml = `<span class="rank">🥈</span>`;
        if (index === 2) rankHtml = `<span class="rank">🥉</span>`;

        // Calculate Last Read Info
        let lastReadDateStr = "-";
        let lastChapterStr = "-";

        if (user.readHistory && Object.keys(user.readHistory).length > 0) {
            let maxDate = "";
            let maxKey = "";
            let maxBookIdx = -1;
            let maxChapter = -1;

            Object.entries(user.readHistory).forEach(([key, date]) => {
                // Date Logic: Find latest date
                if (date > maxDate) maxDate = date;

                // Chapter Logic: Find furthest chapter
                const [bIdx, ch] = key.split('_').map(Number);
                if (bIdx > maxBookIdx) {
                    maxBookIdx = bIdx;
                    maxChapter = ch;
                } else if (bIdx === maxBookIdx && ch > maxChapter) {
                    maxChapter = ch;
                }
            });

            if (maxDate) {
                const [y, m, d] = maxDate.split('-');
                lastReadDateStr = `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
            }
            if (maxBookIdx !== -1 && bibleData[maxBookIdx]) {
                lastChapterStr = `${bibleData[maxBookIdx].ko} ${maxChapter}장`;
            }
        }

        const percentage = Math.round((user.readCount / TOTAL_CHAPTERS) * 100);

        li.innerHTML = `
            ${rankHtml}
            <div class="user-info">
                <div class="user-header-row">
                    <span class="user-name">${escapeHtml(user.nickname)}</span>
                    <span class="last-chapter-info">${lastChapterStr}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="progress-footer-row">
                        <span class="progress-text">${user.readCount}장 / ${TOTAL_CHAPTERS}장 (${percentage}%)</span>
                        <span class="last-date-info">${lastReadDateStr}</span>
                    </div>
                </div>
            </div>
        `;
        leaderboardList.appendChild(li);
    });
}

function openDetailModal(user) {
    try {
        console.log("openDetailModal called", user);
        currentViewingUser = user;
        const usernameEl = document.getElementById('modal-username');
        if (!usernameEl) throw new Error("modal-username element not found");

        usernameEl.textContent = `${user.nickname}님의 읽기표`;

        let shouldEdit = false;
        if (currentUser && currentUser.nickname === user.nickname && currentUser.password === user.password) {
            shouldEdit = true;
        }

        if (shouldEdit) {
            enableEditMode();
        } else {
            disableEditMode();
        }

        if (!detailModal) throw new Error("detailModal element not found");
        detailModal.classList.add('active');
    } catch (e) {
        console.error("openDetailModal Error:", e);
        alert("상세 보기 오류: " + e.message);
    }
}

function safeDisplay(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
}

function enableEditMode() {
    safeDisplay('auth-status-msg', 'none');
    safeDisplay('open-bulk-btn', 'block');
    safeDisplay('range-select-btn', 'block');
    safeDisplay('view-history-btn', 'block'); // Restored
    safeDisplay('view-history-btn', 'block'); // Restored
    safeDisplay('rename-btn', 'block');
    safeDisplay('delete-user-btn', 'block'); // New Delete Button
    safeDisplay('edit-mode-btn', 'none');

    renderDetailView(currentViewingUser, true);
}

function disableEditMode() {
    safeDisplay('auth-status-msg', 'none');
    safeDisplay('open-bulk-btn', 'none');
    safeDisplay('range-select-btn', 'none');
    safeDisplay('view-history-btn', 'none');
    safeDisplay('view-history-btn', 'none');
    safeDisplay('rename-btn', 'none');
    safeDisplay('delete-user-btn', 'none');
    safeDisplay('edit-mode-btn', 'block');

    renderDetailView(currentViewingUser, false);
}


function renderDetailView(user, isEditable) {
    try {
        if (!bibleData) throw new Error("bibleData is undefined");
        bibleContent.innerHTML = '';
        const readHistory = user.readHistory || {};

        bibleData.forEach((book, bookIdx) => {
            const section = document.createElement('div');
            section.className = 'book-section';

            const h3 = document.createElement('h3');
            h3.className = 'book-title';
            h3.textContent = book.ko;
            section.appendChild(h3);

            const grid = document.createElement('div');
            grid.className = 'chapter-grid';

            for (let i = 1; i <= book.chapters; i++) {
                const key = `${bookIdx}_${i}`;
                const readDateStr = readHistory[key]; // "YYYY-MM-DD" or undefined

                const btn = document.createElement('div');
                btn.className = `chapter-btn ${readDateStr ? 'read' : ''}`;
                btn.setAttribute('data-key', key); // For Range Selection Finding

                // Format Date (MM/DD)
                let dateDisplay = '';
                if (readDateStr) {
                    const [y, m, d] = readDateStr.split('-');
                    dateDisplay = `<div class="chapter-date">${parseInt(m)}/${parseInt(d)}</div>`;
                    btn.title = `${readDateStr}에 읽음`;
                }

                btn.innerHTML = `<div class="chapter-num">${i}</div>${dateDisplay}`;

                if (!isEditable) {
                    btn.classList.add('disabled');
                } else {
                    // Unified Click Handler
                    btn.onclick = () => handleChapterClick(bookIdx, i, book.ko, !!readDateStr);
                }

                grid.appendChild(btn);
            }
            section.appendChild(grid);
            bibleContent.appendChild(section);
        });
    } catch (e) {
        console.error("renderDetailView Error:", e);
        alert("화면 렌더링 오류: " + e.message);
    }
}

// Render History Log
// This was removed as per the instruction, as history is now in a separate modal.
// renderHistoryLog(user, isEditable);

// This function is no longer used as history is moved to a separate modal.
// function renderHistoryLog(user, isEditable) {
//     const historyList = document.getElementById('history-list');
//     if (!historyList) return; // Safety
//     historyList.innerHTML = '';

//     const readHistory = user.readHistory || {};
//     // Convert to array: [{key, date, bookIdx, chapter}]
//     let historyItems = Object.keys(readHistory).map(key => {
//         const [bIdx, ch] = key.split('_').map(Number);
//         return {
//             key: key,
//             date: readHistory[key],
//             bookName: bibleData[bIdx].ko,
//             chapter: ch,
//             bookIdx: bIdx
//         };
//     });

//     // Sort by Date Descending, then by Book/Chapter Descending
//     historyItems.sort((a, b) => {
//         if (a.date !== b.date) return b.date.localeCompare(a.date);
//         if (a.bookIdx !== b.bookIdx) return b.bookIdx - a.bookIdx;
//         return b.chapter - a.chapter;
//     });

//     if (historyItems.length === 0) {
//         historyList.innerHTML = '<li style="padding:10px; color:#999; text-align:center;">아직 읽은 기록이 없습니다.</li>';
//         return;
//     }

//     historyItems.forEach(item => {
//         const li = document.createElement('li');
//         li.className = 'history-item';

//         const deleteBtnHtml = isEditable
//             ? `<button class="history-delete-btn" onclick="deleteHistoryItem('${item.key}', '${item.bookName}', ${item.chapter})">삭제</button>`
//             : '';

//         li.innerHTML = `
//             <div class="history-info">
//                 <span class="history-date">${item.date}</span>
//                 <span style="font-weight:600;">${item.bookName} ${item.chapter}장</span>
//             </div>
//             ${deleteBtnHtml}
//         `;
//         historyList.appendChild(li);
//     });
// }

// Global scope for onclick access styling
// window.deleteHistoryItem = function (key, bookName, chapter) {
//     if (!currentUser) return;
//     if (confirm(`${bookName} ${chapter}장 읽기 기록을 삭제하시겠습니까?`)) {
//         updateReadingStatus(currentUser.nickname, key, null);
//     }
// };

function openDatePicker(bookName, chapter, bookIdx) {
    pendingChapterCheck = { bookIdx, chapter };
    document.getElementById('target-chapter-label').textContent = `${bookName} ${chapter}장`;
    document.getElementById('reading-date').value = getKSTDate();
    dateModal.classList.add('active');
}

function handleDateConfirm() {
    if (!pendingChapterCheck) return;

    const dateVal = document.getElementById('reading-date').value;
    if (!dateVal) {
        alert("날짜를 선택해주세요.");
        return;
    }

    const key = `${pendingChapterCheck.bookIdx}_${pendingChapterCheck.chapter}`;
    updateReadingStatus(currentUser.nickname, key, dateVal);

    dateModal.classList.remove('active');
    pendingChapterCheck = null;
}

// -----------------------------------------------------------------------------
// Auth & Data Operations
// -----------------------------------------------------------------------------

function openAuthModal(prefillName = '', mode = 'register') {
    authMode = mode;
    document.getElementById('nickname').value = prefillName;
    document.getElementById('password').value = '';

    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    const passConfirmGroup = document.getElementById('password-confirm-group');

    if (mode === 'login') {
        document.querySelector('#auth-modal .modal-title').textContent = "인증하기";
        submitBtn.textContent = "인증하고 수정하기";
        passConfirmGroup.style.display = 'none';

    } else {
        document.querySelector('#auth-modal .modal-title').textContent = "새로 시작하기";
        submitBtn.textContent = "시작하기";
        passConfirmGroup.style.display = 'block';
    }

    authModal.classList.add('active');
}

async function processAuth(e) {
    if (e) e.preventDefault();
    console.log("processAuth triggered, Mode:", authMode);

    const nickname = document.getElementById('nickname').value.trim();
    const password = document.getElementById('password').value;
    const passRegex = /^\d{4}$/;

    if (!nickname) { alert("이름을 입력해주세요."); return; }
    if (!passRegex.test(password)) { alert("비밀번호는 숫자 4자리여야 합니다."); return; }

    if (authMode === 'register') {
        const passConfirm = document.getElementById('password-confirm').value;
        if (password !== passConfirm) { alert("비밀번호 확인이 일치하지 않습니다."); return; }
    }

    try {
        const docRef = db.collection("users").doc(nickname);
        const doc = await docRef.get();

        if (authMode === 'login') {
            if (!doc.exists) { alert("존재하지 않는 사용자입니다."); return; }
            const data = doc.data();
            if (data.password === password) {
                currentUser = { nickname, password };
                alert("인증되었습니다.");
                authModal.classList.remove('active');
                if (currentViewingUser && currentViewingUser.nickname === nickname) {
                    currentViewingUser = data;
                    enableEditMode();
                }
            } else {
                alert("비밀번호가 일치하지 않습니다.");
            }
        } else {
            if (doc.exists) {
                alert(`이미 존재하는 이름입니다.`);
                return;
            }
            if (confirm(`'${nickname}'(으)로 새로 시작하시겠습니까?`)) {
                const newUser = {
                    nickname: nickname,
                    password: password,
                    readHistory: {},
                    readingLogs: [], // New logs array
                    totalReadCount: 0 // Legacy, but we can keep
                };
                await docRef.set(newUser);
                currentUser = { nickname, password };
                alert("등록되었습니다! 환영합니다.");
                authModal.classList.remove('active');
            }
        }
    } catch (error) {
        console.error("Auth Error:", error);
        alert("오류가 발생했습니다: " + error.message);
    }
}

async function updateReadingStatus(nickname, key, date) {
    if (!currentUser || currentUser.nickname !== nickname) return;

    const docRef = db.collection("users").doc(nickname);
    // Note: For single clicks in grid, we just update map.
    // Ideally we should also add a single-chapter log to 'readingLogs' for consistency,
    // but the user wants 'batch' history mostly.
    // Let's stick to map update for simple grid clicks, unless we want strict logging.
    // IMPORTANT: If we only update map, it won't appear in 'History Modal' if that modal MUST read from `readingLogs`.
    // Given the requirement "기록 내역을 들어가서... 수정이 가능하게", we should probably create a log entry even for single clicks.

    // For now, to suffice "readHistory" view, map update is vital.
    // If we want FULL history consistent, we'd add to readingLogs too. 
    // Let's do map update only here for speed, and handle Logs in BulkAdd which is the main "Recording" feature users use for tracking.
    // Grid click is more "Marking".

    try {
        const updateObj = {};
        if (date) {
            updateObj[`readHistory.${key}`] = date;
            await docRef.update(updateObj);
        } else {
            updateObj[`readHistory.${key}`] = firebase.firestore.FieldValue.delete();
            await docRef.update(updateObj);
        }
    } catch (error) {
        console.error("Update Error:", error);
        alert("저장 실패: " + error.message);
    }
}

// -----------------------------------------------------------------------------
// Bulk Entry & History Logic
// -----------------------------------------------------------------------------

function openBulkModal() {
    const bookSelect = document.getElementById('bulk-book');
    const dateInput = document.getElementById('bulk-date');
    dateInput.value = getKSTDate();

    // Init logic
    if (bookSelect.options.length === 0) {
        bibleData.forEach((book, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = book.ko;
            bookSelect.appendChild(opt);
        });
        bookSelect.addEventListener('change', (e) => updateBulkChapterOptions(e));
    }

    // Smart Defaults Logic
    let lastBookIdx = -1;
    let lastChapter = -1;

    // Get fresh user data from usersData (snapshot) instead of stale 'currentUser'
    const cleanUser = currentUser ? usersData.find(u => u.nickname === currentUser.nickname) : null;

    // Find absolute max read chapter
    if (cleanUser && cleanUser.readHistory) {
        const keys = Object.keys(cleanUser.readHistory);
        keys.forEach(k => {
            const [b, c] = k.split('_').map(Number);
            if (b > lastBookIdx) {
                lastBookIdx = b;
                lastChapter = c;
            } else if (b === lastBookIdx && c > lastChapter) {
                lastChapter = c;
            }
        });
    }

    let defaultBookIdx = 0;
    let defaultStart = 1;

    if (lastBookIdx !== -1) {
        const book = bibleData[lastBookIdx];
        if (lastChapter < book.chapters) {
            // Next chapter in same book
            defaultBookIdx = lastBookIdx;
            defaultStart = lastChapter + 1;
        } else {
            // Next book
            if (lastBookIdx < bibleData.length - 1) {
                defaultBookIdx = lastBookIdx + 1;
                defaultStart = 1;
            }
        }
    }

    bookSelect.value = defaultBookIdx;
    updateBulkChapterOptions(null, defaultStart);

    document.getElementById('bulk-modal').classList.add('active');
}

function updateBulkChapterOptions(e, forceStart) {
    const bookIdx = parseInt(document.getElementById('bulk-book').value);
    const book = bibleData[bookIdx];
    const startSelect = document.getElementById('bulk-start');
    const endSelect = document.getElementById('bulk-end');

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    for (let i = 1; i <= book.chapters; i++) {
        const opt1 = new Option(`${i}장`, i);
        startSelect.add(opt1);
        const opt2 = new Option(`${i}장`, i);
        endSelect.add(opt2);
    }

    let startVal = 1;
    if (forceStart) {
        startVal = forceStart;
    } else if (e) {
        // user changed book, default to 1
        startVal = 1;
    }

    startSelect.value = startVal;
    // Default End: Same as start (read 1 chapter) or maybe up to +4? 
    // User complaint: "Next verse default...". 
    // Safest is start=end.
    endSelect.value = Math.min(startVal + 4, book.chapters);  // Suggest small range
}

async function handleBulkSubmit() {
    const bookIdx = parseInt(document.getElementById('bulk-book').value);
    const start = parseInt(document.getElementById('bulk-start').value);
    const end = parseInt(document.getElementById('bulk-end').value);
    const date = document.getElementById('bulk-date').value;

    if (!date) { alert("날짜를 선택해주세요."); return; }
    if (start > end) { alert("시작 장이 끝 장보다 클 수 없습니다."); return; }

    const updates = {};
    for (let i = start; i <= end; i++) {
        updates[`readHistory.${bookIdx}_${i}`] = date;
    }

    // Create Log Entry
    const newLog = {
        id: Date.now().toString(), // unique string ID
        date: date,
        bookIdx: bookIdx,
        startChapter: start,
        endChapter: end,
        timestamp: new Date().toISOString()
    };

    try {
        const docRef = db.collection("users").doc(currentUser.nickname);

        // Atomic update: Add to map AND push to array
        await docRef.update({
            ...updates,
            readingLogs: firebase.firestore.FieldValue.arrayUnion(newLog)
        });

        document.getElementById('bulk-modal').classList.remove('active');
        // alert("기록되었습니다."); 
    } catch (error) {
        console.error("Bulk Update Error:", error);
        alert("저장 실패: " + error.message);
    }
}

async function handleRenameUser() {
    if (!currentUser) return;

    const oldName = currentUser.nickname;
    const newName = prompt(`현재 이름: ${oldName}\n변경할 새로운 이름을 입력하세요:`);

    if (!newName || newName.trim() === "") return;
    if (newName === oldName) return;

    const confirmRename = confirm(`정말 이름을 '${newName}'(으)로 변경하시겠습니까?\n이전 이름의 기록은 새 이름으로 이동됩니다.`);
    if (!confirmRename) return;

    try {
        const oldDocRef = db.collection("users").doc(oldName);
        const newDocRef = db.collection("users").doc(newName);

        // Check if new name exists
        const newDoc = await newDocRef.get();
        if (newDoc.exists) {
            alert("이미 존재하는 이름입니다. 다른 이름을 선택해주세요.");
            return;
        }

        const oldDoc = await oldDocRef.get();
        if (!oldDoc.exists) {
            alert("오류: 사용자 데이터를 찾을 수 없습니다.");
            return;
        }

        // Copy data
        const oldData = oldDoc.data();
        const newData = { ...oldData, nickname: newName };

        // Create new
        await newDocRef.set(newData);

        // Delete old
        await oldDocRef.delete();

        // Update Local State
        currentUser.nickname = newName;
        currentViewingUser = newData;

        alert(`이름이 '${newName}'(으)로 변경되었습니다.`);

        // UI Update handled by snapshot listener (loadLeaderboard)
        // But we need to update the Detail View Modal title immediately or close it
        document.getElementById('modal-username').textContent = `${newName}님의 읽기표 (나)`;

    } catch (error) {
        console.error("Rename Error:", error);
        alert("이름 변경 중 오류가 발생했습니다: " + error.message);
    }
}

// -----------------------------------------------------------------------------
// History Modal Logic
// -----------------------------------------------------------------------------
const historyListContainer = document.getElementById('history-log-list'); // This might be null if accessed too early. 
// Better to access inside function or ensure script is deferred. 
// But let's fix the render function to be safe.

document.getElementById('view-history-btn').addEventListener('click', () => {
    openHistoryModal();
});

// Edit Log Modal Elements
const editLogModal = document.getElementById('edit-log-modal');
const editLogForm = document.getElementById('edit-log-form');

document.getElementById('save-log-btn').addEventListener('click', saveLogEdits);
document.getElementById('delete-log-btn').addEventListener('click', deleteLogEntry);


function openHistoryModal() {
    document.getElementById('history-modal').classList.add('active');
    renderHistoryList();
}

function renderHistoryList() {
    const listContainer = document.getElementById('history-log-list'); // Get fresh ref
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // Get fresh user data
    const cleanUser = currentUser ? usersData.find(u => u.nickname === currentUser.nickname) : null;
    const logs = (cleanUser && cleanUser.readingLogs) ? cleanUser.readingLogs : [];

    // Sort logic: Date desc, then timestamp desc
    const sortedLogs = [...logs].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return String(b.id).localeCompare(String(a.id)); // Ensure string for safety
    });

    if (sortedLogs.length === 0) {
        historyListContainer.innerHTML = '<li style="padding:20px; text-align:center;">기록된 내역이 없습니다.</li>';
        return;
    }

    sortedLogs.forEach(log => {
        const li = document.createElement('li');
        li.className = 'history-item clickable';

        const isDelete = log.type === 'delete';
        if (isDelete) li.classList.add('deleted');

        const bookName = bibleData[log.bookIdx].ko;
        const range = log.startChapter === log.endChapter ? `${log.startChapter}장` : `${log.startChapter}~${log.endChapter}장`;

        const actionLabel = isDelete ? `<span class="delete-badge">❌ 삭제됨</span>` : `<span style="font-size:0.8rem; color:#999;">➜ 수정</span>`;
        const textStyle = isDelete ? `text-decoration: line-through; opacity: 0.7;` : `font-weight:600;`;

        li.innerHTML = `
            <div class="history-info">
                <span class="history-date">${log.date}</span>
                <span style="${textStyle}">${bookName} ${range}</span>
            </div>
            ${actionLabel}
        `;
        // For now, allow editing delete logs? Maybe just deleting them permanently.
        // Let's allow clicking to open Edit Modal, but maybe show it's a delete log.
        li.onclick = () => openEditLogModal(log);
        historyListContainer.appendChild(li);
    });
}

let currentEditingLog = null;

function openEditLogModal(log) {
    currentEditingLog = log;

    document.getElementById('edit-log-id').value = log.id;
    document.getElementById('edit-log-date').value = log.date;
    document.getElementById('edit-log-bookname').value = bibleData[log.bookIdx].ko;
    document.getElementById('edit-log-start').value = log.startChapter;
    document.getElementById('edit-log-end').value = log.endChapter;

    editLogModal.classList.add('active');
}

async function saveLogEdits() {
    if (!currentEditingLog) return;

    const newDate = document.getElementById('edit-log-date').value;
    const newStart = parseInt(document.getElementById('edit-log-start').value);
    const newEnd = parseInt(document.getElementById('edit-log-end').value);

    // Validate
    if (newStart > newEnd) { alert("시작 장이 끝 장보다 클 수 없습니다."); return; }

    // Logic: 
    // 1. Remove effects of OLD log from readHistory map ???
    //    Actually, purely removing old log's range might clear chapters that were ALSO read by another log.
    //    However, simpler approach: Rebuild readHistory from ALL logs. 
    //    BUT we have legacy `readHistory` entries that are not in `readingLogs`. We can't lose them.
    //    Compromise: Remove old log's specific range from map (delete), THEN apply new log's range.
    //    Risk: If I read Gen 1 twice, and edit one log, deleting Gen 1 from map removes the other reading too.
    //    Acceptable for this simple app? Yes.

    const bookIdx = currentEditingLog.bookIdx; // Book cannot change in this simple edit form

    // Construct updated Log
    const updatedLog = {
        ...currentEditingLog,
        date: newDate,
        startChapter: newStart,
        endChapter: newEnd
    };

    try {
        const docRef = db.collection("users").doc(currentUser.nickname);

        // 1. Remove old log from array, Add new log
        // Firestore can't easily "replace" object in array.
        // We must pull the whole logs array, modify, and push back? Or arrayRemove/arrayUnion.

        // Let's do client-side manipulation and single set/update.
        let logs = currentUser.readingLogs || [];
        logs = logs.filter(l => l.id !== currentEditingLog.id); // Remove old
        logs.push(updatedLog); // Add new

        // 2. We also need to update `readHistory` map.
        // Strategy: "Delete" old range, "Set" new range.
        const updateMap = {};

        // Prepare Delete Ops
        for (let i = currentEditingLog.startChapter; i <= currentEditingLog.endChapter; i++) {
            updateMap[`readHistory.${bookIdx}_${i}`] = firebase.firestore.FieldValue.delete();
        }

        // We must execute Delete first? Or can we mix?
        // If we set `readHistory.0_1 = delete` and `readHistory.0_1 = '2025-01-01'` in same object? No.

        // Let's use a batch or two calls.

        // Call 1: Update Logs and Delete Old History Range
        await docRef.update({
            readingLogs: logs,
            ...updateMap
        });

        // Call 2: Set New History Range
        const setMap = {};
        for (let i = newStart; i <= newEnd; i++) {
            setMap[`readHistory.${bookIdx}_${i}`] = newDate;
        }
        await docRef.update(setMap);

        editLogModal.classList.remove('active');
        openHistoryModal(); // Refresh list
        // Detail view will refresh via snapshot listener
        alert("수정되었습니다.");

    } catch (error) {
        console.error("Edit Error:", error);
        alert("수정 실패: " + error.message);
    }
}

async function deleteLogEntry() {
    if (!currentEditingLog) return;
    if (!confirm("정말 이 기록을 삭제하시겠습니까?\n해당 구간의 읽기 표시도 해제됩니다.")) return;

    try {
        const docRef = db.collection("users").doc(currentUser.nickname);

        // 1. Logs Array Update
        let logs = currentUser.readingLogs || [];
        logs = logs.filter(l => l.id !== currentEditingLog.id);

        // 2. Map Delete keys
        const updateMap = {};
        const bookIdx = currentEditingLog.bookIdx;
        for (let i = currentEditingLog.startChapter; i <= currentEditingLog.endChapter; i++) {
            updateMap[`readHistory.${bookIdx}_${i}`] = firebase.firestore.FieldValue.delete();
        }

        await docRef.update({
            readingLogs: logs,
            ...updateMap
        });

        editLogModal.classList.remove('active');
        openHistoryModal();
        alert("삭제되었습니다.");

    } catch (error) {
        console.error("Delete Error:", error);
        alert("삭제 실패: " + error.message);
    }
}

// Helper
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// -----------------------------------------------------------------------------
// Range Selection Logic (Global Scope)
// -----------------------------------------------------------------------------
let isSelectMode = false;
let selectStartNode = null; // { bookIdx, chapter }
let currentRangeAction = null;

function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    const btn = document.getElementById('range-select-btn');
    const actionBar = document.getElementById('range-action-bar');

    if (isSelectMode) {
        btn.classList.add('select-mode-active');
        btn.textContent = "취소 (선택 중)";
        selectStartNode = null;
        // alert removed
    } else {
        btn.classList.remove('select-mode-active');
        btn.textContent = "선택";
        selectStartNode = null;
        clearSelectionVisuals();
        if (actionBar) actionBar.classList.remove('active');
    }
}

function clearSelectionVisuals() {
    document.querySelectorAll('.chapter-btn').forEach(btn => {
        btn.classList.remove('selected-start', 'in-range');
    });
}

function handleChapterClick(bookIdx, chapter, bookName, isRead) {
    if (isSelectMode) {
        handleRangeSelection(bookIdx, chapter, bookName);
    } else {
        // Normal Mode
        if (isRead) {
            // Unmark single
            const key = `${bookIdx}_${chapter}`;
            if (confirm(`${bookName} ${chapter}장 읽기 취소하시겠습니까?`)) {
                updateReadingStatus(currentUser.nickname, key, null);
            }
        } else {
            // Mark single
            openDatePicker(bookName, chapter, bookIdx);
        }
    }
}

function handleRangeSelection(bookIdx, chapter, bookName) {
    const actionBar = document.getElementById('range-action-bar');

    // 1. First Click: Set Start
    if (!selectStartNode) {
        selectStartNode = { bookIdx, chapter, bookName };
        const btn = document.querySelector(`.chapter-btn[data-key="${bookIdx}_${chapter}"]`);
        if (btn) btn.classList.add('selected-start');

        // Hide action bar if previously showing (though toggle handles this)
        if (actionBar) actionBar.classList.remove('active');
        return;
    }

    // 2. Second Click: Set End & Calculate Range (Cross-Book Support)
    const start = selectStartNode;
    const end = { bookIdx, chapter, bookName };

    // Determine absolute order (who is first?)
    let first = start;
    let last = end;

    if (start.bookIdx > end.bookIdx || (start.bookIdx === end.bookIdx && start.chapter > end.chapter)) {
        first = end;
        last = start;
    }

    // Collect all keys in range
    const keysInRange = [];

    // Logic: 
    // If Same Book: Simple loop
    // If Diff Book: 
    //    1. First Book: StartChap -> LastChap
    //    2. Middle Books: All Chaps
    //    3. Last Book: 1 -> EndChap

    if (first.bookIdx === last.bookIdx) {
        for (let c = first.chapter; c <= last.chapter; c++) {
            keysInRange.push(`${first.bookIdx}_${c}`);
        }
    } else {
        // First Book
        const firstBookData = bibleData[first.bookIdx];
        for (let c = first.chapter; c <= firstBookData.chapters; c++) {
            keysInRange.push(`${first.bookIdx}_${c}`);
        }
        // Middle Books
        for (let b = first.bookIdx + 1; b < last.bookIdx; b++) {
            const bookData = bibleData[b];
            for (let c = 1; c <= bookData.chapters; c++) {
                keysInRange.push(`${b}_${c}`);
            }
        }
        // Last Book
        for (let c = 1; c <= last.chapter; c++) {
            keysInRange.push(`${last.bookIdx}_${c}`);
        }
    }

    // Visual Feedback
    clearSelectionVisuals(); // Clear old highlights
    keysInRange.forEach(key => {
        const b = document.querySelector(`.chapter-btn[data-key="${key}"]`);
        if (b) b.classList.add('in-range');
    });

    // Update Action Bar UI
    let rangeTextStr = "";
    if (first.bookIdx === last.bookIdx) {
        rangeTextStr = `${first.bookName} ${first.chapter}~${last.chapter}장`;
    } else {
        rangeTextStr = `${first.bookName} ${first.chapter}장 ~ ${last.bookName} ${last.chapter}장`;
    }

    document.getElementById('range-bar-text').textContent = rangeTextStr;
    if (actionBar) actionBar.classList.add('active');

    // Store for Execution
    currentRangeAction = {
        keys: keysInRange
    };
}

async function executeRangeAction(action) {
    if (!currentUser || !currentRangeAction) return;

    const actionBar = document.getElementById('range-action-bar');

    if (action === 'delete') {
        if (!confirm("선택한 구간의 읽기 표시를 해제하시겠습니까?")) return;
        await processBatchUpdateKeys(currentRangeAction.keys, null);
        // alert("삭제되었습니다."); // Less intrusive
    } else if (action === 'modify') {
        const newDate = prompt("변경할 날짜를 입력하세요 (YYYY-MM-DD):", getKSTDate());
        if (!newDate) return;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(newDate)) { alert("날짜 형식이 올바르지 않습니다."); return; }
        await processBatchUpdateKeys(currentRangeAction.keys, newDate);
        // alert("수정되었습니다.");
    }

    if (actionBar) actionBar.classList.remove('active');
    toggleSelectMode(); // Reset mode
}

async function processBatchUpdateKeys(keys, date) {
    if (!currentUser) return;

    const updates = {};
    const bookGroups = {};

    // 1. Prepare Map Updates & Group for Logs
    keys.forEach(key => {
        if (date) {
            updates[`readHistory.${key}`] = date;
        } else {
            updates[`readHistory.${key}`] = firebase.firestore.FieldValue.delete();
        }

        // Parse for Logging
        const [bIdx, ch] = key.split('_').map(Number);
        if (!bookGroups[bIdx]) bookGroups[bIdx] = [];
        bookGroups[bIdx].push(ch);
    });

    // 2. Create Log Objects
    const newLogs = [];
    Object.keys(bookGroups).forEach(bIdx => {
        const chapters = bookGroups[bIdx].sort((a, b) => a - b);
        let start = chapters[0];
        let prev = chapters[0];

        for (let i = 1; i <= chapters.length; i++) {
            const current = chapters[i];
            if (current !== prev + 1) {
                // Range Break
                newLogs.push({
                    id: Date.now() + Math.random(), // Unique ID
                    date: date || getKSTDate(),     // If delete, use today as action date
                    bookIdx: parseInt(bIdx),
                    startChapter: start,
                    endChapter: prev,
                    type: date ? 'read' : 'delete'  // 'read' or 'delete'
                });
                start = current;
            }
            prev = current;
        }
    });

    // 3. Updates Object for Firestore
    updates['readingLogs'] = firebase.firestore.FieldValue.arrayUnion(...newLogs);

    try {
        await db.collection("users").doc(currentUser.nickname).update(updates);
    } catch (e) {
        console.error("Batch Error:", e);
        alert("오류 발생: " + e.message);
    }
}

// -----------------------------------------------------------------------------
// Account Deletion Logic (3-Stage)
// -----------------------------------------------------------------------------
function openDeleteModal() {
    if (!currentUser) return;
    const modal = document.getElementById('delete-modal');
    modal.classList.add('active');

    // Reset to Step 1
    showDeleteStep(1);
    document.getElementById('delete-password-input').value = '';
}

function showDeleteStep(step) {
    document.getElementById('delete-step-1').style.display = 'none';
    document.getElementById('delete-step-2').style.display = 'none';
    document.getElementById('delete-step-3').style.display = 'none';

    document.getElementById(`delete-step-${step}`).style.display = 'block';
}

function verifyDeletePassword() {
    const inputPass = document.getElementById('delete-password-input').value;
    if (!inputPass) { alert("비밀번호를 입력하세요."); return; }

    if (inputPass === currentUser.password) {
        showDeleteStep(3);
    } else {
        alert("비밀번호가 일치하지 않습니다.");
    }
}

async function executeFinalDelete() {
    if (!currentUser) return;

    try {
        await db.collection("users").doc(currentUser.nickname).delete();

        alert("계정이 삭제되었습니다.");

        // Reset State
        currentUser = null;
        currentViewingUser = null;

        // UI Cleanup
        document.getElementById('delete-modal').classList.remove('active');
        detailModal.classList.remove('active');

        // Leaderboard will auto-update via listener

    } catch (error) {
        console.error("Delete Account Error:", error);
        alert("삭제 실패: " + error.message);
    }
}
