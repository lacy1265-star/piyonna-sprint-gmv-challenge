const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const SHEET_ID = '1iyCMN7DoEh9yIeXYRREdlb3E8Gj3ZuwzO49WfM_4RDw';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1`;

function maskName(fullName) {
  if (!fullName || fullName.trim() === '') return '***';
  const parts = fullName.trim().split(' ');
  return parts.map(part => {
    if (part.length <= 3) return part;
    return part.slice(0, 3) + '***';
  }).join(' ');
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const response = await fetch(SHEET_URL);
    const csv = await response.text();

    const lines = csv.trim().split('\n');
    const headers = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());

    const nameIdx = headers.indexOf('name');
    const gmvIdx = headers.indexOf('gmv');

    if (nameIdx === -1 || gmvIdx === -1) {
      return res.status(500).json({ error: 'name 또는 gmv 컬럼을 찾을 수 없어요' });
    }

    const affiliateMap = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].replace(/"/g, '').split(',').map(c => c.trim());
      const name = cols[nameIdx];
      const gmv = parseFloat(cols[gmvIdx]) || 0;
      if (!name || gmv <= 0) continue;

      if (!affiliateMap[name]) {
        affiliateMap[name] = { name, gmv: 0 };
      }
      affiliateMap[name].gmv += gmv;
    }

    const ranking = Object.values(affiliateMap)
      .filter(a => a.gmv > 0)
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 10)
      .map((a, i) => ({
        rank: i + 1,
        name: maskName(a.name),
        gmv: Math.round(a.gmv * 100) / 100
      }));

    const totalGMV = Math.round(ranking.reduce((sum, a) => sum + a.gmv, 0) * 100) / 100;

    res.json({
      totalGMV,
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
