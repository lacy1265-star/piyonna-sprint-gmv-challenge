const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const UPPROMOTE_API_KEY = process.env.UPPROMOTE_API_KEY;

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Uppromote API helper
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

  if (!res.ok) throw new Error(`Uppromote API error: ${res.status}`);
  return res.json();
}

// /api/dashboard — GMV + ranking
app.get('/api/dashboard', async (req, res) => {
  try {
    const fromDate = '2026-06-24T00:00:00Z';
    const toDate   = '2026-06-30T23:59:59Z';

    // Fetch all pages
    let allReferrals = [];
    let page = 1;
    while (true) {
      const data = await fetchReferrals(fromDate, toDate, page);
      const items = data.data || [];
      allReferrals = allReferrals.concat(items);
      if (items.length < 100) break;
      page++;
    }

    // Only count approved referrals
    const approved = allReferrals.filter(r => r.status === 'approved');

    // Total GMV
    const totalGMV = approved.reduce((sum, r) => sum + parseFloat(r.total_sales || 0), 0);

    // Per-affiliate GMV
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

    // Ranking (top 10)
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
