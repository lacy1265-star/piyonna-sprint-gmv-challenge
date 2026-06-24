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

function maskName(name) {
  if (!name || name.trim() === '') return '***';
  const trimmed = name.trim();
  return trimmed.length <= 3 ? trimmed : trimmed.slice(0, 3) + '***';
}

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
    // 날짜를 URL 파라미터로 받을 수 있음
    // 예: /api/dashboard?from=2026-06-17&to=2026-06-23
    const fromDate = req.query.from
      ? `${req.query.from}T00:00:00Z`
      : `${process.env.CHALLENGE_FROM || '2026-06-17'}T00:00:00Z`;
    const toDate = req.query.to
      ? `${req.query.to}T23:59:59Z`
      : `${process.env.CHALLENGE_TO || '2026-06-23'}T23:59:59Z`;

    let allReferrals = [];
    let page = 1;
    while (true) {
      const data = await fetchReferrals(fromDate, toDate, page);
      const items = data.data || [];
      allReferrals = allReferrals.concat(items);
      if (items.length < 100) break;
      page++;
    }

    // approved + pending만 포함, denied/cancelled 제외
    // tracking_type이 "Manual" 또는 "Import"인 것도 제외
    const counted = allReferrals.filter(r => {
      if (r.status !== 'approved' && r.status !== 'pending') return false;
      const tt = (r.tracking_type || '').toLowerCase();
      if (tt.includes('manual') || tt.includes('import')) return false;
      return true;
    });

    const totalGMV = counted.reduce((sum, r) => sum + parseFloat(r.total_sales || 0), 0);

    const affiliateMap = {};
    for (const r of counted) {
      const aff = r.affiliate;
      if (!aff) continue;
      const key = aff.email;
      if (!affiliateMap[key]) {
        const firstName = maskName(aff.first_name || '');
        const lastName = maskName(aff.last_name || '');
        affiliateMap[key] = {
          name: `${firstName} ${lastName}`.trim(),
          gmv: 0,
          orders: 0
        };
      }
      affiliateMap[key].gmv += parseFloat(r.total_sales || 0);
      affiliateMap[key].orders += 1;
    }

    const ranking = Object.values(affiliateMap)
      .filter(a => a.gmv > 0)
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 10)
      .map((a, i) => ({ rank: i + 1, ...a, gmv: Math.round(a.gmv * 100) / 100 }));

    res.json({
      totalGMV: Math.round(totalGMV * 100) / 100,
      goal: 3000,
      ranking,
      fromDate,
      toDate,
      updatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
