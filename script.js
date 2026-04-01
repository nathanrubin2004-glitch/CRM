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
const db   = firebase.firestore();
const auth = firebase.auth();

// ---- STATE ----
let contacts       = [];
let companies      = [];
let tags           = [];
let currentContactId  = null;
let editingContactId  = null;
let editingCompanyId  = null;

// ---- VIEW SWITCHING ----
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn:not(.primary)').forEach(b => b.classList.remove('active'));
    const navMap = {
        'view-list':      'btn-nav-contacts',
        'view-detail':    'btn-nav-contacts',
        'view-companies': 'btn-nav-companies'
    };
    const navId = navMap[id];
    if (navId) document.getElementById(navId).classList.add('active');
}

// ---- MODAL HELPERS ----
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Close modal buttons (generic via data-modal attribute)
document.querySelectorAll('.modal-close-btn, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

// ========================================================
// TAGS
// ========================================================

async function loadTags() {
    const snap = await db.collection('tags').orderBy('name').get();
    tags = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function populateTagFilter() {
    const sel = document.getElementById('filter-tag');
    const current = sel.value;
    sel.innerHTML = '<option value="">All Tags</option>';
    tags.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        if (t.name === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

function renderTagCheckboxes(selectedTags = []) {
    const container = document.getElementById('tag-checkboxes');
    if (tags.length === 0) {
        container.innerHTML = '<span class="no-tags-msg">No tags yet — create one below</span>';
        return;
    }
    container.innerHTML = tags.map(t => {
        const checked = selectedTags.includes(t.name);
        return `
            <label class="tag-check-item ${checked ? 'checked' : ''}" id="tag-item-${t.id}">
                <input type="checkbox" value="${escHtml(t.name)}" ${checked ? 'checked' : ''}
                    onchange="toggleTagCheckStyle('${t.id}', this)">
                ${escHtml(t.name)}
            </label>`;
    }).join('');
}

function toggleTagCheckStyle(tagId, checkbox) {
    const label = document.getElementById('tag-item-' + tagId);
    if (label) label.classList.toggle('checked', checkbox.checked);
}

function getCheckedTags() {
    return Array.from(document.querySelectorAll('#tag-checkboxes input[type="checkbox"]:checked'))
        .map(cb => cb.value);
}

async function createTag(name) {
    name = name.trim();
    if (!name) return;
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        alert(`Tag "${name}" already exists.`);
        return;
    }
    await db.collection('tags').add({ name });
    await loadTags();
}

// ---- Manage Tags Modal ----
function renderTagsModal() {
    const list = document.getElementById('tags-list');
    if (tags.length === 0) {
        list.innerHTML = '<div class="empty-state">No tags yet. Create one above.</div>';
        return;
    }
    list.innerHTML = tags.map(t => `
        <div class="tag-manage-item">
            <span class="tag-name"><span class="tag">${escHtml(t.name)}</span></span>
            <button class="btn-link danger" onclick="deleteTag('${t.id}', '${escHtml(t.name)}')">Delete</button>
        </div>`).join('');
}

async function deleteTag(id, name) {
    if (!confirm(`Delete tag "${name}"? It will be removed from all contacts.`)) return;
    // Remove from all contacts that have this tag
    const snap = await db.collection('contacts').where('tags', 'array-contains', name).get();
    const batch = db.batch();
    snap.docs.forEach(doc => {
        const newTags = (doc.data().tags || []).filter(t => t !== name);
        batch.update(doc.ref, { tags: newTags });
    });
    batch.delete(db.collection('tags').doc(id));
    await batch.commit();
    await loadTags();
    await loadContacts();
    populateTagFilter();
    renderTagsModal();
}

document.getElementById('btn-nav-tags').addEventListener('click', async () => {
    await loadTags();
    renderTagsModal();
    openModal('modal-tags');
});

document.getElementById('btn-save-new-tag').addEventListener('click', async () => {
    const input = document.getElementById('new-tag-name');
    await createTag(input.value);
    input.value = '';
    populateTagFilter();
    renderTagsModal();
});

document.getElementById('new-tag-name').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const input = document.getElementById('new-tag-name');
        await createTag(input.value);
        input.value = '';
        populateTagFilter();
        renderTagsModal();
    }
});

// Inline tag creation inside contact form
document.getElementById('btn-create-tag-inline').addEventListener('click', async () => {
    const input = document.getElementById('new-tag-inline');
    const name = input.value.trim();
    if (!name) return;
    await createTag(name);
    input.value = '';
    const checked = getCheckedTags();
    checked.push(name);
    renderTagCheckboxes(checked);
    populateTagFilter();
});

document.getElementById('new-tag-inline').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const input = document.getElementById('new-tag-inline');
        const name = input.value.trim();
        if (!name) return;
        await createTag(name);
        input.value = '';
        const checked = getCheckedTags();
        checked.push(name);
        renderTagCheckboxes(checked);
        populateTagFilter();
    }
});

// ========================================================
// COMPANIES
// ========================================================

async function loadCompanies() {
    const snap = await db.collection('companies').orderBy('name').get();
    companies = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function getCompanyName(id) {
    if (!id) return '';
    const co = companies.find(c => c.id === id);
    return co ? co.name : '';
}

function renderCompaniesTable() {
    const tbody = document.getElementById('companies-tbody');
    const search = document.getElementById('company-search').value.toLowerCase().trim();

    const filtered = companies.filter(c =>
        !search ||
        c.name.toLowerCase().includes(search) ||
        (c.industry && c.industry.toLowerCase().includes(search))
    );

    if (filtered.length === 0) {
        const msg = companies.length === 0
            ? 'No companies yet. Add your first one!'
            : 'No companies match your search.';
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(co => {
        const contactCount = contacts.filter(c => c.companyId === co.id).length;
        const websiteHtml = co.website
            ? `<a href="${escHtml(co.website)}" target="_blank" rel="noopener" style="color:#2c5aa0">${escHtml(co.website.replace(/^https?:\/\//, ''))}</a>`
            : '';
        return `
            <tr>
                <td><strong>${escHtml(co.name)}</strong></td>
                <td>${escHtml(co.industry || '')}</td>
                <td>${websiteHtml}</td>
                <td>${escHtml(co.phone || '')}</td>
                <td>${contactCount > 0 ? `<button class="btn-link" onclick="filterByCompany('${co.id}')">${contactCount} contact${contactCount !== 1 ? 's' : ''}</button>` : '0'}</td>
                <td style="white-space:nowrap">
                    <button class="btn-link" onclick="openEditCompanyModal('${co.id}')">Edit</button>
                    <button class="btn-link danger" onclick="deleteCompany('${co.id}')">Delete</button>
                </td>
            </tr>`;
    }).join('');
}

function filterByCompany(companyId) {
    // Switch to contacts view and filter by company name
    showView('view-list');
    document.getElementById('search-input').value = getCompanyName(companyId);
    renderTable();
}

function populateCompanyDropdown(selectedId = '') {
    const sel = document.getElementById('field-company');
    sel.innerHTML = '<option value="">No company</option>';
    companies.forEach(co => {
        const opt = document.createElement('option');
        opt.value = co.id;
        opt.textContent = co.name;
        if (co.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function openAddCompanyModal() {
    editingCompanyId = null;
    document.getElementById('company-modal-title').textContent = 'Add Company';
    document.getElementById('company-form').reset();
    openModal('modal-company');
    document.getElementById('co-name').focus();
}

function openEditCompanyModal(id) {
    const co = companies.find(c => c.id === id);
    if (!co) return;
    editingCompanyId = id;
    document.getElementById('company-modal-title').textContent = 'Edit Company';
    document.getElementById('co-name').value     = co.name     || '';
    document.getElementById('co-industry').value = co.industry || '';
    document.getElementById('co-website').value  = co.website  || '';
    document.getElementById('co-phone').value    = co.phone    || '';
    document.getElementById('co-address').value  = co.address  || '';
    document.getElementById('co-notes').value    = co.notes    || '';
    openModal('modal-company');
    document.getElementById('co-name').focus();
}

document.getElementById('company-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
        name:     document.getElementById('co-name').value.trim(),
        industry: document.getElementById('co-industry').value.trim(),
        website:  document.getElementById('co-website').value.trim(),
        phone:    document.getElementById('co-phone').value.trim(),
        address:  document.getElementById('co-address').value.trim(),
        notes:    document.getElementById('co-notes').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const submitBtn = document.querySelector('#company-form [type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        if (editingCompanyId) {
            await db.collection('companies').doc(editingCompanyId).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('companies').add(data);
        }
        closeModal('modal-company');
        await loadCompanies();
        renderCompaniesTable();
        populateCompanyDropdown();
    } catch (err) {
        alert('Error saving company: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Company';
    }
});

async function deleteCompany(id) {
    const co = companies.find(c => c.id === id);
    if (!co) return;
    if (!confirm(`Delete "${co.name}"? Contacts linked to it will be unlinked.`)) return;
    try {
        // Unlink contacts
        const snap = await db.collection('contacts').where('companyId', '==', id).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { companyId: '' }));
        batch.delete(db.collection('companies').doc(id));
        await batch.commit();
        await Promise.all([loadCompanies(), loadContacts()]);
        renderCompaniesTable();
        renderTable();
    } catch (err) {
        alert('Error deleting company: ' + err.message);
    }
}

document.getElementById('btn-add-company').addEventListener('click', openAddCompanyModal);
document.getElementById('company-search').addEventListener('input', renderCompaniesTable);

document.getElementById('btn-nav-companies').addEventListener('click', async () => {
    showView('view-companies');
    renderCompaniesTable();
});

// ========================================================
// CONTACTS
// ========================================================

async function loadContacts() {
    const tbody = document.getElementById('contacts-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading contacts...</td></tr>';
    try {
        const snap = await db.collection('contacts').orderBy('name').get();
        contacts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTable() {
    const tbody    = document.getElementById('contacts-tbody');
    const search   = document.getElementById('search-input').value.toLowerCase().trim();
    const pipeline = document.getElementById('filter-pipeline').value;
    const tag      = document.getElementById('filter-tag').value;

    const filtered = contacts.filter(c => {
        const coName = getCompanyName(c.companyId).toLowerCase();
        const matchSearch = !search ||
            (c.name  && c.name.toLowerCase().includes(search)) ||
            (c.email && c.email.toLowerCase().includes(search)) ||
            (c.phone && c.phone.toLowerCase().includes(search)) ||
            coName.includes(search);
        const matchPipeline = !pipeline || c.pipelineStatus === pipeline;
        const matchTag = !tag || (Array.isArray(c.tags) && c.tags.includes(tag));
        return matchSearch && matchPipeline && matchTag;
    });

    if (filtered.length === 0) {
        const msg = contacts.length === 0
            ? 'No contacts yet. Add your first one!'
            : 'No contacts match your filters.';
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${msg}</td></tr>`;
        return;
    }

    const today = todayDate();
    tbody.innerHTML = filtered.map(c => buildRow(c, today)).join('');
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

    const coName = getCompanyName(c.companyId);
    const coHtml = coName ? `<span style="color:#555;font-size:12px">${escHtml(coName)}</span>` : '';

    const id = c.id;
    return `
        <tr>
            <td><button class="btn-link" onclick="viewContact('${id}')">${escHtml(c.name)}</button></td>
            <td>${coHtml}</td>
            <td>${c.email ? `<a href="mailto:${escHtml(c.email)}" style="color:#2c5aa0">${escHtml(c.email)}</a>` : ''}</td>
            <td>${escHtml(c.phone || '')}</td>
            <td>${pipeHtml}</td>
            <td>${tagsHtml}</td>
            <td>${followUp}</td>
            <td style="white-space:nowrap">
                <button class="btn-link" onclick="viewContact('${id}')">View</button>
                <button class="btn-link" onclick="openEditContactModal('${id}')">Edit</button>
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

    const coName = getCompanyName(c.companyId);
    const coHtml = coName
        ? `<button class="company-link" onclick="showView('view-companies'); renderCompaniesTable();">&#127970; ${escHtml(coName)}</button>`
        : '';

    document.getElementById('contact-detail-content').innerHTML = `
        <div class="contact-info-card">
            <h2>${escHtml(c.name)}</h2>
            <div class="contact-subtitle">
                ${pipeHtml}
                ${coHtml}
                ${c.howWeMet ? `<span style="color:#666">Met via: ${escHtml(c.howWeMet)}</span>` : ''}
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

// ---- ADD / EDIT CONTACT MODAL ----
function openAddContactModal() {
    editingContactId = null;
    document.getElementById('contact-modal-title').textContent = 'Add Contact';
    document.getElementById('contact-form').reset();
    populateCompanyDropdown();
    renderTagCheckboxes([]);
    openModal('modal-contact');
    document.getElementById('field-name').focus();
}

function openEditContactModal(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    editingContactId = id;
    document.getElementById('contact-modal-title').textContent = 'Edit Contact';

    document.getElementById('field-name').value     = c.name           || '';
    document.getElementById('field-email').value    = c.email          || '';
    document.getElementById('field-phone').value    = c.phone          || '';
    document.getElementById('field-social').value   = c.socialHandle   || '';
    document.getElementById('field-how-met').value  = c.howWeMet       || '';
    document.getElementById('field-pipeline').value = c.pipelineStatus || '';
    document.getElementById('field-followup').value = c.followUpDate   || '';
    document.getElementById('field-notes').value    = c.notes          || '';

    populateCompanyDropdown(c.companyId || '');
    renderTagCheckboxes(Array.isArray(c.tags) ? c.tags : []);

    openModal('modal-contact');
    document.getElementById('field-name').focus();
}

document.getElementById('contact-form').addEventListener('submit', async e => {
    e.preventDefault();

    const data = {
        name:           document.getElementById('field-name').value.trim(),
        email:          document.getElementById('field-email').value.trim(),
        phone:          document.getElementById('field-phone').value.trim(),
        socialHandle:   document.getElementById('field-social').value.trim(),
        howWeMet:       document.getElementById('field-how-met').value.trim(),
        pipelineStatus: document.getElementById('field-pipeline').value,
        companyId:      document.getElementById('field-company').value,
        tags:           getCheckedTags(),
        followUpDate:   document.getElementById('field-followup').value,
        notes:          document.getElementById('field-notes').value.trim(),
        updatedAt:      firebase.firestore.FieldValue.serverTimestamp()
    };

    const submitBtn = document.querySelector('#contact-form [type="submit"]');
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
        closeModal('modal-contact');
        await loadContacts();
        if (wasEditing && currentContactId === wasEditing) {
            viewContact(wasEditing);
        }
    } catch (err) {
        alert('Error saving contact: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Contact';
    }
});

async function deleteContact(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;

    try {
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

// ========================================================
// EVENT LISTENERS
// ========================================================

document.getElementById('btn-nav-contacts').addEventListener('click', () => {
    showView('view-list');
    renderTable();
});

document.getElementById('btn-add-contact').addEventListener('click', openAddContactModal);

document.getElementById('btn-back').addEventListener('click', () => {
    showView('view-list');
    renderTable();
});

document.getElementById('btn-edit-contact').addEventListener('click', () => {
    if (currentContactId) openEditContactModal(currentContactId);
});

document.getElementById('btn-delete-contact').addEventListener('click', () => {
    if (currentContactId) deleteContact(currentContactId);
});

document.getElementById('btn-add-activity').addEventListener('click', addActivity);

document.getElementById('activity-note').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addActivity();
});

document.getElementById('search-input').addEventListener('input', renderTable);
document.getElementById('filter-pipeline').addEventListener('change', renderTable);
document.getElementById('filter-tag').addEventListener('change', renderTable);

// ========================================================
// HELPERS
// ========================================================

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

// ========================================================
// AUTH
// ========================================================

const loginPage = document.getElementById('login-page');
const appEl     = document.getElementById('app');

auth.onAuthStateChanged(user => {
    if (user) {
        loginPage.classList.add('hidden');
        appEl.classList.remove('hidden');
        init();
    } else {
        appEl.classList.add('hidden');
        loginPage.classList.remove('hidden');
        // Reset state so stale data isn't shown on re-login
        contacts = []; companies = []; tags = [];
    }
});

document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl  = document.getElementById('login-error');
    const btn      = document.getElementById('btn-login');

    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        const messages = {
            'auth/user-not-found':   'No account found with that email.',
            'auth/wrong-password':   'Incorrect password.',
            'auth/invalid-email':    'Please enter a valid email address.',
            'auth/too-many-requests':'Too many attempts. Please try again later.',
            'auth/invalid-credential': 'Incorrect email or password.'
        };
        errorEl.textContent = messages[err.code] || err.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await auth.signOut();
});

// ========================================================
// INIT — load everything in parallel
// ========================================================
async function init() {
    await Promise.all([loadTags(), loadCompanies()]);
    populateTagFilter();
    await loadContacts();
}
