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
let contacts          = [];
let companies         = [];
let tags              = [];
let currentContactId  = null;
let editingContactId  = null;
let editingCompanyId  = null;
let selectedCompanyId = null; // tracks autocomplete selection in contact form

// ---- FILTER / SORT STATE ----
let sortCol             = 'name';
let sortDir             = 1;         // 1 = asc, -1 = desc
let activeTagFilter     = '';
let activeCompanyFilter = '';
let activeFollowUpFilter = '';       // 'overdue' | 'thisweek' | 'upcoming' | ''

// ---- IMPORT STATE ----
let importHeaders = [];
let importRows    = [];

// ---- BULK SELECTION STATE ----
let selectedContactIds = new Set();
let bulkCompanyId = null;

// ---- MERGE STATE ----
let mergeTargetId = null;

// ---- CRM FIELDS AVAILABLE FOR CSV MAPPING ----
const CRM_IMPORT_FIELDS = [
    { value: '',             label: '— Skip —' },
    { value: 'name',         label: 'Name' },
    { value: 'firstName',    label: 'First Name' },
    { value: 'lastName',     label: 'Last Name' },
    { value: 'email',        label: 'Email' },
    { value: 'phone',        label: 'Phone' },
    { value: 'companyName',  label: 'Company' },
    { value: 'socialHandle', label: 'Social / URL' },
    { value: 'howWeMet',     label: 'How We Met' },
    { value: 'notes',        label: 'Notes' },
    { value: 'tags',         label: 'Tags (comma-separated)' },
    { value: 'followUpDate', label: 'Follow-Up Date' },
];

// ---- VIEW SWITCHING ----
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn:not(.primary)').forEach(b => b.classList.remove('active'));
    const navMap = {
        'view-dashboard':    'btn-nav-dashboard',
        'view-list':         'btn-nav-contacts',
        'view-detail':       'btn-nav-contacts',
        'view-companies':    'btn-nav-companies',
        'view-notes-search': 'btn-nav-notes-search'
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

document.querySelectorAll('.modal-close-btn, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

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
    populateTagPills();
    populateBulkTagSelect();
}

function populateBulkTagSelect() {
    const sel = document.getElementById('bulk-tag-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Assign Tag...</option>' +
        tags.map(t => `<option value="${escHtml(t.name)}">${escHtml(t.name)}</option>`).join('');
}

function populateTagPills() {
    const row = document.getElementById('tag-pills-row');
    if (!row) return;
    if (tags.length === 0) {
        row.innerHTML = '';
        return;
    }
    row.innerHTML = tags.map(t =>
        `<button class="tag-pill-btn${activeTagFilter === t.name ? ' active' : ''}"
            onclick="toggleTagPill('${escHtml(t.name)}')">${escHtml(t.name)}</button>`
    ).join('');
}

function toggleTagPill(tagName) {
    activeTagFilter = activeTagFilter === tagName ? '' : tagName;
    populateTagPills();
    renderTable();
}

function populateCompanyFilter() {
    const sel = document.getElementById('filter-company');
    if (!sel) return;
    const current = activeCompanyFilter;
    sel.innerHTML = '<option value="">All Companies</option>';
    const names = [...new Set(contacts.map(c => getDisplayCompany(c)).filter(Boolean))].sort();
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === current) opt.selected = true;
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

// Returns the display name for a contact's company field.
// Prefers linked company record; falls back to freetext companyName.
function getDisplayCompany(contact) {
    if (contact.companyId) {
        const co = companies.find(c => c.id === contact.companyId);
        if (co) return co.name;
    }
    return contact.companyName || '';
}

function renderCompaniesTable() {
    const tbody  = document.getElementById('companies-tbody');
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
        const websiteHtml  = co.website
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
    showView('view-list');
    const co = companies.find(c => c.id === companyId);
    document.getElementById('search-input').value = co ? co.name : '';
    renderTable();
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
        const snap = await db.collection('contacts').where('companyId', '==', id).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { companyId: '', companyName: co.name }));
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
// COMPANY AUTOCOMPLETE (contact form)
// ========================================================

const coTextInput   = document.getElementById('field-company-text');
const coSuggestions = document.getElementById('company-suggestions');

function initCompanyAutocomplete(contact = null) {
    selectedCompanyId = null;
    coSuggestions.classList.add('hidden');
    coSuggestions.innerHTML = '';

    if (contact) {
        // Populate from existing contact
        const displayName = getDisplayCompany(contact);
        coTextInput.value = displayName;
        if (contact.companyId) selectedCompanyId = contact.companyId;
    } else {
        coTextInput.value = '';
    }
}

function showCompanySuggestions(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        coSuggestions.classList.add('hidden');
        return;
    }

    const matches = companies.filter(co => co.name.toLowerCase().includes(q));

    if (matches.length === 0) {
        coSuggestions.classList.add('hidden');
        return;
    }

    coSuggestions.innerHTML = matches.map(co =>
        `<div class="suggestion-item" data-id="${co.id}" data-name="${escHtml(co.name)}">${escHtml(co.name)}</div>`
    ).join('');
    coSuggestions.classList.remove('hidden');
}

coTextInput.addEventListener('input', () => {
    selectedCompanyId = null; // clear selection when user types
    showCompanySuggestions(coTextInput.value);
});

coTextInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        coSuggestions.classList.add('hidden');
    }
});

coSuggestions.addEventListener('mousedown', e => {
    // mousedown fires before blur, so we can capture the click
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    selectedCompanyId     = item.dataset.id;
    coTextInput.value     = item.dataset.name;
    coSuggestions.classList.add('hidden');
});

coTextInput.addEventListener('blur', () => {
    // Short delay so mousedown on a suggestion fires first
    setTimeout(() => coSuggestions.classList.add('hidden'), 150);
});

// ========================================================
// CONTACTS
// ========================================================

async function loadContacts() {
    const tbody = document.getElementById('contacts-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Loading contacts...</td></tr>';
    try {
        const snap = await db.collection('contacts').orderBy('name').get();
        contacts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateCompanyFilter();
        renderTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTable() {
    const tbody  = document.getElementById('contacts-tbody');
    const search = document.getElementById('search-input').value.toLowerCase().trim();
    const today  = todayDate();
    const weekEnd = weekEndDate();

    const filtered = contacts.filter(c => {
        const coName = getDisplayCompany(c).toLowerCase();

        const matchSearch = !search ||
            (c.name        && c.name.toLowerCase().includes(search)) ||
            (c.email       && c.email.toLowerCase().includes(search)) ||
            (c.phone       && c.phone.toLowerCase().includes(search)) ||
            coName.includes(search) ||
            (c.currentRole && c.currentRole.toLowerCase().includes(search)) ||
            (c.location    && c.location.toLowerCase().includes(search)) ||
            (c.notes       && c.notes.toLowerCase().includes(search));

        const matchTag = !activeTagFilter || (Array.isArray(c.tags) && c.tags.includes(activeTagFilter));

        const matchCompany = !activeCompanyFilter || getDisplayCompany(c) === activeCompanyFilter;

        let matchFollowUp = true;
        if (activeFollowUpFilter === 'overdue') {
            matchFollowUp = !!(c.followUpDate && c.followUpDate < today);
        } else if (activeFollowUpFilter === 'thisweek') {
            matchFollowUp = !!(c.followUpDate && c.followUpDate >= today && c.followUpDate <= weekEnd);
        } else if (activeFollowUpFilter === 'upcoming') {
            matchFollowUp = !!(c.followUpDate && c.followUpDate > weekEnd);
        }

        return matchSearch && matchTag && matchCompany && matchFollowUp;
    });

    const sorted = [...filtered].sort((a, b) => {
        let aVal = sortCol === 'company' ? getDisplayCompany(a) : (a[sortCol] || '');
        let bVal = sortCol === 'company' ? getDisplayCompany(b) : (b[sortCol] || '');
        aVal = aVal.toString().toLowerCase();
        bVal = bVal.toString().toLowerCase();
        if (aVal < bVal) return -sortDir;
        if (aVal > bVal) return sortDir;
        return 0;
    });

    selectedContactIds.clear();

    if (sorted.length === 0) {
        const msg = contacts.length === 0
            ? 'No contacts yet. Add your first one!'
            : 'No contacts match your filters.';
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${msg}</td></tr>`;
        updateSortHeaders();
        updateBulkToolbar();
        return;
    }

    tbody.innerHTML = sorted.map(c => buildRow(c, today)).join('');
    updateSortHeaders();
    updateBulkToolbar();
}

function updateSortHeaders() {
    document.querySelectorAll('#contacts-table th[data-sort]').forEach(th => {
        const col   = th.dataset.sort;
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.textContent = col === sortCol ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
        th.classList.toggle('sort-active', col === sortCol);
    });
}

function buildRow(c, today) {
    const overdue  = c.followUpDate && c.followUpDate < today;
    const followUp = c.followUpDate
        ? `<span class="${overdue ? 'overdue' : ''}">${fmtDate(c.followUpDate)}${overdue ? ' &#9888;' : ''}</span>`
        : '';

    const tagsHtml = Array.isArray(c.tags)
        ? c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')
        : '';

    const coName = getDisplayCompany(c);
    const coHtml = coName ? `<span style="color:#555;font-size:12px">${escHtml(coName)}</span>` : '';

    const id = c.id;
    const checked = selectedContactIds.has(id) ? 'checked' : '';
    return `
        <tr>
            <td class="cb-col"><input type="checkbox" class="row-cb" data-id="${id}" ${checked} /></td>
            <td><button class="btn-link" onclick="viewContact('${id}')">${escHtml(c.name)}</button></td>
            <td>${coHtml}</td>
            <td style="font-size:12px;color:#555">${escHtml(c.currentRole || '')}</td>
            <td>${c.email ? `<a href="mailto:${escHtml(c.email)}" style="color:#2c5aa0">${escHtml(c.email)}</a>` : ''}</td>
            <td>${escHtml(c.phone || '')}</td>
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

    const tagsHtml = Array.isArray(c.tags) && c.tags.length
        ? c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')
        : '<span style="color:#aaa">—</span>';

    const coName = getDisplayCompany(c);
    const coHtml = coName
        ? `<button class="company-link" onclick="showView('view-companies'); renderCompaniesTable();">&#127970; ${escHtml(coName)}</button>`
        : '';

    document.getElementById('contact-detail-content').innerHTML = `
        <div class="contact-info-card">
            <h2>${escHtml(c.name)}</h2>
            <div class="contact-subtitle">
                ${coHtml}
                ${c.currentRole ? `<span style="color:#444;font-weight:500">${escHtml(c.currentRole)}</span>` : ''}
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
                    <label>Location</label>
                    <div class="value">${escHtml(c.location || '—')}</div>
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
        const ts = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('contacts').doc(currentContactId)
            .collection('activities')
            .add({ note, createdAt: ts });
        await db.collection('contacts').doc(currentContactId)
            .update({ lastActivityAt: ts });
        // update in-memory contact too
        const c = contacts.find(x => x.id === currentContactId);
        if (c) c.lastActivityAt = { toDate: () => new Date() };
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
    initCompanyAutocomplete();
    renderTagCheckboxes([]);
    openModal('modal-contact');
    document.getElementById('field-name').focus();
}

function openEditContactModal(id) {
    const c = contacts.find(x => x.id === id);
    if (!c) return;
    editingContactId = id;
    document.getElementById('contact-modal-title').textContent = 'Edit Contact';

    document.getElementById('field-name').value         = c.name         || '';
    document.getElementById('field-email').value        = c.email        || '';
    document.getElementById('field-phone').value        = c.phone        || '';
    document.getElementById('field-social').value       = c.socialHandle || '';
    document.getElementById('field-current-role').value = c.currentRole  || '';
    document.getElementById('field-location').value     = c.location     || '';
    document.getElementById('field-how-met').value      = c.howWeMet     || '';
    document.getElementById('field-followup').value = c.followUpDate || '';
    document.getElementById('field-notes').value    = c.notes        || '';

    initCompanyAutocomplete(c);
    renderTagCheckboxes(Array.isArray(c.tags) ? c.tags : []);

    openModal('modal-contact');
    document.getElementById('field-name').focus();
}

document.getElementById('contact-form').addEventListener('submit', async e => {
    e.preventDefault();

    const companyText = coTextInput.value.trim();

    // If the user typed a company name without selecting an existing one,
    // find or create a company record and link by ID.
    if (companyText && !selectedCompanyId) {
        const existing = companies.find(c => c.name.toLowerCase() === companyText.toLowerCase());
        if (existing) {
            selectedCompanyId = existing.id;
        } else {
            const newCoRef = await db.collection('companies').add({
                name:      companyText,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            selectedCompanyId = newCoRef.id;
            await loadCompanies();
        }
    }

    const data = {
        name:        document.getElementById('field-name').value.trim(),
        email:       document.getElementById('field-email').value.trim(),
        phone:       document.getElementById('field-phone').value.trim(),
        socialHandle:document.getElementById('field-social').value.trim(),
        currentRole: document.getElementById('field-current-role').value.trim(),
        location:    document.getElementById('field-location').value.trim(),
        howWeMet:    document.getElementById('field-how-met').value.trim(),
        companyId:   selectedCompanyId || '',
        companyName: selectedCompanyId ? '' : companyText,
        tags:        getCheckedTags(),
        followUpDate:document.getElementById('field-followup').value,
        notes:       document.getElementById('field-notes').value.trim(),
        updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
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
        const batch   = db.batch();
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
// BULK ACTIONS
// ========================================================

function getVisibleContactIds() {
    return [...document.querySelectorAll('.row-cb')].map(cb => cb.dataset.id);
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-toolbar');
    const count   = selectedContactIds.size;
    if (count === 0) {
        toolbar.classList.add('hidden');
        const allCb = document.getElementById('select-all-cb');
        if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
        return;
    }
    toolbar.classList.remove('hidden');
    document.getElementById('bulk-count').textContent =
        `${count} contact${count !== 1 ? 's' : ''} selected`;

    const visibleIds = getVisibleContactIds();
    const allSelected  = visibleIds.length > 0 && visibleIds.every(id => selectedContactIds.has(id));
    const someSelected = visibleIds.some(id => selectedContactIds.has(id));
    const allCb = document.getElementById('select-all-cb');
    if (allCb) {
        allCb.checked       = allSelected;
        allCb.indeterminate = someSelected && !allSelected;
    }
}

async function bulkAssignTag() {
    const tagName = document.getElementById('bulk-tag-select').value;
    if (!tagName) { alert('Please select a tag.'); return; }
    if (selectedContactIds.size === 0) return;

    const btn = document.getElementById('btn-bulk-tag');
    btn.disabled = true;
    try {
        const ids = [...selectedContactIds];
        const CHUNK = 400;
        for (let i = 0; i < ids.length; i += CHUNK) {
            const batch = db.batch();
            ids.slice(i, i + CHUNK).forEach(id => {
                const c = contacts.find(x => x.id === id);
                if (!c) return;
                const newTags = [...new Set([...(Array.isArray(c.tags) ? c.tags : []), tagName])];
                batch.update(db.collection('contacts').doc(id), { tags: newTags });
            });
            await batch.commit();
        }
        selectedContactIds.clear();
        document.getElementById('bulk-tag-select').value = '';
        await loadContacts();
    } catch (err) {
        alert('Error assigning tag: ' + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function bulkAssignCompany() {
    const companyText = document.getElementById('bulk-company-input').value.trim();
    if (!companyText) { alert('Please enter a company name.'); return; }
    if (selectedContactIds.size === 0) return;

    const btn = document.getElementById('btn-bulk-company');
    btn.disabled = true;
    try {
        const ids = [...selectedContactIds];
        const CHUNK = 400;
        for (let i = 0; i < ids.length; i += CHUNK) {
            const batch = db.batch();
            ids.slice(i, i + CHUNK).forEach(id => {
                batch.update(db.collection('contacts').doc(id), {
                    companyId:   bulkCompanyId || '',
                    companyName: bulkCompanyId ? '' : companyText
                });
            });
            await batch.commit();
        }
        selectedContactIds.clear();
        document.getElementById('bulk-company-input').value = '';
        bulkCompanyId = null;
        await loadContacts();
    } catch (err) {
        alert('Error assigning company: ' + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function bulkDelete() {
    const ids = [...selectedContactIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} contact${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;

    try {
        for (const id of ids) {
            const actSnap = await db.collection('contacts').doc(id).collection('activities').get();
            const batch   = db.batch();
            actSnap.docs.forEach(doc => batch.delete(doc.ref));
            batch.delete(db.collection('contacts').doc(id));
            await batch.commit();
        }
        selectedContactIds.clear();
        await loadContacts();
    } catch (err) {
        alert('Error deleting contacts: ' + err.message);
    }
}

// Bulk company autocomplete
const bulkCoInput = document.getElementById('bulk-company-input');
const bulkCoSugg  = document.getElementById('bulk-company-suggestions');

bulkCoInput.addEventListener('input', () => {
    const q = bulkCoInput.value.toLowerCase().trim();
    bulkCompanyId = null;
    if (!q) { bulkCoSugg.classList.add('hidden'); return; }
    const matches = companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { bulkCoSugg.classList.add('hidden'); return; }
    bulkCoSugg.innerHTML = matches.map(c =>
        `<div class="suggestion-item" data-id="${c.id}" data-name="${escHtml(c.name)}">${escHtml(c.name)}</div>`
    ).join('');
    bulkCoSugg.classList.remove('hidden');
});

bulkCoSugg.addEventListener('mousedown', e => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    bulkCompanyId     = item.dataset.id;
    bulkCoInput.value = item.dataset.name;
    bulkCoSugg.classList.add('hidden');
});

bulkCoInput.addEventListener('blur', () => {
    setTimeout(() => bulkCoSugg.classList.add('hidden'), 150);
});

// ========================================================
// NOTES SEARCH
// ========================================================

let notesSearchTimer = null;

async function searchNotes() {
    const query   = document.getElementById('notes-search-input').value.trim();
    const results = document.getElementById('notes-search-results');
    if (!query) { results.innerHTML = ''; return; }

    results.innerHTML = '<div class="loading">Searching...</div>';
    try {
        const snap = await db.collectionGroup('activities')
            .orderBy('createdAt', 'desc')
            .limit(500)
            .get();

        const q = query.toLowerCase();
        const matches = [];
        snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.note && data.note.toLowerCase().includes(q)) {
                const contactId = doc.ref.parent.parent.id;
                const contact   = contacts.find(c => c.id === contactId);
                matches.push({
                    note:        data.note,
                    createdAt:   data.createdAt ? data.createdAt.toDate() : new Date(),
                    contactId,
                    contactName: contact ? contact.name : 'Unknown'
                });
            }
        });

        if (!matches.length) {
            results.innerHTML = '<div class="empty-state">No notes found matching that search.</div>';
            return;
        }

        results.innerHTML = `
            <div class="notes-result-count">${matches.length} note${matches.length !== 1 ? 's' : ''} found</div>
            ${matches.map(m => `
                <div class="note-result">
                    <div class="note-result-header">
                        <button class="btn-link" onclick="viewContact('${m.contactId}')">${escHtml(m.contactName)}</button>
                        <span class="note-result-time">${fmtDateTime(m.createdAt)}</span>
                    </div>
                    <div class="note-result-text">${highlightText(m.note, query)}</div>
                </div>`).join('')}`;
    } catch (err) {
        results.innerHTML = `<div class="empty-state">Error: ${escHtml(err.message)}</div>`;
    }
}

function highlightText(note, query) {
    const safe = escHtml(note);
    if (!query) return safe;
    try {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return safe.replace(new RegExp(escHtml(escaped), 'gi'), m => `<mark class="hl">${m}</mark>`);
    } catch { return safe; }
}

// ========================================================
// CONTACT MERGING
// ========================================================

function openMergeModal() {
    if (!currentContactId) return;
    mergeTargetId = null;
    const base = contacts.find(c => c.id === currentContactId);
    document.getElementById('merge-base-name').textContent = base ? `"${base.name}"` : 'this contact';
    document.getElementById('merge-search-input').value = '';
    document.getElementById('merge-search-results').innerHTML = '';
    document.getElementById('merge-step-search').classList.remove('hidden');
    document.getElementById('merge-step-confirm').classList.add('hidden');
    openModal('modal-merge');
    document.getElementById('merge-search-input').focus();
}

function renderMergeSearchResults(query) {
    const container = document.getElementById('merge-search-results');
    if (!query.trim()) { container.innerHTML = ''; return; }
    const q = query.toLowerCase();
    const results = contacts
        .filter(c => c.id !== currentContactId && c.name && c.name.toLowerCase().includes(q))
        .slice(0, 10);
    if (!results.length) {
        container.innerHTML = '<div class="empty-state" style="padding:12px">No contacts found.</div>';
        return;
    }
    container.innerHTML = results.map(c => {
        const coName = getDisplayCompany(c);
        return `
            <div class="merge-result-item" onclick="selectMergeTarget('${c.id}')">
                <div class="merge-result-name">${escHtml(c.name)}</div>
                ${coName ? `<div class="merge-result-co">${escHtml(coName)}</div>` : ''}
            </div>`;
    }).join('');
}

async function selectMergeTarget(targetId) {
    mergeTargetId = targetId;
    const keepC   = contacts.find(c => c.id === currentContactId);
    const delC    = contacts.find(c => c.id === targetId);
    if (!keepC || !delC) return;

    const mergedTags = [...new Set([
        ...(Array.isArray(keepC.tags) ? keepC.tags : []),
        ...(Array.isArray(delC.tags)  ? delC.tags  : [])
    ])];
    const tagHtml = mergedTags.length
        ? mergedTags.map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')
        : '<span style="color:#aaa">None</span>';

    // Count activities for each
    let keepCount = 0, delCount = 0;
    try {
        const [ks, ds] = await Promise.all([
            db.collection('contacts').doc(currentContactId).collection('activities').get(),
            db.collection('contacts').doc(targetId).collection('activities').get()
        ]);
        keepCount = ks.size;
        delCount  = ds.size;
    } catch { /* non-critical */ }

    document.getElementById('merge-confirm-content').innerHTML = `
        <div class="merge-comparison">
            <div class="merge-keep-col">
                <div class="merge-col-label keep-label">KEEP</div>
                <div class="merge-col-name">${escHtml(keepC.name)}</div>
                ${keepC.email ? `<div class="merge-col-detail">${escHtml(keepC.email)}</div>` : ''}
                ${getDisplayCompany(keepC) ? `<div class="merge-col-detail">${escHtml(getDisplayCompany(keepC))}</div>` : ''}
                <div class="merge-col-detail">${keepCount} existing note${keepCount !== 1 ? 's' : ''}</div>
            </div>
            <div class="merge-plus">+</div>
            <div class="merge-del-col">
                <div class="merge-col-label del-label">DELETE</div>
                <div class="merge-col-name">${escHtml(delC.name)}</div>
                ${delC.email ? `<div class="merge-col-detail">${escHtml(delC.email)}</div>` : ''}
                ${getDisplayCompany(delC) ? `<div class="merge-col-detail">${escHtml(getDisplayCompany(delC))}</div>` : ''}
                <div class="merge-col-detail">${delCount} note${delCount !== 1 ? 's' : ''} will be moved</div>
                ${delC.notes ? `<div class="merge-col-detail" style="color:#c82333">Notes field will be appended as an activity</div>` : ''}
            </div>
        </div>
        <div class="merge-result-preview">
            <strong>Merged tags:</strong> ${tagHtml}
        </div>`;

    document.getElementById('merge-step-search').classList.add('hidden');
    document.getElementById('merge-step-confirm').classList.remove('hidden');
}

async function executeMerge() {
    if (!currentContactId || !mergeTargetId) return;
    const keepC = contacts.find(c => c.id === currentContactId);
    const delC  = contacts.find(c => c.id === mergeTargetId);
    if (!keepC || !delC) return;

    const btn = document.getElementById('btn-merge-confirm');
    btn.disabled = true;
    btn.textContent = 'Merging...';

    try {
        const keepRef = db.collection('contacts').doc(currentContactId);
        const delRef  = db.collection('contacts').doc(mergeTargetId);

        // Fetch all source activities
        const srcSnap = await delRef.collection('activities').get();

        // Copy source activities + delete them in chunks of 200 (set+delete = 2 ops each)
        const CHUNK = 200;
        const srcDocs = srcSnap.docs;
        for (let i = 0; i < srcDocs.length; i += CHUNK) {
            const batch = db.batch();
            srcDocs.slice(i, i + CHUNK).forEach(doc => {
                batch.set(keepRef.collection('activities').doc(), doc.data());
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        // Final batch: merge annotation + update keep contact + delete source
        const mergedTags = [...new Set([
            ...(Array.isArray(keepC.tags) ? keepC.tags : []),
            ...(Array.isArray(delC.tags)  ? delC.tags  : [])
        ])];

        const finalBatch = db.batch();
        const mergeNote = `[Merged from "${delC.name}"]${delC.notes ? `\nOriginal notes: ${delC.notes}` : ''}`;
        finalBatch.set(keepRef.collection('activities').doc(), {
            note: mergeNote,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        finalBatch.update(keepRef, {
            tags: mergedTags,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        finalBatch.delete(delRef);
        await finalBatch.commit();

        closeModal('modal-merge');
        mergeTargetId = null;
        await loadContacts();
        viewContact(currentContactId);
    } catch (err) {
        alert('Merge error: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Merge & Delete Duplicate';
    }
}

// ========================================================
// DASHBOARD
// ========================================================

async function renderDashboard() {
    const el = document.getElementById('dashboard-content');
    el.innerHTML = '<div class="loading" style="padding:40px;text-align:center">Loading dashboard...</div>';

    const today         = todayDate();
    const weekEnd       = weekEndDate();
    const sevenDaysAgo  = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const overdue       = contacts.filter(c => c.followUpDate && c.followUpDate < today);
    const dueThisWeek   = contacts.filter(c => c.followUpDate && c.followUpDate >= today && c.followUpDate <= weekEnd);
    const recentlyAdded = contacts.filter(c => c.createdAt && c.createdAt.toDate() > sevenDaysAgo);
    const goingCold     = contacts.filter(c => {
        if (c.createdAt && c.createdAt.toDate() > thirtyDaysAgo) return false;
        if (c.lastActivityAt && c.lastActivityAt.toDate() > thirtyDaysAgo) return false;
        return true;
    });

    const recentActivity = await loadRecentActivities();

    const nameLink = c => `<button class="btn-link" onclick="viewContact('${c.id}')">${escHtml(c.name)}</button>`;
    const sectionList = (items, emptyMsg) => items.length === 0
        ? `<div class="dash-empty">${emptyMsg}</div>`
        : `<ul class="dash-list">${items.map(c => `<li>${nameLink(c)}</li>`).join('')}</ul>`;

    el.innerHTML = `
        <div class="dash-stats">
            <div class="dash-stat-card">
                <div class="dash-stat-number">${contacts.length}</div>
                <div class="dash-stat-label">Total Contacts</div>
            </div>
            <div class="dash-stat-card stat-overdue">
                <div class="dash-stat-number">${overdue.length}</div>
                <div class="dash-stat-label">Overdue Follow-Ups</div>
            </div>
            <div class="dash-stat-card stat-week">
                <div class="dash-stat-number">${dueThisWeek.length}</div>
                <div class="dash-stat-label">Due This Week</div>
            </div>
            <div class="dash-stat-card stat-new">
                <div class="dash-stat-number">${recentlyAdded.length}</div>
                <div class="dash-stat-label">Added Last 7 Days</div>
            </div>
        </div>

        <div class="dash-columns">
            <div class="dash-section">
                <h3 class="dash-section-title">Overdue Follow-Ups <span class="dash-count">${overdue.length}</span></h3>
                ${sectionList(overdue, 'No overdue follow-ups.')}
            </div>
            <div class="dash-section">
                <h3 class="dash-section-title">Due This Week <span class="dash-count">${dueThisWeek.length}</span></h3>
                ${sectionList(dueThisWeek, 'Nothing due this week.')}
            </div>
            <div class="dash-section">
                <h3 class="dash-section-title">Added Last 7 Days <span class="dash-count">${recentlyAdded.length}</span></h3>
                ${sectionList(recentlyAdded, 'No new contacts this week.')}
            </div>
            <div class="dash-section">
                <h3 class="dash-section-title">Going Cold <span class="dash-count">${goingCold.length}</span></h3>
                <div class="dash-section-note">No activity in 30+ days</div>
                ${sectionList(goingCold, 'All contacts are active.')}
            </div>
        </div>

        <div class="dash-section dash-feed">
            <h3 class="dash-section-title">Recent Activity</h3>
            ${recentActivity.length === 0
                ? '<div class="dash-empty">No activity logged yet.</div>'
                : recentActivity.map(a => `
                    <div class="dash-feed-item">
                        <div class="dash-feed-header">
                            <button class="btn-link" onclick="viewContact('${a.contactId}')">${escHtml(a.contactName)}</button>
                            <span class="dash-feed-time">${fmtDateTime(a.createdAt)}</span>
                        </div>
                        <div class="dash-feed-note">${escHtml(a.note)}</div>
                    </div>`).join('')
            }
        </div>`;
}

async function loadRecentActivities() {
    try {
        const snap = await db.collectionGroup('activities')
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
        return snap.docs.map(doc => {
            const data      = doc.data();
            const contactId = doc.ref.parent.parent.id;
            const contact   = contacts.find(c => c.id === contactId);
            return {
                contactId,
                contactName: contact ? contact.name : 'Unknown',
                note: data.note || '',
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
            };
        });
    } catch (err) {
        console.warn('Recent activity feed unavailable:', err.message);
        return [];
    }
}

// ========================================================
// CSV IMPORT
// ========================================================

function openImportModal() {
    importHeaders = [];
    importRows    = [];
    document.getElementById('import-csv-file').value = '';
    document.getElementById('import-file-name').textContent = 'No file selected';
    document.getElementById('import-step-upload').classList.remove('hidden');
    document.getElementById('import-step-map').classList.add('hidden');
    document.getElementById('import-step-result').classList.add('hidden');
    openModal('modal-import');
}

function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i], next = text[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') { field += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { field += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { row.push(field); field = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && next === '\n') i++;
                row.push(field); field = '';
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
            } else { field += ch; }
        }
    }
    if (field || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
}

function autoMapColumn(header) {
    const h = header.toLowerCase().trim();
    if (['name','full name','contact name','display name'].includes(h)) return 'name';
    if (['first name','given name','firstname'].includes(h)) return 'firstName';
    if (['last name','family name','surname','lastname'].includes(h)) return 'lastName';
    if (h === 'email' || h === 'email address' || h.startsWith('e-mail') || h.includes('email 1 - value')) return 'email';
    if (h === 'phone' || h === 'phone number' || h.includes('phone 1 - value') || h.includes('mobile') || h.includes('cell')) return 'phone';
    if (['company','organization','organization name','company name'].includes(h)) return 'companyName';
    if (['notes','note','description'].includes(h)) return 'notes';
    if (['tags','labels','label','group membership'].includes(h)) return 'tags';
    if (['url','profile url','linkedin url'].includes(h)) return 'socialHandle';
    return '';
}

document.getElementById('import-csv-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('import-file-name').textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => {
        const allRows = parseCSV(ev.target.result);
        if (allRows.length < 2) { alert('CSV appears empty or has no data rows.'); return; }
        importHeaders = allRows[0];
        importRows    = allRows.slice(1);

        // Preview table (first 5 rows)
        const previewRows = importRows.slice(0, 5);
        const thHtml = importHeaders.map(h => `<th>${escHtml(h)}</th>`).join('');
        const trHtml = previewRows.map(r => {
            const cells = importHeaders.map((_, i) => `<td>${escHtml(r[i] || '')}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        document.getElementById('import-preview-wrap').innerHTML =
            `<div class="import-preview-scroll"><table class="data-table"><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table></div>`;

        // Mapping rows
        document.getElementById('import-map-body').innerHTML = importHeaders.map((h, i) => {
            const auto = autoMapColumn(h);
            const opts = CRM_IMPORT_FIELDS.map(f =>
                `<option value="${f.value}"${f.value === auto ? ' selected' : ''}>${escHtml(f.label)}</option>`
            ).join('');
            return `<tr>
                <td class="import-col-name">${escHtml(h)}</td>
                <td><select class="import-field-sel" data-col="${i}">${opts}</select></td>
            </tr>`;
        }).join('');

        document.getElementById('btn-import-run').textContent = `Import ${importRows.length} Contact${importRows.length !== 1 ? 's' : ''}`;

        document.getElementById('import-step-upload').classList.add('hidden');
        document.getElementById('import-step-map').classList.remove('hidden');
    };
    reader.readAsText(file);
});

document.getElementById('btn-import-back').addEventListener('click', () => {
    document.getElementById('import-step-map').classList.add('hidden');
    document.getElementById('import-step-upload').classList.remove('hidden');
});

document.getElementById('btn-import-run').addEventListener('click', async () => {
    const mapping = {};
    document.querySelectorAll('.import-field-sel').forEach(sel => {
        if (sel.value) mapping[parseInt(sel.dataset.col)] = sel.value;
    });

    if (!Object.values(mapping).some(v => v === 'name' || v === 'firstName' || v === 'lastName')) {
        alert('Please map at least a Name, First Name, or Last Name column.');
        return;
    }

    const btn = document.getElementById('btn-import-run');
    btn.disabled = true;
    btn.textContent = 'Importing...';

    let imported = 0, skipped = 0;
    const batchSize = 400;

    try {
        for (let start = 0; start < importRows.length; start += batchSize) {
            const batch = db.batch();
            const chunk = importRows.slice(start, start + batchSize);
            for (const row of chunk) {
                const raw = {};
                Object.entries(mapping).forEach(([colIdx, field]) => {
                    raw[field] = (row[parseInt(colIdx)] || '').trim();
                });

                // Build name from parts
                let name = raw.name || '';
                if (!name && (raw.firstName || raw.lastName)) {
                    name = [raw.firstName, raw.lastName].filter(Boolean).join(' ');
                }
                if (!name) { skipped++; continue; }

                // Clean up tags from Google Contacts "* myContacts ::: Tag" format
                let tagsArr = [];
                if (raw.tags) {
                    tagsArr = raw.tags.split(/[\s]*:::\s*|[;,]/)
                        .map(t => t.replace(/^\*\s*/, '').trim())
                        .filter(t => t && t.toLowerCase() !== 'mycontacts' && t !== '*');
                }

                const contact = {
                    name,
                    email:        raw.email        || '',
                    phone:        raw.phone         || '',
                    companyName:  raw.companyName   || '',
                    companyId:    '',
                    socialHandle: raw.socialHandle  || '',
                    howWeMet:     raw.howWeMet      || '',
                    notes:        raw.notes         || '',
                    tags:         tagsArr,
                    followUpDate: raw.followUpDate  || '',
                    createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(db.collection('contacts').doc(), contact);
                imported++;
            }
            await batch.commit();
        }

        document.getElementById('import-step-map').classList.add('hidden');
        document.getElementById('import-result-msg').innerHTML = `
            <div class="import-success">
                <div class="import-success-icon">&#10003;</div>
                <div class="import-success-text">
                    <strong>${imported} contact${imported !== 1 ? 's' : ''} imported successfully.</strong>
                    ${skipped ? `<div style="color:#888;margin-top:4px">${skipped} row${skipped !== 1 ? 's' : ''} skipped (no name found).</div>` : ''}
                </div>
            </div>`;
        document.getElementById('import-step-result').classList.remove('hidden');
        await loadContacts();
    } catch (err) {
        alert('Import error: ' + err.message);
        btn.disabled = false;
        btn.textContent = `Import ${importRows.length} Contacts`;
    }
});

document.getElementById('btn-import-done').addEventListener('click', () => {
    closeModal('modal-import');
    showView('view-list');
    renderTable();
});

// ========================================================
// EVENT LISTENERS
// ========================================================

document.getElementById('btn-nav-dashboard').addEventListener('click', () => {
    showView('view-dashboard');
    renderDashboard();
});

document.getElementById('btn-nav-contacts').addEventListener('click', () => {
    showView('view-list');
    renderTable();
});

document.getElementById('btn-nav-notes-search').addEventListener('click', () => {
    showView('view-notes-search');
    document.getElementById('notes-search-input').focus();
});

document.getElementById('btn-import-csv').addEventListener('click', openImportModal);

// ---- Bulk selection ----
document.getElementById('select-all-cb').addEventListener('change', e => {
    const visibleIds = getVisibleContactIds();
    if (e.target.checked) {
        visibleIds.forEach(id => selectedContactIds.add(id));
    } else {
        visibleIds.forEach(id => selectedContactIds.delete(id));
    }
    document.querySelectorAll('.row-cb').forEach(cb => {
        cb.checked = selectedContactIds.has(cb.dataset.id);
    });
    updateBulkToolbar();
});

document.getElementById('contacts-tbody').addEventListener('change', e => {
    if (!e.target.matches('.row-cb')) return;
    const id = e.target.dataset.id;
    e.target.checked ? selectedContactIds.add(id) : selectedContactIds.delete(id);
    updateBulkToolbar();
});

document.getElementById('btn-bulk-tag').addEventListener('click', bulkAssignTag);
document.getElementById('btn-bulk-company').addEventListener('click', bulkAssignCompany);
document.getElementById('btn-bulk-delete').addEventListener('click', bulkDelete);
document.getElementById('btn-bulk-clear').addEventListener('click', () => {
    selectedContactIds.clear();
    document.querySelectorAll('.row-cb').forEach(cb => cb.checked = false);
    updateBulkToolbar();
});

// ---- Notes search ----
document.getElementById('notes-search-input').addEventListener('input', () => {
    clearTimeout(notesSearchTimer);
    notesSearchTimer = setTimeout(searchNotes, 400);
});
document.getElementById('notes-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(notesSearchTimer); searchNotes(); }
});
document.getElementById('btn-notes-search').addEventListener('click', () => {
    clearTimeout(notesSearchTimer); searchNotes();
});

// ---- Merge ----
document.getElementById('btn-merge-contact').addEventListener('click', openMergeModal);

document.getElementById('merge-search-input').addEventListener('input', e => {
    renderMergeSearchResults(e.target.value);
});

document.getElementById('btn-merge-back').addEventListener('click', () => {
    document.getElementById('merge-step-confirm').classList.add('hidden');
    document.getElementById('merge-step-search').classList.remove('hidden');
});

document.getElementById('btn-merge-confirm').addEventListener('click', executeMerge);

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

document.getElementById('filter-company').addEventListener('change', e => {
    activeCompanyFilter = e.target.value;
    renderTable();
});

document.querySelectorAll('.followup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const bucket = btn.dataset.bucket;
        activeFollowUpFilter = activeFollowUpFilter === bucket ? '' : bucket;
        document.querySelectorAll('.followup-btn').forEach(b => b.classList.remove('active'));
        if (activeFollowUpFilter) btn.classList.add('active');
        renderTable();
    });
});

document.querySelectorAll('#contacts-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortCol === col) {
            sortDir = -sortDir;
        } else {
            sortCol = col;
            sortDir = 1;
        }
        renderTable();
    });
});

// ========================================================
// HELPERS
// ========================================================

function todayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function weekEndDate() {
    const d = new Date();
    const daysUntilSunday = d.getDay() === 0 ? 0 : 7 - d.getDay();
    d.setDate(d.getDate() + daysUntilSunday);
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
            'auth/user-not-found':     'No account found with that email.',
            'auth/wrong-password':     'Incorrect password.',
            'auth/invalid-email':      'Please enter a valid email address.',
            'auth/too-many-requests':  'Too many attempts. Please try again later.',
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
// INIT
// ========================================================
async function init() {
    showView('view-dashboard');
    await Promise.all([loadTags(), loadCompanies()]);
    populateTagFilter();
    await loadContacts();
    renderDashboard();
}
