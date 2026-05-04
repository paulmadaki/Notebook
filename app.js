 // =========================
// app.js
// =========================

let notes = JSON.parse(localStorage.getItem("notes")) || [];
let currentNoteIndex = null;
let uid = null; // signed-in user id

const notesList = document.getElementById("notesList");
const editor = document.getElementById("editor");
const noteTitle = document.getElementById("noteTitle");
const saveBtn = document.getElementById("saveBtn");
const newNoteBtn = document.getElementById("newNoteBtn");
const searchInput = document.getElementById("search");
const charCount = document.getElementById("charCount");
const saveStatus = document.getElementById("saveStatus");
const themeToggle = document.getElementById("themeToggle");
const authBtn = document.getElementById("authBtn");
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const pinBtn = document.getElementById('pinBtn');
const deleteBtn = document.getElementById('deleteBtn');
const restoreBtn = document.getElementById('restoreBtn');
const permDeleteBtn = document.getElementById('permDeleteBtn');
const viewTrashBtn = document.getElementById('viewTrashBtn');

let trash = JSON.parse(localStorage.getItem('trash')) || [];
let viewTrash = false;
let currentTrashIndex = null;
// save mutex to avoid overlapping saves
let saveLock = false;

// sanitize wrapper using DOMPurify when available
function sanitizeHtml(html) {
	if (typeof DOMPurify !== 'undefined' && DOMPurify && DOMPurify.sanitize) return DOMPurify.sanitize(html);
	return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

// -------------------------
// FIREBASE: init (replace with your config)
// -------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB7O1ungw0Pg7W-V09dCi9YEFjB9kR2Vr0",
  authDomain: "notebook-a3e23.firebaseapp.com",
  projectId: "notebook-a3e23",
  storageBucket: "notebook-a3e23.firebasestorage.app",
  messagingSenderId: "204843126209",
  appId: "1:204843126209:web:0d2929eaa56648d5b7b340"

};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(user => {
  if (user) {
    uid = user.uid;
    authBtn.textContent = "Logout";
    syncFromCloud(uid).catch(err => console.error('Sync error', err));
  } else {
    uid = null;
    authBtn.textContent = "Login";
  }
});

// Open modal for auth when not signed-in; sign out when signed in
authBtn.addEventListener('click', () => {
  if (auth.currentUser) {
    auth.signOut();
  } else {
    showAuthModal();
  }
});

// Sidebar toggle behavior for mobile
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    if (sidebarOverlay) {
      if (open) sidebarOverlay.removeAttribute('hidden'); else sidebarOverlay.setAttribute('hidden','');
    }
  });
}
if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    if (sidebar) sidebar.classList.remove('open');
    sidebarOverlay.setAttribute('hidden','');
  });
}

// Auth modal elements
const authModal = document.getElementById('authModal');
const closeAuthBtn = document.getElementById('closeAuthBtn');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const emailSignUpBtn = document.getElementById('emailSignUpBtn');
const emailSignInBtn = document.getElementById('emailSignInBtn');
const resetPwdBtn = document.getElementById('resetPwdBtn');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authMessage = document.getElementById('authMessage');

function showAuthModal() {
  authMessage.textContent = '';
  authEmail.value = '';
  authPassword.value = '';
  authModal.setAttribute('aria-hidden', 'false');
}

function hideAuthModal() {
  authModal.setAttribute('aria-hidden', 'true');
}

closeAuthBtn.addEventListener('click', hideAuthModal);
authModal.addEventListener('click', (e) => { if (e.target === authModal) hideAuthModal(); });

emailSignUpBtn.addEventListener('click', () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) { authMessage.textContent = 'Provide email and password.'; return; }
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => { authMessage.textContent = 'Account created. Signed in.'; hideAuthModal(); })
    .catch(err => { authMessage.textContent = err.message; });
});

emailSignInBtn.addEventListener('click', () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) { authMessage.textContent = 'Provide email and password.'; return; }
  auth.signInWithEmailAndPassword(email, password)
    .then(() => { authMessage.textContent = 'Signed in.'; hideAuthModal(); })
    .catch(err => { authMessage.textContent = err.message; });
});

resetPwdBtn.addEventListener('click', () => {
  const email = authEmail.value.trim();
  if (!email) { authMessage.textContent = 'Enter email to reset password.'; return; }
  auth.sendPasswordResetEmail(email)
    .then(() => { authMessage.textContent = 'Reset email sent.'; })
    .catch(err => { authMessage.textContent = err.message; });
});

googleSignInBtn.addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => { hideAuthModal(); })
    .catch(err => { authMessage.textContent = err.message; });
});

// -------------------------
// RENDER NOTES
// -------------------------
function renderNotes(list = null) {
  notesList.innerHTML = "";

  // Create a rendering list that doesn't mutate the original arrays
  let renderList = list ? [...list] : (viewTrash ? [...trash] : [...notes]);

  // If rendering main notes, show pinned first (sort the copy only)
  if (!viewTrash) {
    renderList.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return new Date(b.updated) - new Date(a.updated);
    });
  }

  renderList.forEach((note) => {
    const li = document.createElement("li");
    if (note.pinned) li.classList.add('pinned');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'note-title';
    titleSpan.textContent = note.title || 'Untitled';

    const meta = document.createElement('span');
    meta.className = 'note-meta';
    meta.textContent = (new Date(note.updated)).toLocaleDateString();

    li.appendChild(titleSpan);
    li.appendChild(meta);

    // highlight currently opened note by comparing stable `created` id
    const current = viewTrash ? trash[currentTrashIndex] : notes[currentNoteIndex];
    if (current && current.created === note.created) {
      li.style.background = 'rgba(0,0,0,0.08)';
    }

    li.addEventListener('click', () => {
      loadNoteById(note.created, viewTrash ? 'trash' : 'notes');
      try {
        if (window.innerWidth <= 768 && sidebar) {
          sidebar.classList.remove('open');
          if (sidebarOverlay) sidebarOverlay.setAttribute('hidden','');
        }
      } catch (e) {}
    });

    notesList.appendChild(li);
  });
}

function loadNoteById(createdId, source = 'notes') {
  if (source === 'trash') {
    const idx = trash.findIndex(n => n.created === createdId);
    if (idx !== -1) loadNote(idx, 'trash');
  } else {
    const idx = notes.findIndex(n => n.created === createdId);
    if (idx !== -1) loadNote(idx, 'notes');
  }
}

// -------------------------
// LOAD NOTE
// -------------------------
function loadNote(index, source = 'notes') {
  if (source === 'trash') {
    const note = trash[index];
    currentTrashIndex = index;

	noteTitle.value = note.title;
	// sanitize content before inserting into DOM
	editor.innerHTML = sanitizeHtml(note.content || '');

    // toolbar state for trash
    pinBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    restoreBtn.style.display = '';
    permDeleteBtn.style.display = '';
  } else {
    const note = notes[index];
    currentNoteIndex = index;

	noteTitle.value = note.title;
	// sanitize content before inserting into DOM
	editor.innerHTML = sanitizeHtml(note.content || '');

    // toolbar state for normal notes
    pinBtn.style.display = '';
    deleteBtn.style.display = '';
    restoreBtn.style.display = 'none';
    permDeleteBtn.style.display = 'none';
  }

  updateCharCount();
  renderNotes();
}

// -------------------------
// NEW NOTE
// -------------------------
newNoteBtn.addEventListener("click", () => {
  currentNoteIndex = null;
  noteTitle.value = "";
  editor.innerHTML = "";
  // ensure we're in notes view when creating a new note
  viewTrash = false;
  if (viewTrashBtn) viewTrashBtn.textContent = 'View Trash';
  // toolbar state
  if (pinBtn) pinBtn.style.display = '';
  if (deleteBtn) deleteBtn.style.display = '';
  if (restoreBtn) restoreBtn.style.display = 'none';
  if (permDeleteBtn) permDeleteBtn.style.display = 'none';

  updateCharCount();
});

// -------------------------
// SAVE NOTE
// -------------------------
async function saveNote() {
  const note = {
    title: noteTitle.value,
    content: editor.innerHTML,
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  if (currentNoteIndex !== null) {
    note.created = notes[currentNoteIndex].created;
    notes[currentNoteIndex] = note;
  } else {
    notes.push(note);
    currentNoteIndex = notes.length - 1;
  }

	// show saving indicator and prevent overlapping saves
	if (saveLock) return false;
	saveLock = true;
	saveStatus.textContent = 'Saving...';

	try {
		// Sanitize content before saving
		note.content = sanitizeHtml(note.content);

		// Save locally first
		localStorage.setItem("notes", JSON.stringify(notes));
		renderNotes();

		// If signed in, try to sync to Firestore and report result
		if (uid) {
			try {
				await db.collection('users').doc(uid).collection('notes').doc(note.created).set(note);
				saveStatus.textContent = 'Saved & Synced';
				return true;
			} catch (err) {
				console.warn('Firestore save failed', err);
				saveStatus.textContent = 'Saved (local) — sync failed';
				return false;
			}
		}

		// Not signed in: local save only
		saveStatus.textContent = 'Saved (local)';
		return true;
	} catch (e) {
		console.error('Save failed', e);
		saveStatus.textContent = 'Save failed';
		return false;
	} finally {
		saveLock = false;
	}
}

saveBtn.addEventListener("click", saveNote);
// Pin current note
if (pinBtn) {
  pinBtn.addEventListener('click', () => {
    if (currentNoteIndex === null) return;
    notes[currentNoteIndex].pinned = !notes[currentNoteIndex].pinned;
		notes[currentNoteIndex].updated = new Date().toISOString();
		try {
			localStorage.setItem('notes', JSON.stringify(notes));
		} catch (e) {
			console.error('Local write failed', e);
			saveStatus.textContent = 'Local save failed';
		}
    // sync small change
    if (uid) {
      db.collection('users').doc(uid).collection('notes').doc(notes[currentNoteIndex].created).set(notes[currentNoteIndex])
        .catch(e => console.warn('Pin sync failed', e));
    }
    renderNotes();
  });
}

// Delete (move to trash) current note
if (deleteBtn) {
  deleteBtn.addEventListener('click', () => {
    if (currentNoteIndex === null) return;
    const note = notes.splice(currentNoteIndex, 1)[0];
		note.deletedAt = new Date().toISOString();
		trash.push(note);
		currentNoteIndex = null;
		try {
			localStorage.setItem('notes', JSON.stringify(notes));
			localStorage.setItem('trash', JSON.stringify(trash));
		} catch (e) {
			console.error('Local write failed', e);
			saveStatus.textContent = 'Local save failed';
		}
		renderNotes();

    if (uid) {
      // write to trash collection and remove from notes collection
      db.collection('users').doc(uid).collection('trash').doc(note.created).set(note).catch(e=>console.warn(e));
      db.collection('users').doc(uid).collection('notes').doc(note.created).delete().catch(()=>{});
    }
  });
}

// -------------------------
// AUTO SAVE
// -------------------------
editor.addEventListener("input", () => {
  saveStatus.textContent = "Typing...";
  updateCharCount();

  clearTimeout(window.autoSaveTimer);
  window.autoSaveTimer = setTimeout(saveNote, 1000);
});

noteTitle.addEventListener("input", () => {
  clearTimeout(window.autoSaveTimer);
  window.autoSaveTimer = setTimeout(saveNote, 1000);
});

// -------------------------
// TOOLBAR (FORMAT)
// -------------------------
document.querySelectorAll(".toolbar button[data-cmd]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.execCommand(btn.dataset.cmd, false, null);
    editor.focus();
  });
});

// -------------------------
// SEARCH
// -------------------------
searchInput.addEventListener("input", (e) => {
  const value = e.target.value.toLowerCase();

  const source = viewTrash ? trash : notes;
  const filtered = source.filter(note =>
    (note.title || "").toLowerCase().includes(value) ||
    (note.content || "").toLowerCase().includes(value)
  );

  renderNotes(filtered);
});

// -------------------------
// CHAR COUNT
// -------------------------
function updateCharCount() {
  const text = editor.innerText || "";
  charCount.textContent = `${text.length} chars`;
}

// -------------------------
// THEME TOGGLE
// -------------------------
themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute("data-theme");

  const newTheme = currentTheme === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);

  localStorage.setItem("theme", newTheme);
});

// Load saved theme
(function () {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
})();

// -------------------------
// CLOUD SYNC HELPERS
// -------------------------
async function syncFromCloud(uid) {
  // Fetch remote notes
  const snapshot = await db.collection('users').doc(uid).collection('notes').get();
  const remoteNotes = snapshot.docs.map(d => d.data());

  // Merge local and remote by `created` timestamp, preferring newer `updated`
  const map = {};
  notes.forEach(n => { map[n.created] = n; });
  remoteNotes.forEach(r => {
    if (!map[r.created]) map[r.created] = r;
    else {
      const localUpdated = new Date(map[r.created].updated).getTime();
      const remoteUpdated = new Date(r.updated).getTime();
      if (remoteUpdated > localUpdated) map[r.created] = r;
    }
  });

	notes = Object.values(map).sort((a,b) => new Date(b.updated) - new Date(a.updated));
	try {
		localStorage.setItem('notes', JSON.stringify(notes));
	} catch (e) {
		console.error('Local write failed', e);
		saveStatus.textContent = 'Local save failed';
	}
	renderNotes();

  // Push merged notes back to cloud to ensure both sides have same data
  const writes = [];
  notes.forEach(n => {
    writes.push(db.collection('users').doc(uid).collection('notes').doc(n.created).set(n));
  });
  try {
    await Promise.all(writes);
    saveStatus.textContent = 'All notes synced';
  } catch (e) {
    console.warn('Error writing merged notes', e);
  }
}

// Restore from trash
if (restoreBtn) {
  restoreBtn.addEventListener('click', () => {
    if (currentTrashIndex === null) return;
    const note = trash.splice(currentTrashIndex, 1)[0];
    delete note.deletedAt;
		notes.push(note);
		currentTrashIndex = null;
		try {
			localStorage.setItem('notes', JSON.stringify(notes));
			localStorage.setItem('trash', JSON.stringify(trash));
		} catch (e) {
			console.error('Local write failed', e);
			saveStatus.textContent = 'Local save failed';
		}
		renderNotes();

    if (uid) {
      db.collection('users').doc(uid).collection('notes').doc(note.created).set(note).catch(e=>console.warn(e));
      db.collection('users').doc(uid).collection('trash').doc(note.created).delete().catch(()=>{});
    }
  });
}

// Permanently delete from trash
if (permDeleteBtn) {
  permDeleteBtn.addEventListener('click', () => {
    if (currentTrashIndex === null) return;
    const note = trash.splice(currentTrashIndex, 1)[0];
		currentTrashIndex = null;
		try {
			localStorage.setItem('trash', JSON.stringify(trash));
		} catch (e) {
			console.error('Local write failed', e);
			saveStatus.textContent = 'Local save failed';
		}
		renderNotes();

    if (uid) {
      db.collection('users').doc(uid).collection('trash').doc(note.created).delete().catch(()=>{});
    }
  });
}

// Toggle viewing trash vs notes
if (viewTrashBtn) {
  viewTrashBtn.addEventListener('click', () => {
    viewTrash = !viewTrash;
    viewTrashBtn.textContent = viewTrash ? 'View Notes' : 'View Trash';
    // reset selection
    currentNoteIndex = null;
    currentTrashIndex = null;
    // toolbar state
    if (viewTrash) {
      pinBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
    } else {
      pinBtn.style.display = '';
      deleteBtn.style.display = '';
    }
    renderNotes();
  });
}

// -------------------------
// EXPORT (TXT for now)
// -------------------------
document.getElementById("exportPdf").addEventListener("click", () => {
  const content = editor.innerText;
  const blob = new Blob([content], { type: "text/plain" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = (noteTitle.value || "note") + ".txt";
  link.click();
});

// -------------------------
// INIT
// -------------------------
renderNotes();
updateCharCount();