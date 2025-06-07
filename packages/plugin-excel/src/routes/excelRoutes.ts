import { Route } from '@elizaos/core';
import fs from 'fs';
import path from 'path';

/**
 * Dynamically find the project root directory
 */
function findProjectRoot(): string {
    let currentDir = process.cwd();

    // Special case: if we're currently in packages/cli, go up two levels
    if (currentDir.endsWith('/packages/cli')) {
        const projectRoot = path.dirname(path.dirname(currentDir));
        console.log(`🔍 Found project root from packages/cli: ${projectRoot}`);
        return projectRoot;
    }

    // Walk up the directory tree to find the project root
    while (currentDir !== path.dirname(currentDir)) {
        // Check if this directory contains package.json and packages/cli
        const packageJsonPath = path.join(currentDir, 'package.json');
        const cliPackagePath = path.join(currentDir, 'packages', 'cli');

        if (fs.existsSync(packageJsonPath) && fs.existsSync(cliPackagePath)) {
            console.log(`🔍 Found project root: ${currentDir}`);
            return currentDir;
        }

        currentDir = path.dirname(currentDir);
    }

    // Final fallback: use current working directory
    console.log(`🔍 Using fallback project root: ${process.cwd()}`);
    return process.cwd();
}

export const excelRoutes: Route[] = [
    {
        type: 'GET',
        path: '/view/:sessionId',
        name: 'Chart Viewer',
        handler: async (req, res, runtime) => {
            try {
                const { sessionId } = req.params;

                // Read file relationships database
                const projectRoot = findProjectRoot();
                const cliRoot = path.join(projectRoot, 'packages/cli');
                const relationshipDbPath = path.join(cliRoot, 'file-relationships.json');

                if (!fs.existsSync(relationshipDbPath)) {
                    res.status(404).send('Chart not found');
                    return;
                }

                const relationships = JSON.parse(fs.readFileSync(relationshipDbPath, 'utf8'));
                const chartInfo = relationships[sessionId];

                if (!chartInfo || !chartInfo.html) {
                    res.status(404).send('Chart not found');
                    return;
                }

                // Serve the HTML file
                const chartDir = path.join(cliRoot, 'generated-html');
                const htmlPath = path.join(chartDir, chartInfo.html.fileName);

                if (!fs.existsSync(htmlPath)) {
                    res.status(404).send('Chart file not found');
                    return;
                }

                const htmlContent = fs.readFileSync(htmlPath, 'utf8');
                res.setHeader('Content-Type', 'text/html');
                res.send(htmlContent);
            } catch (error) {
                console.error('Error serving chart:', error);
                res.status(500).send('Internal server error');
            }
        }
    },
    {
        type: 'GET',
        path: '/gallery',
        name: 'Chart Gallery',
        public: true,
        handler: async (req, res, runtime) => {
            try {
                // Read file relationships database
                const projectRoot = findProjectRoot();
                const cliRoot = path.join(projectRoot, 'packages/cli');
                const relationshipDbPath = path.join(cliRoot, 'file-relationships.json');

                let relationships = {};
                if (fs.existsSync(relationshipDbPath)) {
                    relationships = JSON.parse(fs.readFileSync(relationshipDbPath, 'utf8'));
                }

                // Generate gallery HTML
                const galleryHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chart Gallery</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .chart-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .chart-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chart-card h3 { margin-top: 0; color: #333; }
        .chart-link { display: inline-block; background: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin-top: 10px; }
        .chart-link:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Chart Gallery</h1>
        <div class="chart-grid">
            ${Object.entries(relationships).map(([sessionId, info]) => {
                    const chartInfo = info as any;
                    return `
                <div class="chart-card">
                    <h3>Chart ${sessionId.substring(0, 8)}</h3>
                    <p><strong>Created:</strong> ${new Date(chartInfo.metadata?.createdAt || Date.now()).toLocaleString()}</p>
                    <p><strong>Data Rows:</strong> ${chartInfo.metadata?.dataRows || 'Unknown'}</p>
                    <p><strong>Chart Type:</strong> ${chartInfo.html?.chartType || 'Bar'}</p>
                    <a href="/view/${sessionId}" class="chart-link">View Chart</a>
                </div>
                `;
                }).join('')}
        </div>
        ${Object.keys(relationships).length === 0 ? '<p>No charts generated yet.</p>' : ''}
    </div>
</body>
</html>`;

                res.setHeader('Content-Type', 'text/html');
                res.send(galleryHtml);
            } catch (error) {
                console.error('Error serving gallery:', error);
                res.status(500).send('Internal server error');
            }
        }
    }
]; 