import { api, getUser, clearSession, requireSession, avatarHTML, escapeHTML } from './api.js';
import { fileToAvatarDataUrl } from './imageUtils.js';

requireSession();
const me = getUser();
const groupId = new URLSearchParams(window.location.search).get('id');
if (!groupId) window.location.href = '/dashboard.html';

document.getElementById('whoami').innerHTML = `${avatarHTML(me, 30)} <span>${escapeHTML(me.pseudo)}</span>`;
document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); window.location.href = '/index.html'; });

const errorBox = document.getElementById('errorBox');
const successBox = document.getElementById('successBox');
function showError(msg) { errorBox.textContent = msg; errorBox.classList.remove('hidden'); setTimeout(() => errorBox.classList.add('hidden'), 5000); }
function showSuccess(msg) { successBox.textContent = msg; successBox.classList.remove('hidden'); setTimeout(() => successBox.classList.add('hidden'), 4000); }

let currentGroup = null;
let isAdmin = false;

// ---------- header ----------
async function loadHeader() {
  try {
    const { group } = await api(`/groups/${groupId}`);
    currentGroup = group;
    isAdmin = group.myRole === 'ADMIN';
    document.getElementById('membersTabBtn').classList.toggle('hidden', false);

    document.getElementById('groupHeader').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
        <div>
          <h1 style="font-size:2.2rem;">${escapeHTML(group.name)}</h1>
          ${group.description ? `<p style="max-width:520px;">${escapeHTML(group.description)}</p>` : ''}
          <span class="invite-code" title="Code d'invitation à partager">${escapeHTML(group.inviteCode)}</span>
        </div>
        <div class="panel" style="text-align:center; padding:0.9rem 1.4rem;">
          <div style="font-size:0.75rem; color:var(--chalk-dim);">TON SOLDE</div>
          <div class="mono" style="font-size:1.6rem; color:var(--yellow);">${group.myBalance} pts</div>
        </div>
      </div>`;
  } catch (err) {
    showError(err.message);
  }
}

// ---------- tabs ----------
document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['bets', 'leaderboard', 'members', 'shop', 'auto'].forEach((t) => {
      document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== btn.dataset.tab);
    });
    if (btn.dataset.tab === 'leaderboard') loadLeaderboard();
    if (btn.dataset.tab === 'members') loadMembers();
    if (btn.dataset.tab === 'shop') loadShop();
    if (btn.dataset.tab === 'auto') loadCompetitions();
  });
});

// ---------- bets tab ----------
function statusLabel(s) {
  return { OPEN: 'Ouvert', CLOSED: 'Fermé', RESOLVED: 'Résolu', CANCELLED: 'Annulé' }[s] || s;
}
function statusPill(s) {
  return `<span class="pill pill-${s.toLowerCase()}">${statusLabel(s)}</span>`;
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
}

async function loadBets() {
  try {
    const { bets } = await api(`/groups/${groupId}/bets`);
    const list = document.getElementById('betsList');
    if (bets.length === 0) {
      list.innerHTML = `<p>Aucun pari pour l'instant. Lance le premier !</p>`;
      return;
    }
    list.innerHTML = bets.map(renderBetCard).join('');
    attachBetCardHandlers();
  } catch (err) {
    showError(err.message);
  }
}

function renderBetCard(bet) {
  const resolved = bet.status === 'RESOLVED';
  const optionsHTML = bet.options.map((o) => {
    const share = bet.totalPool > 0 ? Math.round((o.pool / bet.totalPool) * 100) : 0;
    const won = resolved && o.id === bet.resolvedOptionId;
    const lost = resolved && o.id !== bet.resolvedOptionId;
    return `
      <div class="option-row ${won ? 'won' : ''} ${lost ? 'lost' : ''}">
        <div class="option-top">
          <span class="option-label">${won ? '🏆 ' : ''}${escapeHTML(o.label)}</span>
          <span class="option-nums">${o.odds ? `<span class="odds">x${o.odds}</span> · ` : ''}${o.pool} pts${o.myStake ? ` <span class="mono" style="color:var(--teal)">(toi: ${o.myStake})</span>` : ''}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${share}%"></div></div>
        ${bet.status === 'OPEN' ? `
          <div class="wager-row">
            <input type="number" min="1" class="wager-amount" placeholder="pts">
            <button class="btn btn-ghost btn-small wager-btn" data-bet="${bet.id}" data-option="${o.id}">Miser</button>
          </div>` : ''}
        ${isAdmin && (bet.status === 'OPEN' || bet.status === 'CLOSED') ? `
          <button class="btn btn-ghost btn-small resolve-btn" data-bet="${bet.id}" data-option="${o.id}" data-label="${escapeHTML(o.label)}">Déclarer gagnant</button>` : ''}
      </div>`;
  }).join('');

  const adminControls = isAdmin && (bet.status === 'OPEN' || bet.status === 'CLOSED') ? `
    <div style="display:flex; gap:0.5rem; margin-top:0.8rem;">
      ${bet.status === 'OPEN' ? `<button class="btn btn-ghost btn-small close-btn" data-bet="${bet.id}">Fermer les mises</button>` : ''}
      <button class="btn btn-danger btn-small cancel-btn" data-bet="${bet.id}">Annuler le pari</button>
    </div>` : '';

  return `
    <div class="board-card">
      <div class="board-card-head">
        <div>
          <h3>${escapeHTML(bet.title)}</h3>
          ${bet.description ? `<p style="font-size:0.88rem;">${escapeHTML(bet.description)}</p>` : ''}
          <div class="board-meta">Par ${escapeHTML(bet.createdBy)} · ${bet.totalPool} pts en jeu${bet.closesAt ? ` · clôture ${fmtDate(bet.closesAt)}` : ''}</div>
        </div>
        ${statusPill(bet.status)}
      </div>
      ${optionsHTML}
      ${adminControls}
    </div>`;
}

function attachBetCardHandlers() {
  document.querySelectorAll('.wager-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.wager-row');
      const amount = parseInt(row.querySelector('.wager-amount').value, 10);
      if (!amount || amount <= 0) return showError('Entre un montant valide.');
      try {
        await api(`/bets/${btn.dataset.bet}/wager`, { method: 'POST', body: { optionId: btn.dataset.option, amount } });
        showSuccess('Mise placée !');
        loadHeader(); loadBets();
      } catch (err) { showError(err.message); }
    });
  });

  document.querySelectorAll('.resolve-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Déclarer "${btn.dataset.label}" comme option gagnante ? Cette action est définitive.`)) return;
      try {
        await api(`/bets/${btn.dataset.bet}/resolve`, { method: 'POST', body: { winningOptionId: btn.dataset.option } });
        showSuccess('Pari résolu, les gains sont distribués.');
        loadHeader(); loadBets();
      } catch (err) { showError(err.message); }
    });
  });

  document.querySelectorAll('.close-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/bets/${btn.dataset.bet}/status`, { method: 'POST', body: { action: 'close' } });
        showSuccess('Mises fermées.');
        loadBets();
      } catch (err) { showError(err.message); }
    });
  });

  document.querySelectorAll('.cancel-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Annuler ce pari ? Tout le monde sera remboursé.')) return;
      try {
        await api(`/bets/${btn.dataset.bet}/status`, { method: 'POST', body: { action: 'cancel' } });
        showSuccess('Pari annulé, tout le monde est remboursé.');
        loadHeader(); loadBets();
      } catch (err) { showError(err.message); }
    });
  });
}

// ---------- new bet modal ----------
const betModal = document.getElementById('betModal');
document.getElementById('openNewBet').addEventListener('click', () => betModal.classList.remove('hidden'));
document.getElementById('cancelBet').addEventListener('click', () => betModal.classList.add('hidden'));
document.getElementById('addOption').addEventListener('click', () => {
  const wrap = document.getElementById('optionsWrap');
  const input = document.createElement('input');
  input.className = 'opt-input';
  input.style.marginBottom = '0.5rem';
  input.placeholder = `Option ${wrap.children.length + 1}`;
  wrap.appendChild(input);
});
document.getElementById('betForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const options = Array.from(document.querySelectorAll('.opt-input')).map((i) => i.value.trim()).filter(Boolean);
  try {
    await api(`/groups/${groupId}/bets`, {
      method: 'POST',
      body: {
        title: document.getElementById('bTitle').value,
        description: document.getElementById('bDesc').value,
        options,
        closesAt: document.getElementById('bCloses').value || undefined,
      },
    });
    betModal.classList.add('hidden');
    document.getElementById('betForm').reset();
    document.getElementById('optionsWrap').innerHTML = `
      <input class="opt-input" style="margin-bottom:0.5rem;" placeholder="Option 1" required>
      <input class="opt-input" style="margin-bottom:0.5rem;" placeholder="Option 2" required>`;
    showSuccess('Pari lancé !');
    loadBets();
  } catch (err) { showError(err.message); }
});

// ---------- leaderboard tab ----------
async function loadLeaderboard() {
  try {
    const { leaderboard } = await api(`/groups/${groupId}/leaderboard`);
    document.getElementById('leaderboardList').innerHTML = leaderboard.map((row) => `
      <div class="lb-row">
        <span class="lb-rank">#${row.rank}</span>
        ${avatarHTML({ pseudo: row.pseudo, avatarUrl: row.avatarUrl }, 34)}
        <span>${escapeHTML(row.pseudo)}${row.pseudo === me.pseudo ? ' (toi)' : ''}</span>
        <span class="lb-balance">
          <div class="mono">${row.balance} pts</div>
          <div class="mono ${row.net >= 0 ? 'net-pos' : 'net-neg'}" style="font-size:0.75rem;">${row.net >= 0 ? '+' : ''}${row.net}</div>
        </span>
      </div>`).join('');
  } catch (err) { showError(err.message); }
}

// ---------- members tab ----------
async function loadMembers() {
  try {
    const { members, pending } = await api(`/groups/${groupId}/members`);
    document.getElementById('memberList').innerHTML = members.map((m) => `
      <div class="member-row">
        ${avatarHTML(m.user, 34)}
        <span class="grow">${escapeHTML(m.user.pseudo)}${m.user.pseudo === me.pseudo ? ' (toi)' : ''}</span>
        ${m.role === 'ADMIN' ? '<span class="role-tag">ADMIN</span>' : ''}
        <span class="mono">${m.balance} pts</span>
      </div>`).join('');

    const pendingSection = document.getElementById('pendingSection');
    if (pending) {
      pendingSection.classList.toggle('hidden', pending.length === 0);
      document.getElementById('pendingList').innerHTML = pending.map((p) => `
        <div class="member-row">
          ${avatarHTML(p.user, 34)}
          <span class="grow">${escapeHTML(p.user.pseudo)}</span>
          <button class="btn btn-ghost btn-small approve-btn" data-user="${p.user.id}">Accepter</button>
          <button class="btn btn-danger btn-small reject-btn" data-user="${p.user.id}">Refuser</button>
        </div>`).join('');

      document.querySelectorAll('.approve-btn').forEach((btn) => {
        btn.addEventListener('click', () => decide(btn.dataset.user, 'approve'));
      });
      document.querySelectorAll('.reject-btn').forEach((btn) => {
        btn.addEventListener('click', () => decide(btn.dataset.user, 'reject'));
      });
    } else {
      pendingSection.classList.add('hidden');
    }
  } catch (err) { showError(err.message); }
}

async function decide(userId, action) {
  try {
    await api(`/groups/${groupId}/members/${userId}/approve`, { method: 'POST', body: { action } });
    showSuccess(action === 'approve' ? 'Membre accepté.' : 'Demande refusée.');
    loadMembers(); loadHeader();
  } catch (err) { showError(err.message); }
}

// ---------- shop tab ----------
async function loadShop() {
  document.getElementById('adminShopForm').classList.toggle('hidden', !isAdmin);
  document.getElementById('ordersSection').classList.toggle('hidden', !isAdmin);
  try {
    const { items, myBalance } = await api(`/groups/${groupId}/shop`);
    const grid = document.getElementById('shopGrid');
    if (items.length === 0) {
      grid.innerHTML = `<p>Aucun article pour l'instant.${isAdmin ? ' Ajoute-en un, ou charge le pack par défaut ci-dessus.' : ''}</p>`;
    } else {
      grid.innerHTML = items.map((it) => {
        const canAfford = myBalance >= it.cost;
        const outOfStock = it.stock !== null && it.stock <= 0;
        const visual = it.imageUrl
          ? `<img src="${escapeHTML(it.imageUrl)}" alt="${escapeHTML(it.name)}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px;">`
          : `<span class="emoji">${it.emoji}</span>`;
        return `
        <div class="shop-card ${!it.active ? 'inactive' : ''}">
          ${visual}
          <strong>${escapeHTML(it.name)}</strong>
          ${it.description ? `<p style="font-size:0.85rem;">${escapeHTML(it.description)}</p>` : ''}
          <span class="cost">${it.cost} pts</span>
          ${it.stock !== null ? `<span class="stock-tag">${it.stock} en stock</span>` : ''}
          ${!isAdmin && it.active ? `
            <button class="btn btn-primary btn-small buy-btn" data-id="${it.id}" ${(!canAfford || outOfStock) ? 'disabled' : ''}>
              ${outOfStock ? 'Épuisé' : canAfford ? 'Acheter' : 'Solde insuffisant'}
            </button>` : ''}
          ${isAdmin ? `
            <div class="shop-admin-row">
              <label class="btn btn-ghost btn-small" style="cursor:pointer;">
                Photo
                <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden item-photo-input" data-id="${it.id}">
              </label>
              <button class="btn btn-ghost btn-small toggle-item-btn" data-id="${it.id}" data-active="${it.active}">${it.active ? 'Désactiver' : 'Activer'}</button>
              <button class="btn btn-danger btn-small delete-item-btn" data-id="${it.id}">Supprimer</button>
            </div>` : ''}
        </div>`;
      }).join('');
    }

    document.querySelectorAll('.buy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Confirmer cet achat ?')) return;
        try {
          await api(`/shop/${btn.dataset.id}/buy`, { method: 'POST' });
          showSuccess('Achat effectué !');
          loadHeader(); loadShop();
        } catch (err) { showError(err.message); }
      });
    });
    document.querySelectorAll('.toggle-item-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/groups/${groupId}/shop/${btn.dataset.id}`, { method: 'PATCH', body: { active: btn.dataset.active !== 'true' } });
          loadShop();
        } catch (err) { showError(err.message); }
      });
    });
    document.querySelectorAll('.delete-item-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer cet article ?')) return;
        try {
          await api(`/groups/${groupId}/shop/${btn.dataset.id}`, { method: 'DELETE' });
          loadShop();
        } catch (err) { showError(err.message); }
      });
    });
    document.querySelectorAll('.item-photo-input').forEach((input) => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await fileToAvatarDataUrl(file);
          await api(`/groups/${groupId}/shop/${input.dataset.id}/image`, { method: 'POST', body: { imageBase64: dataUrl } });
          showSuccess('Photo mise à jour.');
          loadShop();
        } catch (err) { showError(err.message); }
      });
    });

    if (isAdmin) loadOrders();
  } catch (err) { showError(err.message); }
}

document.getElementById('seedDefaultsBtn').addEventListener('click', async () => {
  try {
    const data = await api(`/groups/${groupId}/shop/seed-defaults`, { method: 'POST' });
    showSuccess(data.created > 0 ? `${data.created} article(s) ajouté(s).` : (data.message || 'Rien à ajouter.'));
    loadShop();
  } catch (err) { showError(err.message); }
});

let newItemPhotoDataUrl = null;
document.getElementById('siPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newItemPhotoDataUrl = await fileToAvatarDataUrl(file);
    const preview = document.getElementById('siPhotoPreview');
    preview.style.backgroundImage = `url(${newItemPhotoDataUrl})`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
  } catch (err) { showError(err.message); }
});

document.getElementById('shopForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const stockVal = document.getElementById('siStock').value;
  try {
    await api(`/groups/${groupId}/shop`, {
      method: 'POST',
      body: {
        emoji: document.getElementById('siEmoji').value,
        name: document.getElementById('siName').value,
        description: document.getElementById('siDesc').value,
        cost: parseInt(document.getElementById('siCost').value, 10),
        stock: stockVal === '' ? null : parseInt(stockVal, 10),
        imageBase64: newItemPhotoDataUrl || undefined,
      },
    });
    document.getElementById('shopForm').reset();
    document.getElementById('siEmoji').value = '🎁';
    newItemPhotoDataUrl = null;
    const preview = document.getElementById('siPhotoPreview');
    preview.style.backgroundImage = 'none';
    showSuccess('Article ajouté !');
    loadShop();
  } catch (err) { showError(err.message); }
});

async function loadOrders() {
  try {
    const { purchases } = await api(`/groups/${groupId}/purchases`);
    const pending = purchases.filter((p) => p.status === 'PENDING');
    document.getElementById('ordersList').innerHTML = pending.length === 0
      ? `<p>Aucune commande en attente.</p>`
      : pending.map((p) => `
        <div class="order-row">
          ${avatarHTML(p.user, 32)}
          <span class="grow">${escapeHTML(p.user.pseudo)} — ${escapeHTML(p.itemName)} <span class="mono" style="color:var(--yellow);">(${p.costPaid} pts)</span></span>
          <button class="btn btn-ghost btn-small fulfill-btn" data-id="${p.id}">Honorée</button>
          <button class="btn btn-danger btn-small cancel-order-btn" data-id="${p.id}">Annuler</button>
        </div>`).join('');

    document.querySelectorAll('.fulfill-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/purchases/${btn.dataset.id}/fulfill`, { method: 'POST', body: { action: 'fulfill' } });
          showSuccess('Commande marquée honorée.');
          loadOrders();
        } catch (err) { showError(err.message); }
      });
    });
    document.querySelectorAll('.cancel-order-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Annuler cette commande ? Les points seront remboursés.')) return;
        try {
          await api(`/purchases/${btn.dataset.id}/fulfill`, { method: 'POST', body: { action: 'cancel' } });
          showSuccess('Commande annulée, points remboursés.');
          loadOrders(); loadShop();
        } catch (err) { showError(err.message); }
      });
    });
  } catch (err) { showError(err.message); }
}

// ---------- auto tab ----------
const SPORT_EMOJI = { FOOTBALL: '⚽', BASKETBALL: '🏀', ESPORTS: '🎮' };

async function loadCompetitions() {
  document.getElementById('adminAutoForm').classList.toggle('hidden', !isAdmin);
  try {
    const { competitions } = await api(`/groups/${groupId}/competitions`);
    const list = document.getElementById('compList');
    if (competitions.length === 0) {
      list.innerHTML = `<p>Aucune compétition suivie pour l'instant.</p>`;
      return;
    }
    list.innerHTML = competitions.map((c) => `
      <div class="member-row">
        <span>${SPORT_EMOJI[c.sport] || '🎲'}</span>
        <span class="grow">
          ${escapeHTML(c.label)}
          <div class="board-meta">${c.provider} · id ${escapeHTML(c.competitionId)}${c.season ? ` · saison ${escapeHTML(c.season)}` : ''} · ${c.daysAhead}j à l'avance${c.lastSyncAt ? ` · dernière sync ${new Date(c.lastSyncAt).toLocaleString('fr-FR')}` : ' · pas encore synchronisé'}</div>
        </span>
        <span class="pill ${c.enabled ? 'pill-open' : 'pill-cancelled'}">${c.enabled ? 'Actif' : 'Coupé'}</span>
        ${isAdmin ? `
          <button class="btn btn-ghost btn-small toggle-comp-btn" data-id="${c.id}" data-enabled="${c.enabled}">${c.enabled ? 'Couper' : 'Activer'}</button>
          <button class="btn btn-danger btn-small delete-comp-btn" data-id="${c.id}">Retirer</button>` : ''}
      </div>`).join('');

    document.querySelectorAll('.toggle-comp-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const enabled = btn.dataset.enabled !== 'true';
        try {
          await api(`/groups/${groupId}/competitions/${btn.dataset.id}`, { method: 'PATCH', body: { enabled } });
          loadCompetitions();
        } catch (err) { showError(err.message); }
      });
    });
    document.querySelectorAll('.delete-comp-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Retirer ce suivi ? Les paris déjà créés restent.')) return;
        try {
          await api(`/groups/${groupId}/competitions/${btn.dataset.id}`, { method: 'DELETE' });
          loadCompetitions();
        } catch (err) { showError(err.message); }
      });
    });
  } catch (err) { showError(err.message); }
}

document.getElementById('compForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api(`/groups/${groupId}/competitions`, {
      method: 'POST',
      body: {
        provider: document.getElementById('compProvider').value,
        competitionId: document.getElementById('compId').value,
        season: document.getElementById('compSeason').value || undefined,
        label: document.getElementById('compLabel').value,
        daysAhead: parseInt(document.getElementById('compDays').value, 10) || 7,
      },
    });
    document.getElementById('compForm').reset();
    document.getElementById('compDays').value = 7;
    showSuccess('Compétition suivie. Elle se remplira au prochain passage du cron (~1x/jour).');
    loadCompetitions();
  } catch (err) { showError(err.message); }
});

// ---------- init ----------
loadHeader();
loadBets();
