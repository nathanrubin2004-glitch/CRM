// ---- FIREBASE CONFIG ----
const firebaseConfig = {
    apiKey: "AIzaSyDygQvFfxiuQOdVh8IkxMBXSph25Vt6bvM",
    authDomain: "networking-crm-668a7.firebaseapp.com",
    projectId: "networking-crm-668a7",
    storageBucket: "networking-crm-668a7.firebasestorage.app",
    messagingSenderId: "438175860879",
    appId: "1:438175860879:web:9adef92f3acdc4852888fa"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---- STATE ----
let contacts = [];
let currentContactId = null;
let editingContactId = null;

// ---- DOM REFS ----
const viewList    = document.getElementById('view-list');
const viewDetail  = document.getElementById('view-detail');
const searchInput = document.getElementById('search-input');
const filterPipeline = document.getElementById('filter-pipeline');
const filterTag   = document.getElementById('filter-tag');
const contactsTbody = document.getElementById('contacts-tbody');
const modalOverlay  = document.getElementById('modal-overlay');
const contactForm   = document.getElementById('contact-form');

// ---- VIEW SWITCHING ----
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// ---- LOAD CONTACTS ----
async function loadContacts() {
    contactsTbody.innerHTML = '<tr><td colspan="7" class="loading">Loading contacts...</td></tr>';
    try {
        const snap = await db.collection('contacts').orderBy('name').get();
        contacts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    } catch (err) {
        contactsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// ---- RENDER TABLE ----
function renderTable() {
    const search   = searchInput.value.toLowerCase().trim();
    const pipeline = filterPipeline.value;
    const tag      = filterTag.value.toLowerCase().trim();

    const filtered = contacts.filter(c => {
        const matchSearch = !search ||
            (c.name  && c.name.toLowerCase().includes(search)) ||
            (c.email && c.email.toLowerCase().includes(search)) ||
            (c.phone && c.phone.toLowerCase().includes(search));
        const matchPipeline = !pipeline || c.pipelineStatus === pipeline;
        const matchTag = !tag || (Array.isArray(c.tags) && c.tags.some(t => t.toLowerCase().includes(tag)));
        return matchSearch && matchPipeline && matchTag;
    });

    if (filtered.length === 0) {
        contactsTbody.innerHTML = `<tr><td colspan="7" class="empty-state">${contacts.length === 0 ? 'No contacts yet. Add your first one!' : 'No contacts match your filters.'}</td></tr>`;
        return;
    }

    const today = todayDate();
    contactsTbody.innerHTML = filtered.map(c => buildRow(c, today)).join('');
}

function buildRow(c, today) {
    const overdue  = c.followUpDate && c.followUpDate < today;
    const followUp = c.followUpDate
        ? `<span class="${overdue ? 'overdue' : ''}">${fmtDate(c.followUpDate)}${overdue ? ' &#9888;' : ''}</span>`
        : '';

    const pipeHtml = c.pipelineStatus
        ? `<span class="badge badge-${slugify(c.pipelineStatus)}">${escHtml(c.pipelineStatus)}</span>`
        : '';

    const tagsHtml = Array.isArray(c.tags)
        ? c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')
        : '';

    const id = c.id;
    return `
        <tr>
            <td><button class="btn-link" onclick="viewContact('${id}')">${escHtml(c.name)}</button></td>
            <td>${c.email ? `<a href="mailto:${escHtml(c.email)}" style="color:#2c5aa0">${escHtml(c.email)}</a>` : ''}</td>
            <td>${escHtml(c.phone || '')}</td>
            <td>${pipeHtml}</td>
            <td>${tagsHtml}</td>
            <td>${followUp}</td>
            <td style="white-space:nowrap">
                <button class="btn-link" onclick="viewContact('${id}')">View</button>
                <button class="btn-link" onclick="openEditModal('${id}')">Edit</button>
                <button class="btn-link danger" onclick="deleteContact('${id}')">Delete</button>
            </td>
        </tr>`;
}

// ---- CONTACT DETAIL ----
async function viewContact(id) {
    currentContactId = id;
    const c = contacts.find(x => x.id === id);
    if (!c) return;

    const today   = todayDate();
    const overdue = c.followUpDate && c.followUpDate < today;

    const pipeHtml = c.pipelineStatus
        ? `<span class="badge badge-${slugify(c.pipelineStatus)}">${escHtml(c.pipelineStatus)}</span>`
        : '';

    const tagsHtml = Array.isArray(c.tags) && c.tags.length
        ? c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')
        : '<span style="color:#aaa">—</span>';

    document.getElementById('contact-detail-content').innerHTML = `
        <div class="contact-info-card">
            <h2>${escHtml(c.name)}</h2>
            <div class="contact-subtitle">
                ${pipeHtml}
                ${c.howWeMet ? `<span style="color:#666">Met: ${escHtml(c.howWeMet)}</span>` : ''}
            </div>
            <div class="info-grid">
                <div class="info-item">
                    <label>Email</label>
                    <div class="value">${c.email ? `<a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a>` : '—'}</div>
                </div>
                <div class="info-item">
                    <label>Phone</label>
                    <div class="value">${c.phone ? `<a href="tel:${escHtml(c.phone)}">${escHtml(c.phone)}</a>` : '—'}</div>
                </div>
                <div class="info-item">
                    <label>Social Handle</label>
                    <div class="value">${escHtml(c.socialHandle || '—')}</div>
                </div>
                <div class="info-item">
                    <label>Follow-Up Date</label>
                    <div class="value ${overdue ? 'overdue' : ''}">${c.followUpDate ? fmtDate(c.followUpDate) + (overdue ? ' (OVERDUE)' : '') : '—'}</div>
                </div>
                <div class="info-item">
                    <label>Tags</label>
                    <div class="value">${tagsHtml}</div>
                </div>
                <div class="info-item">
                    <label>Added</label>
                    <div class="value">${c.createdAt ? fmtDateTime(c.createdAt.toDate()) : '—'}</div>
                </div>
            </div>
            ${c.notes ? `
                <div class="notes-block">
                    <label>Notes</label>
                    <div class="value">${escHtml(c.notes)}</div>
                </div>` : ''}
        </div>`;

    showView('view-detail');
    loadActivityLog(id);
}

// ---- ACTIVITY LOG ----
async function loadActivityLog(contactId) {
    const list = document.getElementById('activity-list');
    list.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const snap = await db.collection('contacts').doc(contactId)
            .collection('activities')
            .orderBy('createdAt', 'desc')
            .get();

        if (snap.empty) {
            list.innerHTML = '<div class="empty-state">No activity logged yet.</div>';
            return;
        }

        list.innerHTML = snap.docs.map(doc => {
            const a    = doc.data();
            const date = a.createdAt ? a.createdAt.toDate() : new Date();
            return `
                <div class="activity-entry">
                    <div class="activity-time">${fmtDateTime(date)}</div>
                    <div class="activity-note">${escHtml(a.note)}</div>
                </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = `<div class="empty-state">Error: ${escHtml(err.message)}</div>`;
    }
}

async function addActivity() {
    const ta   = document.getElementById('activity-note');
    const note = ta.value.trim();
    if (!note || !currentContactId) return;

    const btn = document.getElementById('btn-add-activity');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        await db.collection('contacts').doc(currentContactId)
            .collection('activities')
            .add({ note, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        ta.value = '';
        loadActivityLog(currentContactId);
    } catch (err) {
        alert('Error adding note: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Note';
    }
}

// ---- ADD / EDIT MODAL ----
function openAddModal() {
    editingContactId = null;
    document.getElementById('modal-title').textContent = 'Add Contact';
    contactForm.reset();
    modalOverlay.classList.remove('hidden');
    document.getElementById('field-name').focus();
}

function openEditModal(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    editingContactId = id;
    document.getElementById('modal-title').textContent = 'Edit Contact';

    document.getElementById('field-name').value     = c.name        || '';
    document.getElementById('field-email').value    = c.email       || '';
    document.getElementById('field-phone').value    = c.phone       || '';
    document.getElementById('field-social').value   = c.socialHandle || '';
    document.getElementById('field-how-met').value  = c.howWeMet    || '';
    document.getElementById('field-pipeline').value = c.pipelineStatus || '';
    document.getElementById('field-tags').value     = Array.isArray(c.tags) ? c.tags.join(', ') : '';
    document.getElementById('field-followup').value = c.followUpDate || '';
    document.getElementById('field-notes').value    = c.notes       || '';

    modalOverlay.classList.remove('hidden');
    document.getElementById('field-name').focus();
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    editingContactId = null;
}

// ---- SAVE CONTACT ----
async function saveContact(e) {
    e.preventDefault();

    const tagsRaw = document.getElementById('field-tags').value;
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    const data = {
        name:           document.getElementById('field-name').value.trim(),
        email:          document.getElementById('field-email').value.trim(),
        phone:          document.getElementById('field-phone').value.trim(),
        socialHandle:   document.getElementById('field-social').value.trim(),
        howWeMet:       document.getElementById('field-how-met').value.trim(),
        pipelineStatus: document.getElementById('field-pipeline').value,
        tags,
        followUpDate:   document.getElementById('field-followup').value,
        notes:          document.getElementById('field-notes').value.trim(),
        updatedAt:      firebase.firestore.FieldValue.serverTimestamp()
    };

    const submitBtn = contactForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        if (editingContactId) {
            await db.collection('contacts').doc(editingContactId).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('contacts').add(data);
        }

        const wasEditing = editingContactId;
        closeModal();
        await loadContacts();

        // Refresh detail view if we just edited the open contact
        if (wasEditing && currentContactId === wasEditing) {
            viewContact(wasEditing);
        }
    } catch (err) {
        alert('Error saving contact: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Contact';
    }
}

// ---- DELETE CONTACT ----
async function deleteContact(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;

    try {
        // Delete activities subcollection first
        const actSnap = await db.collection('contacts').doc(id).collection('activities').get();
        const batch = db.batch();
        actSnap.docs.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('contacts').doc(id));
        await batch.commit();

        await loadContacts();
        if (currentContactId === id) {
            showView('view-list');
            currentContactId = null;
        }
    } catch (err) {
        alert('Error deleting contact: ' + err.message);
    }
}

// ---- HELPERS ----
function todayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${m}/${d}/${y}`;
}

function fmtDateTime(date) {
    return date.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

function slugify(str) {
    return str.toLowerCase().replace(/\s+/g, '-');
}

function escHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ---- EVENT LISTENERS ----
document.getElementById('btn-contacts').addEventListener('click', () => {
    showView('view-list');
    renderTable();
});

document.getElementById('btn-add-contact').addEventListener('click', openAddModal);

document.getElementById('btn-back').addEventListener('click', () => {
    showView('view-list');
    renderTable();
});

document.getElementById('btn-edit-contact').addEventListener('click', () => {
    if (currentContactId) openEditModal(currentContactId);
});

document.getElementById('btn-delete-contact').addEventListener('click', () => {
    if (currentContactId) deleteContact(currentContactId);
});

document.getElementById('btn-add-activity').addEventListener('click', addActivity);

document.getElementById('activity-note').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addActivity();
});

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-cancel-form').addEventListener('click', closeModal);

modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
});

contactForm.addEventListener('submit', saveContact);

searchInput.addEventListener('input', renderTable);
filterPipeline.addEventListener('change', renderTable);
filterTag.addEventListener('input', renderTable);

// ---- INIT ----
loadContacts();
