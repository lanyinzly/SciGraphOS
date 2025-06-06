import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// Chart generation route
router.post('/generate-chart', (req, res) => {
    try {
        const { data, chartType = 'bar', title = 'Chart' } = req.body;

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        // Generate chart HTML
        const chartId = `chart-${Date.now()}`;
        const chartHtml = generateChartHtml(data, chartType, title, chartId);

        // Save chart to file - use correct data directory
        const chartsDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(chartsDir)) {
            fs.mkdirSync(chartsDir, { recursive: true });
        }

        const chartFile = path.join(chartsDir, `${chartId}.html`);
        fs.writeFileSync(chartFile, chartHtml);

        res.json({
            success: true,
            chartId,
            url: `/charts/${chartId}`,
            file: chartFile
        });

    } catch (error) {
        console.error('Chart generation error:', error);
        res.status(500).json({ error: 'Failed to generate chart' });
    }
});

// Serve generated charts
router.get('/charts/:chartId', (req, res) => {
    try {
        const { chartId } = req.params;
        const chartFile = path.join(process.cwd(), 'data', `${chartId}.html`);

        if (!fs.existsSync(chartFile)) {
            return res.status(404).json({ error: 'Chart not found' });
        }

        const chartHtml = fs.readFileSync(chartFile, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.send(chartHtml);

    } catch (error) {
        console.error('Chart serving error:', error);
        res.status(500).json({ error: 'Failed to serve chart' });
    }
});

// List available charts
router.get('/charts', (req, res) => {
    try {
        const chartsDir = path.join(process.cwd(), 'data');

        if (!fs.existsSync(chartsDir)) {
            return res.json({ charts: [] });
        }

        const files = fs.readdirSync(chartsDir)
            .filter(file => file.endsWith('.html') && file.startsWith('chart-'))
            .map(file => {
                const chartId = file.replace('.html', '');
                const filePath = path.join(chartsDir, file);
                const stats = fs.statSync(filePath);

                return {
                    id: chartId,
                    url: `/charts/${chartId}`,
                    created: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.created.getTime() - a.created.getTime());

        res.json({ charts: files });

    } catch (error) {
        console.error('Charts listing error:', error);
        res.status(500).json({ error: 'Failed to list charts' });
    }
});

function generateChartHtml(data, chartType, title, chartId) {
    const labels = data.map(item => item.label || item.name || item.x || 'Unknown');
    const values = data.map(item => item.value || item.y || item.count || 0);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }
        #chartContainer {
            position: relative;
            height: 400px;
            margin-bottom: 20px;
        }
        .info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
        }
        .info h3 {
            margin-top: 0;
            color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        <div id="chartContainer">
            <canvas id="${chartId}"></canvas>
        </div>
        <div class="info">
            <h3>Chart Information</h3>
            <p><strong>Type:</strong> ${chartType}</p>
            <p><strong>Data Points:</strong> ${data.length}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
    </div>

    <script>
        const ctx = document.getElementById('${chartId}').getContext('2d');
        const chart = new Chart(ctx, {
            type: '${chartType}',
            data: {
                labels: ${JSON.stringify(labels)},
                datasets: [{
                    label: '${title}',
                    data: ${JSON.stringify(values)},
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 205, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                        'rgba(255, 159, 64, 0.8)',
                        'rgba(199, 199, 199, 0.8)',
                        'rgba(83, 102, 255, 0.8)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 205, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(199, 199, 199, 1)',
                        'rgba(83, 102, 255, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: '${title}'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}

export default router; 