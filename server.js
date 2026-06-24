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

app.get('/api/dashboard', (req, res) => {
  const goal = 3000;

  // MANUAL_GMV: 총 GMV 숫자
  // 예: 245.50
  const totalGMV = parseFloat(process.env.MANUAL_GMV || '0');

  // MANUAL_RANKING: 이름:금액 쉼표로 구분
  // 예: Giovanni B***:58.84,Jasmine G***:33.47,Marco F***:25.45
  const rankingRaw = process.env.MANUAL_RANKING || '';
  const ranking = rankingRaw
    .split(',')
    .map(item => item.trim())
    .filter(item => item.includes(':'))
    .map((item, i) => {
      const lastColon = item.lastIndexOf(':');
      const name = item.slice(0, lastColon).trim();
      const gmv = parseFloat(item.slice(lastColon + 1).trim()) || 0;
      return { rank: i + 1, name, gmv };
    })
    .filter(a => a.gmv > 0);

  res.json({
    totalGMV,
    goal,
    ranking,
    updatedAt: new Date().toISOString()
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
