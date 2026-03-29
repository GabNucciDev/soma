import { supabase } from './supabase.js';

const state = {
  session: null,
  user: null,
  profile: null,
  households: [],
  activeHouseholdId: null,
  categories: [],
  budgets: [],
  transactions: [],
  selectedMonth: getCurrentMonth(),
};

const el = {
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  authMessage: document.getElementById('authMessage'),
  appMessage: document.getElementById('appMessage'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  signupName: document.getElementById('signupName'),
  signupCurrency: document.getElementById('signupCurrency'),
  signupEmail: document.getElementById('signupEmail'),
  signupPassword: document.getElementById('signupPassword'),
  currentUserName: document.getElementById('currentUserName'),
  currentUserEmail: document.getElementById('currentUserEmail'),
  selectedMonth: document.getElementById('selectedMonth'),
  householdName: document.getElementById('householdName'),
  joinHouseholdId: document.getElementById('joinHouseholdId'),
  householdList: document.getElementById('householdList'),
  categoryName: document.getElementById('categoryName'),
  categoryScope: document.getElementById('categoryScope'),
  categoryCurrency: document.getElementById('categoryCurrency'),
  budgetAmount: document.getElementById('budgetAmount'),
  txDate: document.getElementById('txDate'),
  txCategory: document.getElementById('txCategory'),
  txAmount: document.getElementById('txAmount'),
  txCurrency: document.getElementById('txCurrency'),
  txDescription: document.getElementById('txDescription'),
  totalBudget: document.getElementById('totalBudget'),
  totalSpent: document.getElementById('totalSpent'),
  totalRemaining: document.getElementById('totalRemaining'),
  totalCategories: document.getElementById('totalCategories'),
  budgetsTable: document.getElementById('budgetsTable'),
  transactionsTable: document.getElementById('transactionsTable'),
};

bindEvents();
boot();

async function boot() {
  el.selectedMonth.value = state.selectedMonth;
  el.txDate.value = getToday();

  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  if (state.session?.user) {
    await hydrateUser(data.session.user);
    await loadAll();
    renderApp();
  } else {
    renderAuth();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session?.user) {
      await hydrateUser(session.user);
      await loadAll();
      renderApp();
    } else {
      resetStateAfterLogout();
      renderAuth();
    }
  });
}

function bindEvents() {
  document.getElementById('btnLogin').addEventListener('click', login);
  document.getElementById('btnSignup').addEventListener('click', signup);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnCreateHousehold').addEventListener('click', createHousehold);
  document.getElementById('btnJoinHousehold').addEventListener('click', joinHousehold);
  document.getElementById('btnCreateCategory').addEventListener('click', createCategoryAndBudget);
  document.getElementById('btnAddTransaction').addEventListener('click', addTransaction);
  el.selectedMonth.addEventListener('change', async (e) => {
    state.selectedMonth = e.target.value;
    await loadBudgetsAndTransactions();
    renderDashboard();
  });
}

async function signup() {
  clearMessages();

  const full_name = el.signupName.value.trim();
  const default_currency = el.signupCurrency.value;
  const email = el.signupEmail.value.trim();
  const password = el.signupPassword.value.trim();

  if (!full_name || !email || !password) {
    showAuthMessage('Preencha nome, email e senha.', 'error');
    return;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, default_currency },
    },
  });

  if (error) {
    showAuthMessage(error.message, 'error');
    return;
  }

  showAuthMessage('Conta criada. Se a confirmação de email estiver desligada no Supabase, você já pode entrar.', 'success');
}

async function login() {
  clearMessages();

  const email = el.loginEmail.value.trim();
  const password = el.loginPassword.value.trim();

  if (!email || !password) {
    showAuthMessage('Preencha email e senha.', 'error');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showAuthMessage(error.message, 'error');
  }
}

async function logout() {
  await supabase.auth.signOut();
}

async function hydrateUser(user) {
  state.user = user;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    showAppMessage('Não foi possível carregar o perfil.', 'error');
    return;
  }

  state.profile = data;
}

async function loadAll() {
  await loadHouseholds();
  await loadBudgetsAndTransactions();
}

async function loadHouseholds() {
  const { data, error } = await supabase
    .from('household_members')
    .select(`
      household_id,
      role,
      households:household_id (
        id,
        name
      )
    `)
    .order('created_at', { ascending: true });

  if (error) {
    showAppMessage('Não foi possível carregar as casas do usuário.', 'error');
    return;
  }

  state.households = (data || []).map(item => ({
    household_id: item.household_id,
    role: item.role,
    name: item.households?.name || 'Casa sem nome',
  }));

  if (!state.activeHouseholdId && state.households.length > 0) {
    state.activeHouseholdId = state.households[0].household_id;
  }
}

async function loadBudgetsAndTransactions() {
  if (!state.activeHouseholdId) {
    state.categories = [];
    state.budgets = [];
    state.transactions = [];
    return;
  }

  const firstDay = `${state.selectedMonth}-01`;
  const lastDay = getLastDayOfMonth(state.selectedMonth);

  const [categoriesRes, budgetsRes, transactionsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('household_id', state.activeHouseholdId)
      .eq('is_active', true)
      .order('name', { ascending: true }),

    supabase
      .from('monthly_budgets')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          scope,
          owner_user_id
        )
      `)
      .eq('household_id', state.activeHouseholdId)
      .eq('year_month', firstDay)
      .order('created_at', { ascending: true }),

    supabase
      .from('transactions')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          scope,
          owner_user_id
        )
      `)
      .eq('household_id', state.activeHouseholdId)
      .gte('occurred_on', firstDay)
      .lte('occurred_on', lastDay)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (categoriesRes.error) showAppMessage(categoriesRes.error.message, 'error');
  if (budgetsRes.error) showAppMessage(budgetsRes.error.message, 'error');
  if (transactionsRes.error) showAppMessage(transactionsRes.error.message, 'error');

  state.categories = categoriesRes.data || [];
  state.budgets = budgetsRes.data || [];
  state.transactions = transactionsRes.data || [];
}

async function createHousehold() {
  clearMessages();

  const name = el.householdName.value.trim();
  if (!name) {
    showAppMessage('Digite o nome da casa.', 'error');
    return;
  }

  const { data: houseData, error: houseError } = await supabase
    .from('households')
    .insert([{ name }])
    .select()
    .single();

  if (houseError) {
    showAppMessage(houseError.message, 'error');
    return;
  }

  const { error: memberError } = await supabase
    .from('household_members')
    .insert([
      {
        household_id: houseData.id,
        user_id: state.user.id,
        role: 'owner',
      },
    ]);

  if (memberError) {
    showAppMessage(memberError.message, 'error');
    return;
  }

  state.activeHouseholdId = houseData.id;
  el.householdName.value = '';

  await loadAll();
  renderApp();
  showAppMessage(`Casa criada com sucesso. ID da casa: ${houseData.id}`, 'success');
}

async function joinHousehold() {
  clearMessages();

  const householdId = el.joinHouseholdId.value.trim();
  if (!householdId) {
    showAppMessage('Cole o Household ID para entrar na casa.', 'error');
    return;
  }

  const { error } = await supabase
    .from('household_members')
    .insert([
      {
        household_id: householdId,
        user_id: state.user.id,
        role: 'member',
      },
    ]);

  if (error) {
    showAppMessage(error.message, 'error');
    return;
  }

  state.activeHouseholdId = householdId;
  el.joinHouseholdId.value = '';

  await loadAll();
  renderApp();
  showAppMessage('Você entrou na casa com sucesso.', 'success');
}

async function createCategoryAndBudget() {
  clearMessages();

  if (!state.activeHouseholdId) {
    showAppMessage('Crie ou entre em uma casa antes.', 'error');
    return;
  }

  const name = el.categoryName.value.trim();
  const scope = el.categoryScope.value;
  const currency = el.categoryCurrency.value;
  const budgetAmount = parseCurrencyInput(el.budgetAmount.value);

  if (!name) {
    showAppMessage('Digite o nome da categoria.', 'error');
    return;
  }

  if (Number.isNaN(budgetAmount) || budgetAmount < 0) {
    showAppMessage('Digite um limite mensal válido.', 'error');
    return;
  }

  const owner_user_id = scope === 'personal' ? state.user.id : null;
  const year_month = `${state.selectedMonth}-01`;

  const { data: categoryData, error: categoryError } = await supabase
    .from('categories')
    .insert([
      {
        household_id: state.activeHouseholdId,
        owner_user_id,
        name,
        scope,
      },
    ])
    .select()
    .single();

  if (categoryError) {
    showAppMessage(categoryError.message, 'error');
    return;
  }

  const { error: budgetError } = await supabase
    .from('monthly_budgets')
    .insert([
      {
        household_id: state.activeHouseholdId,
        category_id: categoryData.id,
        owner_user_id,
        year_month,
        amount: budgetAmount,
        currency,
      },
    ]);

  if (budgetError) {
    showAppMessage(budgetError.message, 'error');
    return;
  }

  el.categoryName.value = '';
  el.budgetAmount.value = '';

  await loadBudgetsAndTransactions();
  renderDashboard();
  showAppMessage('Categoria e limite mensal criados com sucesso.', 'success');
}

async function addTransaction() {
  clearMessages();

  if (!state.activeHouseholdId) {
    showAppMessage('Crie ou entre em uma casa antes.', 'error');
    return;
  }

  const occurred_on = el.txDate.value;
  const category_id = el.txCategory.value;
  const amount = parseCurrencyInput(el.txAmount.value);
  const currency = el.txCurrency.value;
  const description = el.txDescription.value.trim();

  if (!occurred_on || !category_id || Number.isNaN(amount) || amount <= 0) {
    showAppMessage('Preencha data, categoria e valor válido.', 'error');
    return;
  }

  const { error } = await supabase
    .from('transactions')
    .insert([
      {
        household_id: state.activeHouseholdId,
        owner_user_id: state.user.id,
        category_id,
        occurred_on,
        amount,
        currency,
        description,
      },
    ]);

  if (error) {
    showAppMessage(error.message, 'error');
    return;
  }

  el.txAmount.value = '';
  el.txDescription.value = '';

  await loadBudgetsAndTransactions();
  renderDashboard();
  showAppMessage('Gasto lançado com sucesso.', 'success');
}

function renderAuth() {
  el.authView.hidden = false;
  el.appView.hidden = true;
}

function renderApp() {
  el.authView.hidden = true;
  el.appView.hidden = false;

  el.currentUserName.textContent = state.profile?.full_name || 'Usuário';
  el.currentUserEmail.textContent = state.user?.email || '';
  renderHouseholds();
  renderCategoryOptions();
  renderDashboard();
}

function renderHouseholds() {
  el.householdList.innerHTML = '';

  if (state.households.length === 0) {
    el.householdList.innerHTML = '<div class="empty-state">Você ainda não faz parte de nenhuma casa.</div>';
    return;
  }

  state.households.forEach((item) => {
    const button = document.createElement('button');
    button.className = `household-chip ${item.household_id === state.activeHouseholdId ? 'active' : ''}`;
    button.textContent = `${item.name} (${item.role})`;
    button.addEventListener('click', async () => {
      state.activeHouseholdId = item.household_id;
      await loadBudgetsAndTransactions();
      renderApp();
    });
    el.householdList.appendChild(button);
  });
}

function renderCategoryOptions() {
  const options = ['<option value="">Selecione</option>'];

  state.categories.forEach((category) => {
    options.push(`<option value="${category.id}">${escapeHtml(category.name)}</option>`);
  });

  el.txCategory.innerHTML = options.join('');
}

function renderDashboard() {
  const currentCurrency = state.profile?.default_currency || 'BRL';

  const budgetRows = state.budgets.map((budget) => {
    const spent = state.transactions
      .filter((tx) => tx.category_id === budget.category_id)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

    const remaining = Math.max(Number(budget.amount) - spent, 0);
    const percent = Number(budget.amount) === 0 ? 0 : (spent / Number(budget.amount)) * 100;

    return {
      category: budget.categories?.name || 'Sem categoria',
      scope: budget.categories?.scope || 'personal',
      currency: budget.currency,
      budget: Number(budget.amount),
      spent,
      remaining,
      percent,
    };
  });

  const sameCurrencyRows = budgetRows.filter(row => row.currency === currentCurrency);
  const totalBudget = sameCurrencyRows.reduce((sum, row) => sum + row.budget, 0);
  const totalSpent = state.transactions
    .filter(tx => tx.currency === currentCurrency)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const totalRemaining = Math.max(totalBudget - totalSpent, 0);

  el.totalBudget.textContent = formatMoney(totalBudget, currentCurrency);
  el.totalSpent.textContent = formatMoney(totalSpent, currentCurrency);
  el.totalRemaining.textContent = formatMoney(totalRemaining, currentCurrency);
  el.totalCategories.textContent = String(budgetRows.length);

  renderBudgetsTable(budgetRows);
  renderTransactionsTable();
}

function renderBudgetsTable(rows) {
  if (rows.length === 0) {
    el.budgetsTable.innerHTML = '<div class="empty-state">Nenhum limite mensal cadastrado para este mês.</div>';
    return;
  }

  const html = [`
    <table>
      <thead>
        <tr>
          <th>Categoria</th>
          <th>Tipo</th>
          <th>Limite</th>
          <th>Gasto</th>
          <th>Saldo</th>
          <th>Uso</th>
        </tr>
      </thead>
      <tbody>
  `];

  rows.forEach((row) => {
    html.push(`
      <tr>
        <td>${escapeHtml(row.category)}</td>
        <td>${row.scope === 'shared' ? 'Compartilhada' : 'Pessoal'}</td>
        <td>${formatMoney(row.budget, row.currency)}</td>
        <td>${formatMoney(row.spent, row.currency)}</td>
        <td>${formatMoney(row.remaining, row.currency)}</td>
        <td>${row.percent.toFixed(1)}%</td>
      </tr>
    `);
  });

  html.push('</tbody></table>');
  el.budgetsTable.innerHTML = html.join('');
}

function renderTransactionsTable() {
  if (state.transactions.length === 0) {
    el.transactionsTable.innerHTML = '<div class="empty-state">Nenhum gasto lançado neste mês.</div>';
    return;
  }

  const html = [`
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Categoria</th>
          <th>Descrição</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
  `];

  state.transactions.forEach((tx) => {
    html.push(`
      <tr>
        <td>${formatDate(tx.occurred_on)}</td>
        <td>${escapeHtml(tx.categories?.name || 'Sem categoria')}</td>
        <td>${escapeHtml(tx.description || '-')}</td>
        <td>${formatMoney(Number(tx.amount), tx.currency)}</td>
      </tr>
    `);
  });

  html.push('</tbody></table>');
  el.transactionsTable.innerHTML = html.join('');
}

function formatMoney(value, currency) {
  return new Intl.NumberFormat(currency === 'EUR' ? 'pt-PT' : 'pt-BR', {
    style: 'currency',
    currency,
  }).format(Number(value || 0));
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split('-');
  return `${d}/${m}/${y}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getLastDayOfMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const last = new Date(year, month, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, '0');
  const d = String(last.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseCurrencyInput(value) {
  if (!value) return NaN;
  const raw = String(value).trim().replace(/[^0-9,.-]/g, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  let normalized = raw;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    normalized = raw.replace(',', '.');
  }

  return Number(normalized);
}

function clearMessages() {
  el.authMessage.innerHTML = '';
  el.appMessage.innerHTML = '';
}

function showAuthMessage(message, type = 'info') {
  el.authMessage.innerHTML = `<div class="message ${type}">${escapeHtml(message)}</div>`;
}

function showAppMessage(message, type = 'info') {
  el.appMessage.innerHTML = `<div class="message ${type}">${escapeHtml(message)}</div>`;
}

function resetStateAfterLogout() {
  state.user = null;
  state.profile = null;
  state.households = [];
  state.activeHouseholdId = null;
  state.categories = [];
  state.budgets = [];
  state.transactions = [];
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
