const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const UPPROMOTE_API_KEY = process.env.UPPROMOTE_API_KEY;

if (!UPPROMOTE_API_KEY) {
  console.warn('WARNING: UPPROMOTE_API_KEY is not set!');
}

app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function fetchReferrals(fromDate, toDate, page = 1) {
  const params = new URLSearchParams({
    page,
    per_page: 100,
    from_date: fromDate,
    to_date: toDate
  });

  const res = await fetch(`https://aff-api.uppromote.com/api/v2/referrals?${params}`, {
    headers: {
      'Authorization': UPPROMOTE_API_KEY,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Uppromote API error ${res.status}: ${text}`);
  }
  return res.json();
}

app.get('/api/dashboard', async (req, res) => {
  if (!UPPROMOTE_API_KEY) {
    return res.status(500).json({ error: 'UPPROMOTE_API_KEY not configured' });
  }

  try {
    const fromDate = '2026-06-17T00:00:00Z';
    const toDate   = '2026-06-24T23:59:59Z';

    let allReferrals = [];
    let page = 1;
    while (true) {
      const data = await fetchReferrals(fromDate, toDate, page);
      const items = data.data || [];
      allReferrals = allReferrals.concat(items);
      if (items.length < 100) break;
      page++;
    }

    const approved = allReferrals.filter(r => r.status === 'approved');
    const totalGMV = approved.reduce((sum, r) => sum + parseFloat(r.total_sales || 0), 0);

    const affiliateMap = {};
    for (const r of approved) {
      const aff = r.affiliate;
      if (!aff) continue;
      const key = aff.email;
      if (!affiliateMap[key]) {
        affiliateMap[key] = {
          name: `${aff.first_name} ${aff.last_name}`.trim() || aff.email,
          email: aff.email,
          gmv: 0,
          orders: 0
        };
      }
      affiliateMap[key].gmv += parseFloat(r.total_sales || 0);
      affiliateMap[key].orders += 1;
    }

    const ranking = Object.values(affiliateMap)
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 10)
      .map((a, i) => ({ rank: i + 1, ...a, gmv: Math.round(a.gmv * 100) / 100 }));

    res.json({
      totalGMV: Math.round(totalGMV * 100) / 100,
      goal: 3000,
      ranking,
      updatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
